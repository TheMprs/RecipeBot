package recipeBot;

import recipeBot.database.SupabaseHandler;
import io.javalin.Javalin;
import io.javalin.http.Context;
import io.github.cdimascio.dotenv.Dotenv;
import com.google.gson.JsonObject;
import com.google.gson.Gson;

public class webManager {
    private final SupabaseHandler db;
    private final GeminiHandler gemini;
    private final LinkTokenStore tokenStore;
    private final Dotenv dotenv = Dotenv.load();
    private final Gson gson = new Gson();

    // Scrape rate limits — protect the shared Gemini free-tier quota (keeps the project at $0).
    // ponytail: in-memory, per-instance, resets on restart, UTC day boundary (~ Gemini's Pacific
    // reset). Counts every scrape attempt, not just Gemini fallbacks — an upper bound, so we may
    // stop a little early but never exceed the Gemini ceiling. Move to a shared store only if scaled out.
    private static final int PER_MIN = 10;            // per-user burst guard
    private static final long MIN_WINDOW_MS = 60_000;
    private static final int USER_PER_DAY = 15;       // per-user fairness cap
    private static final int GLOBAL_PER_DAY = 800;    // hard ceiling under the ~1000/day free tier
    private final java.util.Map<String, long[]> minHits = new java.util.HashMap<>(); // userId -> {windowStart, count}
    private final java.util.Map<String, long[]> dayHits = new java.util.HashMap<>(); // userId -> {dayIdx, count}
    private final long[] globalDay = {0, 0};                                         // {dayIdx, count}

    public webManager(SupabaseHandler db, LinkTokenStore tokenStore) {
        this.db = db;
        this.tokenStore = tokenStore;
        this.gemini = new GeminiHandler(dotenv.get("GEMINI_API_KEY"));
    }

    public void registerRoutes(Javalin app) {
        app.post("/api/recipes/scrape", this::scrapeRecipeFromUrl);
        app.post("/api/link", this::linkTelegramAccount);
        app.delete("/api/account", this::deleteAccount);
    }

    // Validates the Authorization header and returns the user's UUID,
    // or null after setting a 401 response.
    private String requireUser(Context ctx) {
        String authHeader = ctx.header("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            ctx.status(401).result("Missing Authorization header");
            return null;
        }
        String userId = db.getUserIdFromJwt(authHeader.substring(7));
        if (userId == null) {
            ctx.status(401).result("Invalid or expired session");
        }
        return userId;
    }

    // Returns a 429 message if the user is over any scrape limit, else null.
    // Counters are committed only when the call is allowed. One lock — scraping is low-frequency.
    private synchronized String scrapeLimitReason(String userId) {
        long now = System.currentTimeMillis();
        long day = now / 86_400_000L;

        long[] m = minHits.get(userId);
        boolean sameMin = m != null && now - m[0] < MIN_WINDOW_MS;
        if (sameMin && m[1] >= PER_MIN) return "Too many imports, slow down and try again in a minute.";

        long[] d = dayHits.get(userId);
        boolean sameDay = d != null && d[0] == day;
        if (sameDay && d[1] >= USER_PER_DAY) return "Daily import limit reached, try again tomorrow.";

        boolean globalSameDay = globalDay[0] == day;
        if (globalSameDay && globalDay[1] >= GLOBAL_PER_DAY) return "Imports are temporarily unavailable, try again later.";

        // all clear — commit
        if (sameMin) m[1]++; else minHits.put(userId, new long[]{now, 1});
        if (sameDay) d[1]++; else dayHits.put(userId, new long[]{day, 1});
        if (globalSameDay) globalDay[1]++; else { globalDay[0] = day; globalDay[1] = 1; }
        return null;
    }

    public void linkTelegramAccount(Context ctx) {
        String userId = requireUser(ctx);
        if (userId == null) return;

        JsonObject body = gson.fromJson(ctx.body(), JsonObject.class);
        if (body == null || !body.has("token")) {
            ctx.status(400).result("Missing token");
            return;
        }

        Long chatId = tokenStore.consume(body.get("token").getAsString());
        if (chatId == null) {
            ctx.status(400).result("Invalid or expired link token");
            return;
        }

        db.linkTelegramUser(chatId, userId);
        ctx.result("Account linked successfully");
    }

    public void deleteAccount(Context ctx) {
        String userId = requireUser(ctx);
        if (userId == null) return;
        boolean ok = db.deleteAccount(userId);
        if (ok) {
            ctx.status(204);
        } else {
            ctx.status(500).result("Failed to delete account");
        }
    }

    public void scrapeRecipeFromUrl(Context ctx) {
        try {
            String userId = requireUser(ctx);
            if (userId == null) return;
            if (!db.canScrape(userId)) {
                ctx.status(403).result("Not permitted to use URL import");
                return;
            }
            String limited = scrapeLimitReason(userId);
            if (limited != null) {
                ctx.status(429).result(limited);
                return;
            }

            String url = ctx.body();
            if (url == null || url.trim().isEmpty()) {
                ctx.status(400).result("URL is required");
                return;
            }

            Recipe extractedRecipe;
            try {
                extractedRecipe = UrlFetcher.fetchRecipe(url, gemini);
            } catch (Exception e) {
                ctx.status(400).result(e.getMessage());
                return;
            }

            if (extractedRecipe != null && extractedRecipe.getName() != null) {
                ctx.json(extractedRecipe);
            } else {
                ctx.status(400).result("Failed to extract recipe from the URL content");
            }
        } catch (Exception e) {
            e.printStackTrace();
            ctx.status(500).result("Error: " + e.getMessage());
        }
    }

}

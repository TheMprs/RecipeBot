package recipeBot;

import recipeBot.database.SupabaseHandler;
import io.javalin.Javalin;
import io.javalin.http.Context;
import io.github.cdimascio.dotenv.Dotenv;
import com.google.gson.JsonObject;
import com.google.gson.Gson;

public class webManager {
    private final SupabaseHandler db;
    private final ScrapeService scrapeService;
    private final LinkTokenStore tokenStore;
    private final Dotenv dotenv = Dotenv.load();
    private final Gson gson = new Gson();

    // Per-IP request cap across all /api routes, checked before the JWT round-trip
    // so unauthenticated floods get bounced cheaply (they never reach Supabase or a
    // worker-blocking call). Fixed 1-minute window, in-memory, per-instance (resets on
    // restart). ponytail: single global map + lock — fine for one VM; move to a shared
    // store only if scaled out. Stale entries purged opportunistically to bound memory.
    private static final int IP_PER_MIN = 60;
    private static final long IP_WINDOW_MS = 60_000;
    private final java.util.Map<String, long[]> ipHits = new java.util.HashMap<>(); // ip -> {windowStart, count}

    public webManager(SupabaseHandler db, LinkTokenStore tokenStore, ScrapeService scrapeService) {
        this.db = db;
        this.tokenStore = tokenStore;
        this.scrapeService = scrapeService;
    }

    public void registerRoutes(Javalin app) {
        app.post("/api/recipes/scrape", this::scrapeRecipeFromUrl);
        app.post("/api/link", this::linkTelegramAccount);
        app.delete("/api/account", this::deleteAccount);
    }

    // Validates the Authorization header and returns the user's UUID,
    // or null after setting a 401 (or 429 if rate-limited) response.
    private String requireUser(Context ctx) {
        if (rateLimited(clientIp(ctx))) {
            ctx.status(429).result("Too many requests, slow down.");
            return null;
        }
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

    // Real client IP. All traffic arrives via Caddy on localhost, which appends the
    // client IP to X-Forwarded-For, so the LAST entry is the one Caddy set — spoof-
    // resistant (any earlier entries are attacker-supplied). Falls back to the socket
    // IP for direct/local calls with no forwarded header.
    private String clientIp(Context ctx) {
        String xff = ctx.header("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            String[] parts = xff.split(",");
            return parts[parts.length - 1].trim();
        }
        return ctx.ip();
    }

    // True if this IP is over the per-minute cap (and commits the hit otherwise).
    private synchronized boolean rateLimited(String ip) {
        long now = System.currentTimeMillis();
        // Opportunistic purge so the map can't grow without bound under IP churn.
        if (ipHits.size() > 10_000) ipHits.entrySet().removeIf(e -> now - e.getValue()[0] >= IP_WINDOW_MS);

        long[] h = ipHits.get(ip);
        if (h == null || now - h[0] >= IP_WINDOW_MS) {
            ipHits.put(ip, new long[]{now, 1});
            return false;
        }
        if (h[1] >= IP_PER_MIN) return true;
        h[1]++;
        return false;
    }

    public void linkTelegramAccount(Context ctx) {
        String userId = requireUser(ctx);
        if (userId == null) return;

        // Malformed JSON or a non-string token is a client error, not a 500.
        String token;
        try {
            JsonObject body = gson.fromJson(ctx.body(), JsonObject.class);
            token = body.get("token").getAsString();
        } catch (Exception e) {
            ctx.status(400).result("Missing token");
            return;
        }

        Long chatId = tokenStore.consume(token);
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
            try {
                ctx.json(scrapeService.scrape(userId, ctx.body()));
            } catch (ScrapeService.ScrapeException e) {
                ctx.status(e.status).result(e.getMessage());
            }
        } catch (Exception e) {
            // Log the detail server-side; never echo internal exception text to the client.
            e.printStackTrace();
            ctx.status(500).result("Internal error");
        }
    }

}

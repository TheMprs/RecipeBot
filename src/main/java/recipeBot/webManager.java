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

            String url = ctx.body();
            if (url == null || url.trim().isEmpty()) {
                ctx.status(400).result("URL is required");
                return;
            }

            String rawText;
            try {
                rawText = UrlFetcher.fetch(url);
            } catch (Exception e) {
                ctx.status(400).result(e.getMessage());
                return;
            }
            if (rawText.isEmpty()) {
                ctx.status(400).result("Failed to fetch content from URL");
                return;
            }

            Recipe extractedRecipe = gemini.extractRecipeFromText(rawText);
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

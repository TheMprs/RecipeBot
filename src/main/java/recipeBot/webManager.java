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
        app.get("/api/recipes/{name}/share", this::getShareableRecipe);
        app.post("/api/link", this::linkTelegramAccount);
    }

    public void getShareableRecipe(Context ctx) {
        String name = ctx.pathParam("name");
        Recipe recipe = db.getRecipeByName(name);
        if (recipe != null) {
            ctx.contentType("text/plain").result(recipe.toString());
        } else {
            ctx.status(404).result("Recipe not found");
        }
    }

    public void linkTelegramAccount(Context ctx) {
        String authHeader = ctx.header("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            ctx.status(401).result("Missing Authorization header");
            return;
        }
        String jwt = authHeader.substring(7);

        String userId = db.getUserIdFromJwt(jwt);
        if (userId == null) {
            ctx.status(401).result("Invalid or expired session");
            return;
        }

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

    public void scrapeRecipeFromUrl(Context ctx) {
        try {
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

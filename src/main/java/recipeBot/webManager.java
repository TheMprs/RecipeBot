package recipeBot;

import recipeBot.database.SupabaseHandler;
import io.javalin.Javalin;
import io.javalin.http.Context;
import io.github.cdimascio.dotenv.Dotenv;

public class webManager {
    private final SupabaseHandler db;
    private final GeminiHandler gemini;
    private final Dotenv dotenv = Dotenv.load();

    public webManager(SupabaseHandler db) {
        this.db = db;
        this.gemini = new GeminiHandler(dotenv.get("GEMINI_API_KEY"));
    }

    public void registerRoutes(Javalin app) {
        app.post("/api/recipes/scrape", this::scrapeRecipeFromUrl);
        app.get("/api/recipes/{name}/share", this::getShareableRecipe);
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

    public void scrapeRecipeFromUrl(Context ctx) {
        try {
            String url = ctx.body();
            if (url == null || url.trim().isEmpty()) {
                ctx.status(400).result("URL is required");
                return;
            }

            String rawText = extractTextFromUrl(url);
            if (rawText == null || rawText.isEmpty()) {
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

    private String extractTextFromUrl(String url) {
        try {
            return org.jsoup.Jsoup.connect(url)
                    .userAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                    .referrer("http://www.google.com")
                    .header("Accept-Language", "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7")
                    .timeout(10000)
                    .get()
                    .text();
        } catch (Exception e) {
            e.printStackTrace();
            return null;
        }
    }
}

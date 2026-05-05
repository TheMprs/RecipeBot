package recipeBot;

import recipeBot.database.DatabaseHandler;
import io.javalin.Javalin;
import io.javalin.http.Context;
import io.github.cdimascio.dotenv.Dotenv;

public class webManager {
    private final DatabaseHandler db;
    private final GeminiHandler gemini;
    private final Dotenv dotenv = Dotenv.load();

    public webManager(DatabaseHandler db) {
        this.db = db;
        this.gemini = new GeminiHandler(dotenv.get("GEMINI_API_KEY"));
    }

    public void registerRoutes(Javalin app) {
        app.get("/api/recipes", this::getAllRecipes);
        app.get("/api/recipes/{name}", this::getOneRecipe);
        app.post("/api/recipes", this::addRecipe);
        app.put("/api/recipes/{name}", this::updateRecipe);
        app.delete("/api/recipes/{name}", this::deleteRecipe);
        app.post("/api/recipes/scrape", this::scrapeRecipeFromUrl);
    }

    public void getAllRecipes(Context ctx) {
        // This method will be called by the web server to get all recipes from the database
        ctx.json(db.getAllRecipeNames());    
    }

    public void getOneRecipe(Context ctx) {
        // This method will be called by the web server to get a single recipe from the database
        String name = ctx.pathParam("name");
        Recipe recipe = db.getRecipeByName(name);
        if (recipe != null) {
            ctx.json(recipe);
        } else {
            ctx.status(404).result("Recipe not found");
        }
    }

    public void addRecipe(Context ctx) {
        try {
            // Convert the JSON from React directly into a Java Recipe object
            Recipe newRecipe = ctx.bodyAsClass(Recipe.class); 
            
            db.addRecipe(newRecipe);
            ctx.status(201).result("Recipe added successfully");
        } catch (Exception e) {
            e.printStackTrace();
            ctx.status(400).result("Invalid request data: " + e.getMessage());
        }
    }

    public void updateRecipe(Context ctx) {
        try {
            String oldName = ctx.pathParam("name");
            Recipe updatedRecipe = ctx.bodyAsClass(Recipe.class);
            
            // Delete old recipe and add updated one with new name
            db.deleteRecipe(oldName);
            
            db.addRecipe(updatedRecipe);
            
            ctx.status(200).result("Recipe updated successfully");
        } catch (Exception e) {
            e.printStackTrace();
            ctx.status(400).result("Invalid request data: " + e.getMessage());
        }
    }

    public void deleteRecipe(Context ctx) {
        String name = ctx.pathParam("name");
        db.deleteRecipe(name);
        ctx.status(200).result("Recipe deleted successfully");
    }

    public void scrapeRecipeFromUrl(Context ctx) {
        try {
            // Get URL from request body
            String url = ctx.body();
            if (url == null || url.trim().isEmpty()) {
                ctx.status(400).result("URL is required");
                return;
            }

            // Extract text from URL
            String rawText = extractTextFromUrl(url);
            if (rawText == null || rawText.isEmpty()) {
                ctx.status(400).result("Failed to fetch content from URL");
                return;
            }

            // Extract recipe using Gemini
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

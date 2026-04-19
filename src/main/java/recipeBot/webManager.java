package recipeBot;

import recipeBot.database.DatabaseHandler;
import io.javalin.Javalin;
import io.javalin.http.Context;

public class webManager {
    private final DatabaseHandler db;

    public webManager(DatabaseHandler db) {
        this.db = db;
    }

    public void registerRoutes(Javalin app) {
        app.get("/api/recipes", this::getAllRecipes);
        app.get("/api/recipes/{name}", this::getOneRecipe);
        app.post("/api/recipes", this::addRecipe);
        app.delete("/api/recipes/{name}", this::deleteRecipe);
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
            
            // Safety check for direction, default to 'ltr'
            String dir = newRecipe.getDirection() != null ? newRecipe.getDirection() : "ltr";
            
            db.addRecipe(newRecipe, dir);
            ctx.status(201).result("Recipe added successfully");
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

}

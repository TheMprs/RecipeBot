package recipeBot;

import recipeBot.database.DatabaseHandler;
import io.javalin.http.Context;

public class webManager {
    private final DatabaseHandler db;

    public webManager(DatabaseHandler db) {
        this.db = db;
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
}

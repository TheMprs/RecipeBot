package recipeBot.database;

import java.sql.Statement;
import java.sql.Connection;
import java.util.ArrayList;
import java.util.List;

import recipeBot.*;

public class DatabaseHandler {
    // db file path
    private static final String DB_URL = "jdbc:sqlite:data/recipes.db";
    
    // Initialize the database connection and create tables
    public DatabaseHandler() {
        try (Connection conn = connect();
             Statement stmt = conn.createStatement()) {
            String sql = 
                    "CREATE TABLE IF NOT EXISTS recipes (" +
                    "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                    "name TEXT NOT NULL," +
                    "category TEXT," +
                    "description TEXT," +
                    "ingredients TEXT," +
                    "instructions TEXT" +
                    ")";

            stmt.execute(sql);
            System.out.println("Database initialized successfully.");
        } catch (java.sql.SQLException e) {
            e.printStackTrace();
        }
    }

    // connection method to connect to the SQLite database
    private Connection connect() {
        try {
            return java.sql.DriverManager.getConnection(DB_URL);
        } catch (java.sql.SQLException e) {
            e.printStackTrace();
            return null;
        }
    }

    // method to add a new category to the database
    public void addCategory(String categoryName) {
        String sql = "INSERT INTO categories(name) VALUES(?)";
        try (Connection conn = connect();
             java.sql.PreparedStatement pstmt = conn.prepareStatement(sql)) {
            pstmt.setString(1, categoryName);
            pstmt.executeUpdate();
        } catch (java.sql.SQLException e) {
            e.printStackTrace();
        }
    }

    // method to add a new recipe to the database
    public void addRecipe(Recipe recipe) {
        // prep the recipe data for SQL insertion
        String name = recipe.getName();
        String category = recipe.getCategory().toString();
        String description = recipe.getDescription();
        String[] ingredients = recipe.getIngredients();
        String[] instructions = recipe.getInstructions();

        String sql = "INSERT INTO recipes(name, category, description, ingredients, instructions) VALUES(?, ?, ?, ?, ?)";
        try (Connection conn = connect();
             java.sql.PreparedStatement pstmt = conn.prepareStatement(sql)) {
            pstmt.setString(1, name);
            pstmt.setString(2, category);

            pstmt.setString(3, description);
            pstmt.setString(4, String.join(";", ingredients));
            pstmt.setString(5, String.join(";", instructions));

            pstmt.executeUpdate();
        } catch (java.sql.SQLException e) {
            e.printStackTrace();
        }
    }

    // method to retrieve all categories from the database
    public java.util.List<String> getCategories() {
        java.util.List<String> categories = new java.util.ArrayList<>();
        String sql = "SELECT name FROM categories";
        try (Connection conn = connect();
             java.sql.Statement stmt = conn.createStatement();
             java.sql.ResultSet rs = stmt.executeQuery(sql)) {
            while (rs.next()) {
                categories.add(rs.getString("name"));
            }
        } catch (java.sql.SQLException e) {
            e.printStackTrace();
        }
        return categories;
    }

    public Recipe getRecipeByName(String name) {
        String sql = "SELECT name, category, description, ingredients, instructions FROM recipes WHERE name = ?";
        try (Connection conn = connect();
             java.sql.PreparedStatement pstmt = conn.prepareStatement(sql)) {
            pstmt.setString(1, name);
            try (java.sql.ResultSet rs = pstmt.executeQuery()) {
                if (rs.next()) {
                    String category = rs.getString("category");
                    String description = rs.getString("description");
                    String ingredients = rs.getString("ingredients");
                    String instructions = rs.getString("instructions");
                    
                    // convert the ingredients and instructions back to arrays and create a Recipe object
                    String[] ingredientsArray = ingredients.split(";");
                    String[] instructionsArray = instructions.split(";");
                    
                    return new Recipe(name, Category.parse(category), description, ingredientsArray, instructionsArray);
                }
            }
        } catch (java.sql.SQLException e) {
            e.printStackTrace();
        }
        return null; // return null if recipe not found
    }

    // method to retrieve all recipes from the database
    public List<String> getAllRecipesNames() {
        List<String> recipes = new ArrayList<>();
        String sql = "SELECT name FROM recipes";
        try (Connection conn = connect();
             java.sql.Statement stmt = conn.createStatement();
             java.sql.ResultSet rs = stmt.executeQuery(sql)) {
            
            // init recipe fields
            String name;

            while (rs.next()) {
                name = rs.getString("name");
                recipes.add(name);
            }
        } catch (java.sql.SQLException e) {
            e.printStackTrace();
        }
        return recipes;
    }

    // method to retrieve recipes by category from the database
    public java.util.List<Recipe> getRecipesByCategory(String category) {
        java.util.List<Recipe> recipes = new java.util.ArrayList<>();
        String sql = "SELECT name, category, description, ingredients, instructions FROM recipes WHERE category = ?";
        try (Connection conn = connect();
             java.sql.PreparedStatement pstmt = conn.prepareStatement(sql)) {
            pstmt.setString(1, category);
            try (java.sql.ResultSet rs = pstmt.executeQuery()) {
                while (rs.next()) {
                    String name = rs.getString("name");
                    Category cat = Category.parse(rs.getString("category"));
                    String description = rs.getString("description");
                    String ingredients = rs.getString("ingredients");
                    String instructions = rs.getString("instructions");

                    // convert the ingredients and instructions back to arrays and create a Recipe object
                    String[] ingredientsArray = ingredients.split(";");
                    String[] instructionsArray = instructions.split(";");
                    
                    Recipe recipe = new Recipe(name, cat, description, ingredientsArray, instructionsArray);
                    recipes.add(recipe);
                }
            }
        } catch (java.sql.SQLException e) {
            e.printStackTrace();    
        }
        return recipes;
    }

    // method to delete a recipe from the database
    public boolean deleteRecipe(String name) {
        String sql = "DELETE FROM recipes WHERE name = ?";
        try (Connection conn = connect();
             java.sql.PreparedStatement pstmt = conn.prepareStatement(sql)) {
            pstmt.setString(1, name);
            pstmt.executeUpdate();
        } catch (java.sql.SQLException e) {
            return false;
        }
        return true;
    }

        // method to delete a category from the database
    public boolean deleteCategory(String name) {
        String sql = "DELETE FROM categories WHERE name = ?";
        try (Connection conn = connect();
             java.sql.PreparedStatement pstmt = conn.prepareStatement(sql)) {
            pstmt.setString(1, name);
            pstmt.executeUpdate();
        } catch (java.sql.SQLException e) {
            return false;
        }
        return true;
    }

}

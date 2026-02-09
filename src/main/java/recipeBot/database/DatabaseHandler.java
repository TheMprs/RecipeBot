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

        String sql = "INSERT INTO recipes(name, category, description, ingredients, instructions) VALUES(?, ?, ?, ?, ?)";
        try (Connection conn = connect();
             java.sql.PreparedStatement pstmt = conn.prepareStatement(sql)) {
            pstmt.setString(1, name);
            pstmt.setString(2, category);

            pstmt.setString(3, "");
            pstmt.setString(4, "");
            pstmt.setString(5, "");

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
                    return new Recipe(name, Category.parse(category), description, ingredients.split(";"), instructions.split(";"));
                }
            }
        } catch (java.sql.SQLException e) {
            e.printStackTrace();
        }
        return null; // return null if recipe not found
    }

    // method to retrieve all recipes from the database
    public List<Recipe> getAllRecipes() {
        List<Recipe> recipes = new ArrayList<>();
        String sql = "SELECT * FROM recipes";
        try (Connection conn = connect();
             java.sql.Statement stmt = conn.createStatement();
             java.sql.ResultSet rs = stmt.executeQuery(sql)) {
            
            // init recipe fields
            String name, description, ingredients, instructions;
            Category category;

            while (rs.next()) {
                name = rs.getString("name");
                category = Category.parse(rs.getString("category"));
                description = rs.getString("description");
                ingredients = rs.getString("ingredients");
                instructions = rs.getString("instructions");
                Recipe recipe = new Recipe(name, category, description, ingredients.split(";"), instructions.split(";"));
                recipes.add(recipe);
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
                    Recipe recipe = new Recipe(name, cat, description, ingredients.split(";"), instructions.split(";"));
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

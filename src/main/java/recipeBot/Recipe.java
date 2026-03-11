package recipeBot;

public class Recipe {
    private String name;
    private Category category;
    private String description;
    private boolean favorite = false; // default value
    private String[] ingredients;
    private String[] instructions;
    private String language;

    public Recipe(String name, Category category, String description, String[] ingredients, String[] instructions) {
        this.name = name;
        this.category = category;
        this.description = description;
        this.ingredients = ingredients;
        this.instructions = instructions;
    }

    public Recipe(){
        this.name = null;
        this.category = null;
        this.description = null;
        this.ingredients = null;
        this.instructions = null;
        this.language = null;
    }

    public Recipe(String text) {
        // constructor to parse recipe from SQL text input
        String[] parts = text.split(",");
        this.name = parts[0];
        this.category = Category.valueOf(parts[1].toUpperCase());
        this.description = parts[2];
        this.ingredients = parts[3].split(";"); //  ingredients are separated by semicolons
        this.instructions = parts[4].split(";"); //  instructions are separated by semicolons
        
    }

    // add recipe to favorite list
    public void favorite() {
        this.favorite = true;
    }

    // remove recipe from favorite list
    public void unfavorite() {
        this.favorite = false;
    }

    public String getName() { return this.name; }
    public Category getCategory() { return this.category; }
    public String getDescription() { return this.description; }
    public String[] getIngredients() { return this.ingredients; }
    public String[] getInstructions() { return this.instructions; }

    public void setName(String newName) { this.name = newName; }
    public void setCategory(Category category) { this.category = category; }
    public void setDescription(String description) { this.description = description; }
    public void setIngredients(String[] ingredients) { this.ingredients = ingredients; }
    public void setInstructions(String[] instructions) { this.instructions = instructions; }

    public boolean isFavorite() { return this.favorite; }

}

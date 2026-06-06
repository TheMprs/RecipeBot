package recipeBot;

public class Recipe {
    private String id = null;
    private String name;
    private Category category;
    private String description;
    private String[] ingredients;
    private String[] instructions;

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
    public String getId() { return this.id; }
    public void setId(String id) { this.id = id; }

    @Override
    public String toString() {
        String result = "🍽️ *" + name + "*\n\n";
        result += description + "\n\n";

        result += "🛒 *Ingredients:*\n";
        for (String ingredient : ingredients) {
            result += "• " + ingredient + "\n";
        }

        result += "\n📝 *Instructions:*\n";
        for (int i = 0 ; i < instructions.length; i++) {
            result += i + 1 + ". " + instructions[i] + "\n";
        }

        return result;
    }

}

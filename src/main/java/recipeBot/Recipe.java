package recipeBot;

public class Recipe {
    private String id = null;
    private String userId = null;
    private String visibility = null;
    private String name;
    private String category;
    private String description;
    private String[] ingredients;
    private String[] instructions;
    // Only filled by URL import (page nutrition data or Gemini); null means "not stated".
    private Integer caloriesPerServing = null;

    public Recipe(String name, String category, String description, String[] ingredients, String[] instructions) {
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
    public String getCategory() { return this.category; }
    public String getDescription() { return this.description; }
    public String[] getIngredients() { return this.ingredients; }
    public String[] getInstructions() { return this.instructions; }

    public void setName(String newName) { this.name = newName; }
    public void setCategory(String category) { this.category = category; }
    public void setDescription(String description) { this.description = description; }
    public void setIngredients(String[] ingredients) { this.ingredients = ingredients; }
    public void setInstructions(String[] instructions) { this.instructions = instructions; }
    public String getId() { return this.id; }
    public void setId(String id) { this.id = id; }
    public String getUserId() { return this.userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getVisibility() { return this.visibility; }
    public void setVisibility(String visibility) { this.visibility = visibility; }
    public Integer getCaloriesPerServing() { return this.caloriesPerServing; }
    public void setCaloriesPerServing(Integer calories) { this.caloriesPerServing = calories; }

    public boolean isOwnedBy(String userId) {
        return this.userId != null && this.userId.equals(userId);
    }

    @Override
    public String toString() {
        String result = "🍽️ *" + name + "*\n\n";
        result += description + "\n\n";

        result += "🛒 *Ingredients:*\n";
        // Group titles stand on their own line — no bullet, no step number.
        for (int i = 0; i < ingredients.length; i++) {
            if (BotFormat.isGroupHeading(ingredients[i])) result += (i > 0 ? "\n" : "") + ingredients[i].trim() + "\n";
            else result += "• " + ingredients[i] + "\n";
        }

        result += "\n📝 *Instructions:*\n";
        int[] nums = BotFormat.stepNumbers(instructions);
        for (int i = 0 ; i < instructions.length; i++) {
            if (nums[i] == 0) result += (i > 0 ? "\n" : "") + instructions[i].trim() + "\n";
            else result += nums[i] + ". " + instructions[i] + "\n";
        }

        return result;
    }

}

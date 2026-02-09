package tutorial;

public class Recipe {
    private String name;
    private Category category;
    private String description;
    private boolean favorite = false; // default value
    private String[] ingredients;
    private String[] steps;

    public Recipe(String name, Category category, String description, String[] ingredients, String[] steps) {
        this.name = name;
        this.category = category;
        this.description = description;
        this.ingredients = ingredients;
        this.steps = steps;
    }

    public Recipe(){
        this.name = null;
        this.category = null;
        this.description = null;
        this.ingredients = null;
        this.steps = null;
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
    public String[] getSteps() { return this.steps; }

    public void setName(String newName) { this.name = newName; }
    public void setCategory(Category category) { this.category = category; }
    public void setDescription(String description) { this.description = description; }
    public void setIngredients(String[] ingredients) { this.ingredients = ingredients; }
    public void setSteps(String[] steps) { this.steps = steps; }

    public boolean isFavorite() { return this.favorite; }

}

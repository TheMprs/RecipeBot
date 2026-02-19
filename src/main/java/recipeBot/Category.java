package recipeBot;

public enum Category {
    MAIN,
    DESSERT,
    SNACK,
    SPECIAL;
    
    public static Category parse(String text) {
        switch (text.trim().toLowerCase()) {
            case "main":
                return MAIN;
            case "dessert":
                return DESSERT;
            case "snack":
                return SNACK;
            case "special":
                return SPECIAL;
            default:
                throw new IllegalArgumentException("Unknown category: " + text);
        }
    }
    public String toString() {
        switch (this) {
            case MAIN:
                return "Main";
            case DESSERT:
                return "Dessert";
            case SNACK:
                return "Snack";
            case SPECIAL:
                return "Special";
            default:
                return super.toString();
        }
    }
}
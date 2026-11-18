package recipeBot;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Did this recipe come from the page? Ported from RecipeSage's isRecipeGrounded: a line counts
 * as found when at least half of its 10-character windows occur in the page text, and the
 * recipe counts as grounded when at least half of its lines are found. Exact matching would
 * reject a model that fixed a typo or spacing; this still rejects a recipe invented from a
 * news article, or text a hostile page asked the model to add. Group titles are skipped —
 * the model is asked to add a colon to them, which the page may not have.
 */
final class RecipeGrounding {
    private RecipeGrounding() {}

    private static final int WINDOW = 10;
    private static final double LINE_COVERAGE = 0.5;
    private static final double RECIPE_FRACTION = 0.5;

    static boolean isGrounded(Recipe r, String source) {
        Double s = score(r, source);
        return s != null && s >= RECIPE_FRACTION;
    }

    /** Share of the recipe's lines found in the source, or null when it has none. */
    static Double score(Recipe r, String source) {
        List<String> lines = new ArrayList<>();
        for (String[] list : new String[][]{r.getIngredients(), r.getInstructions()}) {
            if (list == null) continue;
            for (String l : list) if (l != null && !l.isBlank() && !BotFormat.isGroupHeading(l)) lines.add(l);
        }
        if (lines.isEmpty()) return null;
        String src = normalize(source);
        Set<String> windows = new HashSet<>();
        for (int i = 0; i + WINDOW <= src.length(); i++) windows.add(src.substring(i, i + WINDOW));
        int found = 0;
        for (String l : lines) if (coverage(normalize(l), src, windows) >= LINE_COVERAGE) found++;
        return (double) found / lines.size();
    }

    private static double coverage(String line, String src, Set<String> windows) {
        if (line.length() < WINDOW) return src.contains(line) ? 1 : 0;
        int present = 0, total = 0;
        for (int i = 0; i + WINDOW <= line.length(); i++) {
            total++;
            if (windows.contains(line.substring(i, i + WINDOW))) present++;
        }
        return total == 0 ? 1 : (double) present / total;
    }

    private static String normalize(String s) {
        return s == null ? "" : s.toLowerCase(Locale.ROOT).replaceAll("\\s+", " ").trim();
    }
}

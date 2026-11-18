package recipeBot;

import java.util.ArrayList;
import java.util.List;

/**
 * Every imported recipe passes through here before anyone sees it — whether it came from a
 * page's structured data or from Gemini. Neither source is trusted: a site can put HTML,
 * megabytes of text or invisible direction-flipping characters in its JSON-LD, and a page
 * can try to talk Gemini into returning junk. Clamping the output to the same limits the
 * web form enforces means an import can never store something the form couldn't.
 */
final class RecipeSanitizer {
    private RecipeSanitizer() {}

    // Mirrors the web form's maxLength values (RecipeForm.jsx); name matches the DB check.
    static final int NAME_MAX = 120;
    static final int DESC_MAX = 1000;
    static final int INGREDIENT_MAX = 500;
    static final int STEP_MAX = 2000;
    static final int LIST_MAX = 100;
    // Per serving. Sites often put the whole dish's figure here (foody: 1828 for a dish
    // serving 4); above this it is almost always that, so it's dropped rather than shown.
    static final int CALORIES_MAX = 1500;
    // A single "step" this long is the whole method in one string — not complete enough to
    // skip Gemini, which splits it into real steps.
    static final int ONE_STEP_MAX = 400;

    // Bidi overrides and isolates (U+202A-202E, U+2066-2069) can make a line read differently
    // from what it contains. Hebrew text never needs them — the plain RLM/LRM marks it does
    // use (U+200E/200F) are left alone.
    private static final String BIDI_CONTROLS = "[\\u202A-\\u202E\\u2066-\\u2069]";

    // WordPress shortcodes leak into JSON-LD as text: "[caption id=…] photo credit [/caption]".
    // Only the media ones are removed, and the caption's credit line with it — a bracket in
    // an ingredient ("[optional]") is left alone. The closing tag sometimes loses its slash.
    private static final java.util.regex.Pattern CAPTION_BLOCK = java.util.regex.Pattern.compile(
            "\\[\\s*caption\\b[^\\]]*\\].*?\\[\\s*/?\\s*caption\\s*\\]",
            java.util.regex.Pattern.CASE_INSENSITIVE | java.util.regex.Pattern.DOTALL);
    private static final String MEDIA_SHORTCODE =
            "(?i)\\[\\s*/?\\s*(caption|gallery|embed|video|audio|playlist)\\b[^\\]]*\\]";

    static Recipe clean(Recipe r) {
        if (r == null) return null;
        Recipe out = new Recipe(
                cap(name(r.getName()), NAME_MAX),
                cap(text(r.getCategory()), NAME_MAX),
                cap(text(r.getDescription()), DESC_MAX),
                list(r.getIngredients(), INGREDIENT_MAX),
                steps(list(r.getInstructions(), STEP_MAX)));
        if (out.getDescription() == null) out.setDescription("");
        out.setCaloriesPerServing(calories(r.getCaloriesPerServing()));
        return out;
    }

    // The site's own step numbers ("1.Preheat", "Step 2: Mix") duplicate the ones the app
    // draws, and a line that is only a number ("3", "Step 4") is no step at all. Only the
    // method is touched — "2 eggs" in the ingredients keeps its 2. "2-3 minutes…" and
    // "1.5 kg…" are text, not numbering. (Cases from RecipeSage's cleanRecipeFields.)
    private static final java.util.regex.Pattern STEP_NUMBER = java.util.regex.Pattern.compile(
            "^(?:(?:step|שלב)\\s*)?\\d{1,2}\\s*[.):](?!\\d)\\s*", java.util.regex.Pattern.CASE_INSENSITIVE);
    private static final java.util.regex.Pattern ONLY_NUMBER = java.util.regex.Pattern.compile(
            "^(?:(?:step|שלב)\\s*)?\\d{1,2}\\s*[.):]?$", java.util.regex.Pattern.CASE_INSENSITIVE);

    static String[] steps(String[] in) {
        if (in == null) return null;
        List<String> out = new ArrayList<>();
        for (String s : in) {
            if (ONLY_NUMBER.matcher(s).matches()) continue;
            String t = STEP_NUMBER.matcher(s).replaceFirst("").trim();
            if (!t.isEmpty()) out.add(t);
        }
        return out.toArray(new String[0]);
    }

    // Good enough to skip Gemini: real recipes have a name, several ingredients and a step.
    // One ingredient usually means partial structured data (mako lists only the pan).
    static boolean isComplete(Recipe r) {
        return r != null && notEmpty(r.getName())
                && r.getIngredients() != null && r.getIngredients().length >= 2
                && r.getInstructions() != null && r.getInstructions().length >= 1
                && !(r.getInstructions().length == 1 && r.getInstructions()[0].length() > ONE_STEP_MAX)
                && hasAmounts(r.getIngredients())
                && plausibleSteps(r.getIngredients().length, r.getInstructions().length);
    }

    // The method is the part sites most often leave out of their structured data: rutgerbakt
    // puts the marketing blurb there as its only "step", tine.no the word "Oppskrift",
    // dagelijksekost 2 of its 32 steps. One step for four or more ingredients, or far fewer
    // steps than ingredients, means the real method is on the page — Gemini reads it there.
    static boolean plausibleSteps(int ingredients, int steps) {
        if (steps == 1 && ingredients >= 4) return false;
        return steps * 8 >= ingredients;
    }

    // Some sites' structured data lists bare names ("popping corn", "flour") and keeps the
    // amounts only in the visible page (kikkoman, recipeland, aldi-suisse). A list where
    // hardly any line carries a number or a measure is that, not a real ingredient list —
    // Gemini reads the page instead. Short lists are let through: "salt, pepper" is real.
    private static final java.util.regex.Pattern AMOUNT = java.util.regex.Pattern.compile(
            "[0-9¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|(?i)\\b(cups?|tbsp|tsp|tablespoons?|teaspoons?|pinch|handful|cloves?|g|kg|ml|l|oz|lb)\\b"
            + "|כוס|כף|כפית|חצי|רבע|קורט|חופן|שן|ק\"ג|גרם|מ\"ל|ליטר");

    static boolean hasAmounts(String[] ingredients) {
        int items = 0, withAmount = 0;
        for (String s : ingredients) {
            if (s == null || s.isBlank() || s.trim().endsWith(":")) continue;
            items++;
            if (AMOUNT.matcher(s).find()) withAmount++;
        }
        return items < 4 || withAmount * 4 >= items; // at least a quarter carry an amount
    }

    // Good enough to hand to the user at all: something in every required field.
    static boolean isUsable(Recipe r) {
        return r != null && notEmpty(r.getName())
                && r.getIngredients() != null && r.getIngredients().length >= 1
                && r.getInstructions() != null && r.getInstructions().length >= 1;
    }

    // "מתכון: חלה מתוקה" (mako) / "Recipe: Banana bread" — the label is the site's, not
    // part of the dish's name. Kept if nothing would be left without it.
    private static final java.util.regex.Pattern NAME_LABEL =
            java.util.regex.Pattern.compile("^(?:מתכון|recipe)\\s*[:\\-–—|]\\s*", java.util.regex.Pattern.CASE_INSENSITIVE);

    static String name(String s) {
        String t = text(s);
        if (t == null) return null;
        String stripped = NAME_LABEL.matcher(t).replaceFirst("");
        return stripped.isEmpty() ? t : stripped;
    }

    static Integer calories(Integer c) {
        return (c != null && c >= 1 && c <= CALORIES_MAX) ? c : null;
    }

    // One clean line: tags stripped, entities decoded, control and bidi-override characters
    // gone, whitespace collapsed. null stays null so callers can tell "absent" from "empty".
    static String text(String s) {
        if (s == null) return null;
        String t = s;
        if (t.indexOf('[') >= 0) {
            t = CAPTION_BLOCK.matcher(t).replaceAll(" ").replaceAll(MEDIA_SHORTCODE, " ");
        }
        if (t.indexOf('<') >= 0 && t.indexOf('>') >= 0) {
            t = org.jsoup.Jsoup.parseBodyFragment(t).text();
        } else if (t.indexOf('&') >= 0) {
            t = org.jsoup.parser.Parser.unescapeEntities(t, false);
        }
        // Zero-width space, word joiner and BOM are invisible junk; ZWJ (U+200D) is kept — it
        // holds emoji like 👨‍🍳 together.
        t = t.replaceAll(BIDI_CONTROLS, "").replaceAll("[\\u200B\\u2060\\uFEFF]", "")
             .replaceAll("[\\p{Cc}\\u00A0\\u2028\\u2029]", " ")
             .replaceAll("\\s+", " ")
             .trim();
        return t;
    }

    static String cap(String s, int max) {
        if (s == null || s.length() <= max) return s;
        int end = max;
        if (Character.isHighSurrogate(s.charAt(end - 1))) end--; // don't split an emoji in half
        return s.substring(0, end).trim();
    }

    // Cleaned, capped items with blanks and back-to-back repeats dropped (a page that lists
    // an ingredient in both its card and its JSON often yields "2 eggs", "2 eggs").
    static String[] list(String[] in, int itemMax) {
        if (in == null) return null;
        List<String> out = new ArrayList<>();
        String prev = null;
        for (String raw : in) {
            String s = cap(text(raw), itemMax);
            if (s == null || s.isEmpty() || s.equals(prev)) continue;
            out.add(s);
            prev = s;
            if (out.size() >= LIST_MAX) break;
        }
        return out.toArray(new String[0]);
    }

    private static boolean notEmpty(String s) {
        return s != null && !s.isEmpty();
    }
}

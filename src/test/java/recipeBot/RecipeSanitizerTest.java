package recipeBot;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

// The last gate before an imported recipe reaches a user. Neither the page nor Gemini is
// trusted, so these pin down what the gate strips and where it cuts.
class RecipeSanitizerTest {

    private static Recipe recipe(String name, String[] ing, String[] steps) {
        return new Recipe(name, null, "desc", ing, steps);
    }

    @Test
    void strips_html_and_decodes_entities() {
        assertEquals("Milk & Honey", RecipeSanitizer.text("<b>Milk</b> &amp; <i>Honey</i>"));
        assertEquals("Mix & bake", RecipeSanitizer.text("Mix &amp; bake"));
        assertEquals("a < b", RecipeSanitizer.text("a < b"), "a lone < is not a tag");
    }

    @Test
    void removes_bidi_overrides_but_keeps_hebrew_marks() {
        assertEquals("abc", RecipeSanitizer.text("a‮b⁦c"));
        assertEquals("שמן‏ זית", RecipeSanitizer.text("שמן‏ זית"), "RLM is legitimate in Hebrew");
    }

    @Test
    void collapses_whitespace_and_control_characters() {
        assertEquals("2 cups flour", RecipeSanitizer.text("  2 cups\tflour\r\n "));
    }

    @Test
    void caps_every_field_to_the_form_limits() {
        String longName = "x".repeat(500);
        String[] many = new String[300];
        for (int i = 0; i < many.length; i++) many[i] = "item " + i + " " + "y".repeat(3000);
        Recipe r = RecipeSanitizer.clean(recipe(longName, many, many));
        assertEquals(RecipeSanitizer.NAME_MAX, r.getName().length());
        assertEquals(RecipeSanitizer.LIST_MAX, r.getIngredients().length);
        assertEquals(RecipeSanitizer.INGREDIENT_MAX, r.getIngredients()[0].length());
        assertEquals(RecipeSanitizer.STEP_MAX, r.getInstructions()[0].length());
    }

    @Test
    void cap_never_splits_an_emoji() {
        String s = "a".repeat(9) + "😀"; // emoji is two chars at index 9-10
        assertEquals("a".repeat(9), RecipeSanitizer.cap(s, 10));
    }

    @Test
    void drops_blank_and_back_to_back_duplicate_items() {
        Recipe r = RecipeSanitizer.clean(recipe("Cake",
                new String[]{"2 eggs", "2 eggs", " ", "<p></p>", "flour", "2 eggs"},
                new String[]{"Mix."}));
        assertArrayEquals(new String[]{"2 eggs", "flour", "2 eggs"}, r.getIngredients());
    }

    @Test
    void null_description_becomes_empty_and_bad_calories_are_dropped() {
        Recipe in = new Recipe("Cake", null, null, new String[]{"a"}, new String[]{"b"});
        in.setCaloriesPerServing(250000);
        Recipe r = RecipeSanitizer.clean(in);
        assertEquals("", r.getDescription());
        assertNull(r.getCaloriesPerServing());
        in.setCaloriesPerServing(320);
        assertEquals(320, RecipeSanitizer.clean(in).getCaloriesPerServing());
    }

    @Test
    void complete_needs_two_ingredients_usable_needs_one() {
        Recipe one = recipe("Pan only", new String[]{"28cm pan"}, new String[]{"do stuff"});
        assertFalse(RecipeSanitizer.isComplete(one));
        assertTrue(RecipeSanitizer.isUsable(one));
        assertFalse(RecipeSanitizer.isUsable(recipe("", new String[]{"a"}, new String[]{"b"})));
        assertFalse(RecipeSanitizer.isUsable(recipe("x", new String[]{}, new String[]{"b"})));
        assertFalse(RecipeSanitizer.isUsable(null));
    }

    @Test
    void media_shortcodes_go_but_ordinary_brackets_stay() {
        assertEquals("Bake. Serve.", RecipeSanitizer.text("Bake. [caption id=\"x\"]Photo: Dana[/caption] Serve."));
        assertEquals("Mix.", RecipeSanitizer.text("Mix. [gallery ids=\"1,2\"]"));
        assertEquals("1 tsp chili [optional]", RecipeSanitizer.text("1 tsp chili [optional]"));
    }

    @Test
    void zero_width_junk_goes_but_emoji_joiners_stay() {
        assertEquals("Cake", RecipeSanitizer.text("Ca\u200Bke\uFEFF"));
        assertEquals("👨\u200D🍳 Chef", RecipeSanitizer.text("👨\u200D🍳 Chef"));
    }
}

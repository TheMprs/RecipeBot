package recipeBot;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

// Cases taken from other recipe importers' own test suites and re-run against ours:
//   RecipeSage      packages/util/server/src/general/clip/{isRecipeGrounded,cleanRecipeFields,clip}.spec.ts
//   cooklang-import tests/test_{edge_cases,json_ld_extraction_gaps,missing_ingredients,no_instructions}.rs
// Inputs are rewritten as small inline pages (no third-party fixtures are copied); each test
// names the case it came from.
class PortedCasesTest {

    private static Document page(String jsonLd) {
        return Jsoup.parse("<html><head><script type=\"application/ld+json\">" + jsonLd + "</script></head><body></body></html>");
    }

    private static Recipe recipe(String[] ing, String[] steps) {
        return new Recipe("x", null, "", ing, steps);
    }

    // --- RecipeSage: isRecipeGrounded.spec.ts ---------------------------------------------

    @Test
    void grounded_accepts_lines_drawn_verbatim_from_the_source() {
        String src = "Pancakes. 2 cups flour. 1 egg. Whisk the flour and egg together. Fry in butter.";
        assertTrue(RecipeGrounding.isGrounded(recipe(new String[]{"2 cups flour", "1 egg"},
                new String[]{"Whisk the flour and egg together.", "Fry in butter."}), src));
    }

    @Test
    void grounded_rejects_a_recipe_invented_from_nothing_in_the_source() {
        String src = "Spring gardening notes: prune the roses, water the tomatoes twice a week.";
        assertFalse(RecipeGrounding.isGrounded(recipe(new String[]{"200 g spaghetti", "2 cloves garlic"},
                new String[]{"Boil the pasta for nine minutes.", "Fry the garlic and toss."}), src));
    }

    @Test
    void grounded_rejects_a_recipe_scored_against_an_unrelated_error_body() {
        String src = "403 Forbidden. Access denied. Request ID 8f2a.";
        assertFalse(RecipeGrounding.isGrounded(recipe(new String[]{"1 cup rice"}, new String[]{"Cook the rice."}), src));
    }

    @Test
    void grounded_ignores_section_headers_when_scoring() {
        String src = "1 cup rice. Cook the rice until tender.";
        // "For the rice:" never appears in the source; it must not count against the recipe.
        assertTrue(RecipeGrounding.isGrounded(recipe(new String[]{"For the rice:", "1 cup rice"},
                new String[]{"Cook the rice until tender."}), src));
    }

    @Test
    void grounded_is_robust_to_case_and_whitespace() {
        String src = "2 CUPS   FLOUR\nWHISK  THE FLOUR WELL";
        assertTrue(RecipeGrounding.isGrounded(recipe(new String[]{"2 cups flour"}, new String[]{"Whisk the flour well"}), src));
    }

    @Test
    void grounded_works_the_same_for_non_latin_scripts() {
        String src = "שקשוקה. 7 ביצים. 2 קופסאות עגבניות. מטגנים את הפלפלים כ-3 דקות. שוברים פנימה את הביצים.";
        assertTrue(RecipeGrounding.isGrounded(recipe(new String[]{"7 ביצים", "2 קופסאות עגבניות"},
                new String[]{"מטגנים את הפלפלים כ-3 דקות.", "שוברים פנימה את הביצים."}), src));
        assertFalse(RecipeGrounding.isGrounded(recipe(new String[]{"500 גרם פסטה"},
                new String[]{"מבשלים את הפסטה במים רותחים."}), src));
    }

    @Test
    void grounded_rejects_a_recipe_with_no_lines() {
        assertNull(RecipeGrounding.score(recipe(new String[]{}, new String[]{}), "anything"));
        assertFalse(RecipeGrounding.isGrounded(recipe(new String[]{}, new String[]{}), "anything"));
    }

    @Test
    void grounded_matches_short_lines_as_substrings() {
        assertTrue(RecipeGrounding.isGrounded(recipe(new String[]{"salt"}, new String[]{"Mix."}), "Add salt. Mix."));
    }

    // --- RecipeSage: cleanRecipeFields.spec.ts ------------------------------------------------

    @Test
    void strips_leading_step_numbering_from_instructions() {
        assertArrayEquals(new String[]{"Preheat the oven.", "Mix.", "Bake."},
                RecipeSanitizer.steps(new String[]{"1. Preheat the oven.", "2)Mix.", "Step 3: Bake."}));
    }

    @Test
    void removes_instruction_lines_that_are_only_a_step_number() {
        assertArrayEquals(new String[]{"Mix."}, RecipeSanitizer.steps(new String[]{"1", "Mix.", "Step 2", "שלב 3:"}));
    }

    @Test
    void a_leading_number_with_a_dash_or_a_decimal_is_text_not_numbering() {
        assertArrayEquals(new String[]{"2-3 minutes until golden.", "1.5 kg flour goes in the bowl."},
                RecipeSanitizer.steps(new String[]{"2-3 minutes until golden.", "1.5 kg flour goes in the bowl."}));
    }

    @Test
    void numbers_inside_steps_and_in_ingredients_are_kept() {
        assertArrayEquals(new String[]{"Bake for 25 minutes at 180C."},
                RecipeSanitizer.steps(new String[]{"Bake for 25 minutes at 180C."}));
        Recipe r = RecipeSanitizer.clean(new Recipe("x", null, "", new String[]{"2 eggs", "3"}, new String[]{"Mix."}));
        assertArrayEquals(new String[]{"2 eggs", "3"}, r.getIngredients(), "only the method is renumbered");
    }

    // --- RecipeSage: clip.spec.ts / isBotChallengePage.ts --------------------------------------

    @Test
    void bot_challenge_pages_are_recognised_by_title() {
        assertTrue(UrlFetcher.isBotChallenge("Just a moment..."));
        assertTrue(UrlFetcher.isBotChallenge("Attention Required! | Cloudflare"));
        assertTrue(UrlFetcher.isBotChallenge("Access denied"));
        assertFalse(UrlFetcher.isBotChallenge("Just a moment: 5-minute pancakes"));
        assertFalse(UrlFetcher.isBotChallenge(null));
    }

    @Test
    void structured_data_with_only_step_numbers_is_not_complete() {
        Document d = page("{\"@type\":\"Recipe\",\"name\":\"Soup\",\"recipeIngredient\":[\"water\",\"salt\"],"
                + "\"recipeInstructions\":[\"1\",\"2\",\"3\"]}");
        assertNull(UrlFetcher.extract(d).complete(), "falls through to Gemini instead");
    }

    // --- cooklang-import ----------------------------------------------------------------------

    @Test
    void headline_is_used_when_name_is_missing() {
        Document d = page("{\"@type\":\"Recipe\",\"headline\":\"My Headline Recipe\","
                + "\"recipeIngredient\":[\"1 egg\",\"2 cups milk\"],\"recipeInstructions\":\"Whisk.\"}");
        assertEquals("My Headline Recipe", UrlFetcher.extract(d).complete().getName());
    }

    @Test
    void graph_recipe_wins_over_an_empty_root_recipe() {
        Document d = page("{\"@context\":\"https://schema.org\",\"@type\":\"Recipe\",\"name\":\"Tuscan Tomato Salad SEO Stub\","
                + "\"@graph\":[{\"@type\":\"Recipe\",\"name\":\"Tuscan Tomato and Chickpea Salad\","
                + "\"recipeIngredient\":[\"2 tomatoes\",\"1 tin chickpeas\",\"olive oil\"],"
                + "\"recipeInstructions\":[{\"@type\":\"HowToStep\",\"text\":\"Chop the tomatoes.\"},"
                + "{\"@type\":\"HowToStep\",\"text\":\"Toss everything together.\"}]}]}");
        Recipe r = UrlFetcher.extract(d).complete();
        assertEquals("Tuscan Tomato and Chickpea Salad", r.getName());
        assertTrue(java.util.Arrays.asList(r.getIngredients()).contains("1 tin chickpeas"));
    }

    @Test
    void ingredient_objects_with_amount_and_name() {
        Document d = page("{\"@type\":\"Recipe\",\"name\":\"Basque Burnt Cheesecake\",\"recipeIngredient\":["
                + "{\"@type\":\"HowToIngredient\",\"amount\":\"\",\"name\":\"For the cheesecake:\"},"
                + "{\"@type\":\"HowToIngredient\",\"amount\":\"600g\",\"name\":\"full-fat cream cheese\"},"
                + "{\"@type\":\"HowToIngredient\",\"amount\":\"175g\",\"name\":\"caster sugar\"}],"
                + "\"recipeInstructions\":[\"Beat the cheese and sugar.\",\"Bake hot.\"]}");
        assertArrayEquals(new String[]{"For the cheesecake:", "600g full-fat cream cheese", "175g caster sugar"},
                UrlFetcher.extract(d).complete().getIngredients());
    }

    @Test
    void how_to_section_accepts_a_single_item_object_and_nests() {
        Document d = page("{\"@type\":\"Recipe\",\"name\":\"Pie\",\"recipeIngredient\":[\"1 crust\",\"4 apples\"],"
                + "\"recipeInstructions\":[{\"@type\":\"HowToSection\",\"name\":\"Filling\",\"itemListElement\":"
                + "{\"@type\":\"HowToStep\",\"text\":\"Slice the apples.\"}},"
                + "{\"@type\":\"HowToSection\",\"name\":\"Assembly\",\"itemListElement\":[{\"@type\":\"HowToSection\","
                + "\"name\":\"Top\",\"itemListElement\":[{\"@type\":\"HowToStep\",\"text\":\"Cover and bake.\"}]}]}]}");
        assertArrayEquals(new String[]{"Filling:", "Slice the apples.", "Assembly:", "Top:", "Cover and bake."},
                UrlFetcher.extract(d).complete().getInstructions());
    }

    @Test
    void ingredients_without_instructions_fall_through_to_gemini() {
        Document d = page("{\"@type\":\"Recipe\",\"name\":\"Stub\",\"recipeIngredient\":[\"1 egg\",\"2 cups milk\"]}");
        assertNull(UrlFetcher.extract(d).complete());
    }

    @Test
    void empty_ingredient_list_falls_through_to_gemini() {
        Document d = page("{\"@type\":\"Recipe\",\"name\":\"Stub\",\"recipeIngredient\":[],\"recipeInstructions\":[\"Mix.\"]}");
        assertNull(UrlFetcher.extract(d).complete());
    }

    @Test
    void name_with_html_tags_becomes_a_single_line() {
        Document d = page("{\"@type\":\"Recipe\",\"name\":\"Best <em>Ever</em>\\n<br>Brownies\","
                + "\"recipeIngredient\":[\"1 cup cocoa\",\"2 eggs\"],\"recipeInstructions\":[\"Bake.\"]}");
        assertEquals("Best Ever Brownies", UrlFetcher.extract(d).complete().getName());
    }
}

package recipeBot;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

// Everything the scraper works out from a page before (or instead of) calling Gemini.
// Pages are inline HTML strings, so the suite stays offline.
class RecipeExtractTest {

    private static Document page(String head, String body) {
        return Jsoup.parse("<html><head>" + head + "</head><body>" + body + "</body></html>");
    }

    private static String ld(String json) {
        return "<script type=\"application/ld+json\">" + json + "</script>";
    }

    // --- JSON-LD (moved here from the old UrlFetcher.main self-check, which never ran in CI) ---

    @Test
    void finds_a_recipe_inside_graph_with_an_array_type() {
        Document d = page(ld("{\"@context\":\"https://schema.org\",\"@graph\":[{\"@type\":\"BreadcrumbList\"},"
                + "{\"@type\":[\"Recipe\",\"NewsArticle\"],\"name\":\"Test Cake\",\"recipeIngredient\":[\"1 cup flour\",\"2 eggs\"],"
                + "\"recipeInstructions\":[{\"@type\":\"HowToStep\",\"text\":\"Mix.\"},{\"@type\":\"HowToStep\",\"text\":\"Bake.\"}]}]}"), "");
        Recipe r = UrlFetcher.extract(d).complete();
        assertNotNull(r);
        assertEquals("Test Cake", r.getName());
        assertArrayEquals(new String[]{"Mix.", "Bake."}, r.getInstructions());
    }

    @Test
    void finds_a_recipe_nested_under_main_entity() {
        Document d = page(ld("{\"@type\":\"WebPage\",\"mainEntity\":{\"@type\":\"Recipe\",\"name\":\"Soup\","
                + "\"recipeIngredient\":[\"water\",\"salt\"],\"recipeInstructions\":\"Boil.\"}}"), "");
        assertEquals("Soup", UrlFetcher.extract(d).complete().getName());
    }

    @Test
    void decodes_entities_in_json_ld() {
        Document d = page(ld("{\"@type\":\"Recipe\",\"name\":\"Milk &amp; Honey\",\"recipeIngredient\":[\"220 \\u05de&rdquo;\\u05dc milk\",\"2 eggs\"],"
                + "\"recipeInstructions\":[\"Mix &amp; bake\",\"Cool\"]}"), "");
        Recipe r = UrlFetcher.extract(d).complete();
        assertEquals("Milk & Honey", r.getName());
        assertEquals("220 מ”ל milk", r.getIngredients()[0]);
        assertEquals("Mix & bake", r.getInstructions()[0]);
    }

    @Test
    void partial_json_ld_goes_to_gemini_together_with_the_page_text() {
        // mako's shape: the only "ingredient" is the pan; the real list is in the HTML.
        Document d = page(ld("{\"@type\":\"Recipe\",\"name\":\"Pan only\",\"recipeIngredient\":[\"28cm pan\"],"
                + "\"recipeInstructions\":[\"do stuff\"]}"),
                "<article><h1>Pan only</h1><ul><li>2 cups flour</li><li>3 eggs</li></ul>"
                + "<p>" + "Whisk everything together until smooth. ".repeat(8) + "</p></article>");
        UrlFetcher.Extracted ex = UrlFetcher.extract(d);
        assertNull(ex.complete(), "one ingredient is not complete");
        assertNotNull(ex.partial(), "kept as a fallback for when Gemini is down");
        assertTrue(ex.aiText().contains("28cm pan"), "structured data is sent as a hint");
        assertTrue(ex.aiText().contains("3 eggs"), "and the page text is sent too — that's where the rest is");
    }

    @Test
    void section_names_are_kept_as_header_lines() {
        Document d = page(ld("{\"@type\":\"Recipe\",\"name\":\"Pasta\",\"recipeIngredient\":[\"pasta\",\"tomatoes\"],"
                + "\"recipeInstructions\":[{\"@type\":\"HowToSection\",\"name\":\"For the sauce\",\"itemListElement\":["
                + "{\"@type\":\"HowToStep\",\"text\":\"Simmer tomatoes.\"}]},"
                + "{\"@type\":\"HowToSection\",\"name\":\"לפסטה:\",\"itemListElement\":[{\"@type\":\"HowToStep\",\"text\":\"Boil pasta.\"}]}]}"), "");
        assertArrayEquals(new String[]{"For the sauce:", "Simmer tomatoes.", "לפסטה:", "Boil pasta."},
                UrlFetcher.extract(d).complete().getInstructions());
    }

    @Test
    void calories_come_from_nutrition() {
        Document d = page(ld("{\"@type\":\"Recipe\",\"name\":\"Cake\",\"recipeIngredient\":[\"a\",\"b\"],"
                + "\"recipeInstructions\":[\"c\"],\"nutrition\":{\"@type\":\"NutritionInformation\",\"calories\":\"312.6 kcal\"}}"), "");
        assertEquals(313, UrlFetcher.extract(d).complete().getCaloriesPerServing());
    }

    @Test
    void parses_calorie_strings() {
        assertEquals(250, UrlFetcher.parseCalories("250 calories"));
        assertEquals(250, UrlFetcher.parseCalories("250"));
        assertEquals(1200, UrlFetcher.parseCalories("1200 קלוריות"));
        assertNull(UrlFetcher.parseCalories("lots"));
        assertNull(UrlFetcher.parseCalories("0 kcal"), "zero means unknown, not a diet recipe");
    }

    // --- Microdata ---

    @Test
    void reads_microdata_without_taking_the_authors_name() {
        Document d = page("", "<div itemscope itemtype=\"http://schema.org/Recipe\">"
                + "<h1 itemprop=\"name\">Shakshuka</h1>"
                + "<span itemprop=\"author\" itemscope itemtype=\"http://schema.org/Person\"><span itemprop=\"name\">Dana</span></span>"
                + "<ul><li itemprop=\"recipeIngredient\">4 eggs</li><li itemprop=\"recipeIngredient\">6 tomatoes</li></ul>"
                + "<div itemprop=\"recipeInstructions\"><ol><li>Cook the tomatoes.</li><li>Add the eggs.</li></ol></div>"
                + "<span itemprop=\"nutrition\" itemscope><meta itemprop=\"calories\" content=\"280 kcal\"></span>"
                + "</div>");
        Recipe r = UrlFetcher.extract(d).complete();
        assertNotNull(r);
        assertEquals("Shakshuka", r.getName());
        assertArrayEquals(new String[]{"4 eggs", "6 tomatoes"}, r.getIngredients());
        assertArrayEquals(new String[]{"Cook the tomatoes.", "Add the eggs."}, r.getInstructions());
        assertEquals(280, r.getCaloriesPerServing());
    }

    // --- Framework data blobs ---

    @Test
    void reads_a_typed_recipe_out_of_next_data() {
        Document d = page("", "<div id=\"__next\"></div><script id=\"__NEXT_DATA__\" type=\"application/json\">"
                + "{\"props\":{\"pageProps\":{\"schema\":{\"@type\":\"Recipe\",\"name\":\"Hummus\","
                + "\"recipeIngredient\":[\"chickpeas\",\"tahini\"],\"recipeInstructions\":[\"Blend.\"]}}}}</script>");
        assertEquals("Hummus", UrlFetcher.extract(d).complete().getName());
    }

    @Test
    void an_untyped_recipe_blob_is_sent_to_gemini_as_a_hint() {
        Document d = page("<title>Hummus | Site</title>", "<div id=\"__next\"></div><script id=\"__NEXT_DATA__\" type=\"application/json\">"
                + "{\"props\":{\"pageProps\":{\"menu\":[1,2],\"recipe\":{\"title\":\"Hummus\","
                + "\"ingredients\":[{\"qty\":\"1 cup\",\"name\":\"chickpeas\"}],\"steps\":[\"Blend it all.\"]}}}}</script>");
        UrlFetcher.Extracted ex = UrlFetcher.extract(d);
        assertNull(ex.complete());
        assertTrue(ex.aiText().contains("chickpeas"));
        assertFalse(ex.aiText().contains("\"menu\""), "only the recipe-shaped object, not the whole blob");
    }

    // --- Page text for Gemini ---

    @Test
    void page_text_keeps_lines_and_drops_page_furniture() {
        String filler = "This is a long and lovely introduction about grandma's kitchen. ".repeat(5);
        Document d = page("", "<nav>Home | Recipes | About</nav>"
                + "<article><h1>Lentil soup</h1><p>" + filler + "</p>"
                + "<h3>Ingredients</h3><ul><li>1 cup lentils</li><li>1 onion</li></ul>"
                + "<div class=\"share-buttons\">Share on Facebook</div>"
                + "<div id=\"comments\"><p>Great recipe!!! Visit my site</p></div>"
                + "<script>alert(1)</script></article>"
                + "<footer>© 2026</footer>");
        String text = UrlFetcher.extract(d).aiText();
        assertTrue(text.contains("1 cup lentils\n1 onion"), "one ingredient per line: " + text);
        assertFalse(text.contains("Home | Recipes"), "nav removed");
        assertFalse(text.contains("Share on Facebook"), "share block removed");
        assertFalse(text.contains("Great recipe"), "comments removed");
        assertFalse(text.contains("alert"), "scripts removed");
        assertFalse(text.contains("©"), "footer removed");
    }

    @Test
    void a_wrapper_named_like_furniture_is_kept_when_it_holds_the_recipe() {
        String steps = "<p>" + "Simmer the lentils for twenty minutes, stirring now and then. ".repeat(6) + "</p>";
        Document d = page("", "<article><div class=\"content-with-sidebar\"><h1>Soup</h1>"
                + "<ul><li>1 cup lentils</li></ul>" + steps + "</div><div class=\"sidebar\">Popular posts</div></article>");
        String text = UrlFetcher.extract(d).aiText();
        assertTrue(text.contains("1 cup lentils"), "the big wrapper stays");
        assertFalse(text.contains("Popular posts"), "the small sidebar goes");
    }

    @Test
    void an_empty_page_has_nothing_for_gemini() {
        UrlFetcher.Extracted ex = UrlFetcher.extract(page("<title>Loading…</title>", "<div id=\"root\"></div>"));
        assertEquals("", ex.aiText(), "a title alone isn't worth a Gemini call");
        assertNull(ex.partial());
    }

    @Test
    void ai_text_is_capped() {
        String huge = "<article>" + "<p>Stir the pot slowly and keep stirring.</p>".repeat(3000) + "</article>";
        assertTrue(UrlFetcher.extract(page("", huge)).aiText().length() <= UrlFetcher.AI_TEXT_MAX);
    }

    // --- Real-site shapes found while testing against live pages ---

    @Test
    void foody_shape_whole_method_in_one_string_goes_to_gemini() {
        // foody.co.il: one long instruction string with a WordPress caption inside, and the
        // whole dish's calories (serves 4) in a per-serving field.
        String method = "מכינים את הבצק. ".repeat(30)
                + "[caption id=\\\"attachment_1\\\" width=\\\"800\\\"] קראנץ תרד. צילום: מישהו[ caption] מגישים.";
        Document d = page(ld("{\"@type\":\"Recipe\",\"name\":\"שקשוקה\",\"recipeIngredient\":[\"ביצים\",\"עגבניות\"],"
                + "\"recipeInstructions\":\"" + method + "\",\"recipeYield\":\"4\","
                + "\"nutrition\":{\"@type\":\"NutritionInformation\",\"calories\":\"1827.7\"}}"), "");
        UrlFetcher.Extracted ex = UrlFetcher.extract(d);
        assertNull(ex.complete(), "one 400+ char step is not a finished recipe");
        Recipe p = ex.partial();
        assertNotNull(p, "but it's kept in case Gemini is down");
        assertFalse(p.getInstructions()[0].contains("caption"), "shortcode removed");
        assertFalse(p.getInstructions()[0].contains("צילום"), "photo credit removed with it");
        assertNull(p.getCaloriesPerServing(), "whole-dish calories dropped");
    }

    @Test
    void a_list_in_one_string_is_split_on_line_breaks() {
        Document d = page(ld("{\"@type\":\"Recipe\",\"name\":\"Tea\",\"recipeIngredient\":\"water\\nteabag<br>sugar\","
                + "\"recipeInstructions\":\"Boil water.\\r\\nSteep 3 minutes.\"}"), "");
        Recipe r = UrlFetcher.extract(d).complete();
        assertArrayEquals(new String[]{"water", "teabag", "sugar"}, r.getIngredients());
        assertArrayEquals(new String[]{"Boil water.", "Steep 3 minutes."}, r.getInstructions());
    }

    @Test
    void content_type_check_lets_pages_through_and_stops_files() {
        assertTrue(UrlFetcher.isPageType("text/html; charset=utf-8"));
        assertTrue(UrlFetcher.isPageType("application/xhtml+xml"));
        assertTrue(UrlFetcher.isPageType(null), "mako sends error pages with no Content-Type");
        assertTrue(UrlFetcher.isPageType(""));
        assertFalse(UrlFetcher.isPageType("image/jpeg"));
        assertFalse(UrlFetcher.isPageType("application/pdf"));
        assertFalse(UrlFetcher.isPageType("video/mp4"));
    }

    @Test
    void kobiedri_shape_line_fragments_are_joined_into_steps() {
        // Every line break published as its own HowToStep.
        String[] raw = {"מחממים סיר סוטאז׳ רחב ,", "חורצים כרעיים וצורבים על הצד של העור.",
                "אחרי כמה דקות מוסיפים מלח", "ומוסיפים מעט שמן זית,", "צורבים היטב עד השחמה מלאה",
                "לאותו הסיר מוסיפים תפוחי אדמה.", "For the glaze:", "and the honey.", "Mix the flour", "Bake."};
        assertEquals(java.util.List.of(
                "מחממים סיר סוטאז׳ רחב, חורצים כרעיים וצורבים על הצד של העור.",
                "אחרי כמה דקות מוסיפים מלח ומוסיפים מעט שמן זית, צורבים היטב עד השחמה מלאה",
                "לאותו הסיר מוסיפים תפוחי אדמה.",
                "For the glaze:", "and the honey.", "Mix the flour", "Bake."),
                UrlFetcher.mergeFragments(java.util.List.of(raw)),
                "commas and ו-openers join; full stops, section titles and plain new steps don't");
    }

    @Test
    void mako_shape_duplicate_block_is_sent_once_and_the_label_is_dropped() {
        String block = ld("{\"@type\":\"Recipe\",\"name\":\"מתכון: חלה מתוקה\",\"recipeIngredient\":[\"תבנית קפיצית בקוטר 28 ס\\\"מ\"],"
                + "\"recipeInstructions\":[\"לשים את הבצק\"]}");
        UrlFetcher.Extracted ex = UrlFetcher.extract(page(block + block, "<article><p>" + "1 ק\"ג קמח לבן. ".repeat(20) + "</p></article>"));
        assertEquals(1, ex.aiText().split("Structured recipe data", -1).length - 1);
        assertEquals("חלה מתוקה", ex.partial().getName());
    }

    // --- Recipe window: trimming a blog page down to its recipe ---

    private static final String STORY = "A long story about the dish and where it comes from, with tips. ".repeat(4);

    @Test
    void coach_shape_story_comments_and_more_recipes_are_cut() {
        String text = String.join("\n",
                STORY, "Who was General Tso?", STORY, "Frying until golden. צילום: אסף אמברם",
                "General Tso's chicken", "Serves 2-4, 30 minutes",
                "מצרכים:", "לרוטב:", "1 כף רסק עגבניות", "2 כפיות רוטב סויה",
                "אופן הכנה:", "Mix the sauce in a small bowl until the paste dissolves.",
                "Fry the chicken in batches of five or six pieces for about three minutes.",
                "Toss the chicken in the bubbling sauce and serve right away.",
                "הכנתם? איך יצא? ספרו בתגובות 🙂", "לעוד מתכונים אסיאתיים:", "Lemon chicken", "36 תגובות", "Great!!!");
        String w = UrlFetcher.recipeWindow(text);
        assertTrue(w.startsWith("General Tso's chicken"), "title kept, story and caption dropped: " + w);
        assertTrue(w.contains("1 כף רסק עגבניות") && w.contains("serve right away."));
        assertFalse(w.contains("long story"));
        assertFalse(w.contains("צילום"));
        assertFalse(w.contains("Lemon chicken"), "more-recipes links cut");
        assertFalse(w.contains("Great!!!"), "comments cut");
    }

    @Test
    void foody_shape_count_label_above_is_skipped_and_calories_are_kept() {
        String text = String.join("\n",
                "Shakshuka", STORY, "מרכיבים", "16", "קלוריות", "457", "רמת קושי", STORY, STORY,
                "כמות מנות", "4", "מצרכים", "7 ביצים", "2 קופסאות עגבניות",
                "אופן הכנה", "מטגנים פלפלים.", "שוברים ביצים.");
        String w = UrlFetcher.recipeWindow(text);
        assertTrue(w.startsWith("קלוריות 457"), "per-serving calories from the stats box carried along: " + w);
        assertTrue(w.contains("7 ביצים") && w.contains("שוברים ביצים."));
        assertFalse(w.contains("16"), "the count label's '16' is outside the window");
    }

    @Test
    void without_both_headers_or_with_too_little_left_the_text_stays_whole() {
        String noHeaders = STORY + "\n2 eggs\nMix and bake.";
        assertEquals(noHeaders, UrlFetcher.recipeWindow(noHeaders));
        String tiny = STORY + "\nIngredients\negg\nMethod\nboil";
        assertEquals(tiny, UrlFetcher.recipeWindow(tiny), "a 20-char window is more likely wrong than right");
    }
}

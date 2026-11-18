package recipeBot;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

// What the user actually sends: a phone's share sheet wraps the link in the page title.
class ScrapeServiceTest {

    @Test
    void finds_the_link_inside_shared_text() {
        assertEquals("https://www.foody.co.il/r/1",
                ScrapeService.findLink("שקשוקה אמאל'ה! 😋 https://www.foody.co.il/r/1"));
        assertEquals("https://site.com/a?b=1",
                ScrapeService.findLink("Look at this: https://site.com/a?b=1."), "trailing full stop dropped");
        assertEquals("https://site.com/x", ScrapeService.findLink("(https://site.com/x)"));
        assertEquals("https://site.com/x", ScrapeService.findLink("  https://site.com/x\n"));
    }

    @Test
    void lower_cases_a_capitalised_scheme_only() {
        assertEquals("https://Site.com/Path", ScrapeService.findLink("Https://Site.com/Path"),
                "phone keyboards capitalise the first letter; the path's case is kept");
    }

    @Test
    void no_link_means_no_fetch() {
        assertNull(ScrapeService.findLink("just some text"));
        assertNull(ScrapeService.findLink("javascript:alert(1)"));
        assertNull(ScrapeService.findLink("ftp://site.com/file"));
    }

    // --- Refusal reasons (no network: the fake database only answers canScrape) ---

    private static ScrapeService service(boolean allowed) {
        recipeBot.database.SupabaseHandler db = new recipeBot.database.SupabaseHandler("http://unused", "unused") {
            @Override public boolean canScrape(String userId) { return allowed; }
        };
        return new ScrapeService(db, "unused");
    }

    private static ScrapeService.Reason refusal(ScrapeService s, String input) {
        try {
            s.scrape("user-1", input);
            return null;
        } catch (ScrapeService.ScrapeException e) {
            return e.reason;
        }
    }

    @Test
    void no_permission_is_refused_first() {
        assertEquals(ScrapeService.Reason.NOT_ALLOWED, refusal(service(false), "https://site.com/r"));
    }

    @Test
    void input_without_a_link_never_uses_up_the_daily_imports() {
        ScrapeService s = service(true);
        // Far past the 15-a-day cap: a paste with no link fetches nothing, so it isn't counted.
        for (int i = 0; i < 30; i++) {
            assertEquals(ScrapeService.Reason.NO_LINK, refusal(s, "2 eggs\n1 cup flour\nWhisk and fry."));
        }
        assertEquals(ScrapeService.Reason.NO_LINK, refusal(s, "   "));
        assertEquals(ScrapeService.Reason.TOO_LONG, refusal(s, "https://site.com/" + "a".repeat(3000)));
    }

    @Test
    void each_reason_carries_its_http_status() {
        assertEquals(403, ScrapeService.Reason.NOT_ALLOWED.status);
        assertEquals(429, ScrapeService.Reason.RATE_DAY.status);
        assertEquals(422, ScrapeService.Reason.NO_RECIPE.status);
        assertEquals(503, ScrapeService.Reason.AI_BUSY.status);
    }

    // The web shows its own English/Hebrew text per reason. A reason added here without a line
    // there would reach users as the generic "couldn't import" — this keeps the two in step.
    @Test
    void every_reason_has_a_message_on_the_web() throws Exception {
        String web = java.nio.file.Files.readString(java.nio.file.Path.of("web/src/utils/importErrors.js"));
        for (ScrapeService.Reason r : ScrapeService.Reason.values()) {
            assertTrue(web.contains("  " + r.name() + ": {"), r.name() + " is missing from web/src/utils/importErrors.js");
        }
    }
}

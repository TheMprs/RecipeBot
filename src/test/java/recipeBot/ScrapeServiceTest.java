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
}

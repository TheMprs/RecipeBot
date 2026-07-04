package recipeBot;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class BotFormatTest {

    // Seam 1: colorEmoji(hex) — nearest palette colour → emoji circle; null/blank → ⚪.
    // Expected values are the intended web-palette→emoji mapping, chosen independently.
    @Test
    void colorEmoji_maps_palette_colours_to_their_circle() {
        assertEquals("🔴", BotFormat.colorEmoji("#e05c4b")); // tomato
        assertEquals("🟠", BotFormat.colorEmoji("#e67e22")); // brand orange
        assertEquals("🟡", BotFormat.colorEmoji("#e0a82e")); // honey
        assertEquals("🔵", BotFormat.colorEmoji("#4fa3a0")); // teal
        assertEquals("🟣", BotFormat.colorEmoji("#a25b8a")); // plum
        assertEquals("🟤", BotFormat.colorEmoji("#9c6b4a")); // cocoa
    }

    @Test
    void colorEmoji_falls_back_to_white_for_no_colour() {
        assertEquals("⚪", BotFormat.colorEmoji(null));
        assertEquals("⚪", BotFormat.colorEmoji(""));
        assertEquals("⚪", BotFormat.colorEmoji("   "));
    }

    @Test
    void colorEmoji_snaps_arbitrary_hex_to_nearest_palette_circle() {
        assertEquals("🔴", BotFormat.colorEmoji("#ff0000")); // pure red → tomato
        assertEquals("🟢", BotFormat.colorEmoji("#00ff00")); // pure green → a green
        assertEquals("🔴", BotFormat.colorEmoji("e05c4b"));   // tolerates missing '#'
    }

    // Seam 2: countSuffix(prepped, likes) — the stat tail shown after a recipe name.
    // Only non-zero stats appear; both zero → nothing to append.
    @Test
    void countSuffix_shows_only_nonzero_stats() {
        assertEquals("", BotFormat.countSuffix(0, 0));
        assertEquals(" 🍳 3", BotFormat.countSuffix(3, 0));
        assertEquals(" ❤️ 5", BotFormat.countSuffix(0, 5));
        assertEquals(" 🍳 3 ❤️ 5", BotFormat.countSuffix(3, 5));
    }

    @Test
    void countSuffix_treats_negatives_as_absent() {
        assertEquals("", BotFormat.countSuffix(-1, -2));
    }

    // Seam 3: splitLines — one item per line, trimmed, blanks dropped, and crucially
    // NO splitting on '.'/'!'/'?' (matches the web form; keeps "1. Mix" and "approx." whole).
    @Test
    void splitLines_splits_on_newlines_only() {
        assertArrayEquals(new String[]{"2 eggs", "1 cup flour"},
                BotFormat.splitLines("2 eggs\n1 cup flour"));
    }

    @Test
    void splitLines_does_not_split_on_periods() {
        assertArrayEquals(new String[]{"1. Mix well. Then rest."},
                BotFormat.splitLines("1. Mix well. Then rest."));
    }

    @Test
    void splitLines_trims_and_drops_blanks() {
        assertArrayEquals(new String[]{"a", "b"},
                BotFormat.splitLines("  a  \n\n   \n b "));
    }

    @Test
    void splitLines_handles_empty_and_null() {
        assertArrayEquals(new String[]{}, BotFormat.splitLines(""));
        assertArrayEquals(new String[]{}, BotFormat.splitLines(null));
    }
}

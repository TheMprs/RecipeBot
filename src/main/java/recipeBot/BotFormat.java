package recipeBot;

// Pure formatting helpers for the Telegram bot — kept free of I/O so they can be
// unit-tested at a real seam (see BotFormatTest). Stub for the red step.
public final class BotFormat {
    private BotFormat() {}

    // Web CATEGORY_PALETTE (utils/categoryColor.js) paired with its nearest emoji circle.
    private static final String[] PALETTE = {
        "e05c4b", "e67e22", "e0a82e", "8a9a4f", "5a9b6b", "4fa3a0", "a25b8a", "9c6b4a"
    };
    private static final String[] EMOJI = {
        "🔴",     "🟠",     "🟡",     "🟢",     "🟢",     "🔵",     "🟣",     "🟤"
    };
    private static final String NO_COLOUR = "⚪";

    // The palette hexes (no '#'), for building a colour picker.
    public static String[] paletteHexes() {
        return PALETTE.clone();
    }

    // Nearest-palette-colour emoji for a hex string (with or without '#').
    // null/blank/unparseable → white circle (the "no colour" swatch).
    public static String colorEmoji(String hex) {
        if (hex == null) return NO_COLOUR;
        String h = hex.trim();
        if (h.startsWith("#")) h = h.substring(1);
        if (h.length() != 6) return NO_COLOUR;
        int r, g, b;
        try {
            r = Integer.parseInt(h.substring(0, 2), 16);
            g = Integer.parseInt(h.substring(2, 4), 16);
            b = Integer.parseInt(h.substring(4, 6), 16);
        } catch (NumberFormatException e) {
            return NO_COLOUR;
        }
        int best = 0;
        long bestDist = Long.MAX_VALUE;
        for (int i = 0; i < PALETTE.length; i++) {
            int pr = Integer.parseInt(PALETTE[i].substring(0, 2), 16);
            int pg = Integer.parseInt(PALETTE[i].substring(2, 4), 16);
            int pb = Integer.parseInt(PALETTE[i].substring(4, 6), 16);
            long d = (long) (r - pr) * (r - pr) + (long) (g - pg) * (g - pg) + (long) (b - pb) * (b - pb);
            if (d < bestDist) { bestDist = d; best = i; }
        }
        return EMOJI[best];
    }

    // Stat tail appended after a recipe name in /list and previews. Each stat shows
    // only when positive; both absent → empty string (nothing to append).
    public static String countSuffix(int prepped, int likes) {
        StringBuilder sb = new StringBuilder();
        if (prepped > 0) sb.append(" 🍳 ").append(prepped);
        if (likes > 0) sb.append(" ❤️ ").append(likes);
        return sb.toString();
    }

    // One item per line: trims each line, drops blanks, never splits on punctuation
    // (so "1. Mix" and "approx." stay intact). Matches the web form's entry model.
    public static String[] splitLines(String text) {
        java.util.List<String> out = new java.util.ArrayList<>();
        if (text == null) return new String[0];
        for (String line : text.split("\n")) {
            String s = line.trim();
            if (!s.isEmpty()) out.add(s);
        }
        return out.toArray(new String[0]);
    }
}

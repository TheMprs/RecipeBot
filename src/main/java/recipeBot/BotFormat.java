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

    // Telegram rejects any message longer than this.
    public static final int TELEGRAM_LIMIT = 4096;

    // Joins whole lines into one message. If everything doesn't fit in `limit`, it keeps
    // the lines that do and ends with `tail` (the "..." + website link) instead. Cutting
    // only between lines means an HTML tag is never split. Length is measured on the HTML
    // source, which is never shorter than the text Telegram counts — so this errs safe.
    public static String fitMessage(java.util.List<String> lines, String tail, int limit) {
        String full = String.join("", lines);
        if (full.length() <= limit) return full;
        StringBuilder sb = new StringBuilder();
        for (String line : lines) {
            if (sb.length() + line.length() + tail.length() > limit) break;
            sb.append(line);
        }
        return sb.append(tail).toString();
    }

    // Group titles inside a recipe's lists ("לרוטב:", "For the sauce:"): a short line ending in
    // a colon. Same rule as the web's utils/recipeLines.js — keep the two in step.
    private static final int HEADING_MAX = 40;

    public static boolean isGroupHeading(String line) {
        if (line == null) return false;
        String s = line.trim();
        return s.length() > 1 && s.length() <= HEADING_MAX && (s.endsWith(":") || s.endsWith("："));
    }

    // Step number for each line, 0 for titles. Numbering runs on across groups, like the web.
    public static int[] stepNumbers(String[] lines) {
        int[] out = new int[lines == null ? 0 : lines.length];
        int n = 0;
        for (int i = 0; i < out.length; i++) out[i] = isGroupHeading(lines[i]) ? 0 : ++n;
        return out;
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

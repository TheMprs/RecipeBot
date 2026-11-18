package recipeBot;

import recipeBot.database.SupabaseHandler;

/**
 * Single chokepoint for URL recipe import. Both the web ({@code webManager}) and the
 * Telegram bot ({@code Bot}) call {@link #scrape} — permission and rate-limit gating live
 * HERE, inside the scrape, so neither surface can bypass them. One shared instance keeps the
 * rate-limit counters global across both.
 */
public class ScrapeService {

    /**
     * Why an import was refused. The web turns {@code name()} into its own English/Hebrew
     * message (web/src/utils/importErrors.js) and decides from it whether to offer "Paste text
     * instead"; the bot shows {@link #message}. Keep the names in step with the web's table.
     */
    public enum Reason {
        NOT_ALLOWED(403, "URL import isn't enabled for your account yet."),
        RATE_MINUTE(429, "Too many imports in a row. Wait a minute and try again."),
        RATE_DAY(429, "You've used today's imports. Try again tomorrow."),
        RATE_GLOBAL(429, "Imports are paused for today. Try again tomorrow."),
        NO_LINK(400, "That doesn't look like a link. Send the recipe page's address."),
        TOO_LONG(400, "That link is too long."),
        SITE_BLOCKED(400, "That site didn't let us read the page. Copy the recipe text from it instead."),
        NOT_A_PAGE(400, "That link is a file, not a recipe page."),
        NO_RECIPE(422, "We couldn't find a recipe on that page."),
        AI_BUSY(503, "Recipe reading is busy right now. Try again in a few minutes."),
        FAILED(400, "Couldn't read a recipe from that link.");

        public final int status;
        public final String message;
        Reason(int status, String message) { this.status = status; this.message = message; }
    }

    /** Thrown when a scrape is refused. {@link #status} is the HTTP code the web returns. */
    public static class ScrapeException extends Exception {
        public final int status;
        public final Reason reason;
        public ScrapeException(Reason reason) {
            super(reason.message);
            this.status = reason.status;
            this.reason = reason;
        }
    }

    // Rate limits — protect the shared Gemini free-tier quota (keeps the project at $0).
    // ponytail: in-memory, per-instance, resets on restart, UTC day boundary (~ Gemini's Pacific
    // reset). Counts every scrape attempt — an upper bound, so we may stop a little early but never
    // exceed the Gemini ceiling. Move to a shared store only if scaled out to multiple instances.
    private static final int PER_MIN = 10;            // per-user burst guard
    private static final long MIN_WINDOW_MS = 60_000;
    private static final int USER_PER_DAY = 15;       // per-user fairness cap
    private static final int GLOBAL_PER_DAY = 400;    // under gemini-3.5-flash-lite's 500/day free tier; retries count there too
    private final java.util.Map<String, long[]> minHits = new java.util.HashMap<>(); // userId -> {windowStart, count}
    private final java.util.Map<String, long[]> dayHits = new java.util.HashMap<>(); // userId -> {dayIdx, count}
    private final long[] globalDay = {0, 0};                                         // {dayIdx, count}

    private final SupabaseHandler db;
    private final GeminiHandler gemini;

    public ScrapeService(SupabaseHandler db, String geminiKey) {
        this.db = db;
        this.gemini = new GeminiHandler(geminiKey);
    }

    /**
     * Permission-checks, rate-limits, and fetches a recipe from {@code url}.
     * Returns the extracted (unsaved) recipe, or throws {@link ScrapeException} with a
     * user-facing message and HTTP status if refused or extraction fails.
     */
    public Recipe scrape(String userId, String url) throws ScrapeException {
        if (!db.canScrape(userId)) {
            throw new ScrapeException(Reason.NOT_ALLOWED);
        }
        // Checked before the rate limit: a paste with no link in it fetches nothing, so it
        // shouldn't use up one of the day's imports.
        if (url == null || url.trim().isEmpty()) throw new ScrapeException(Reason.NO_LINK);
        if (url.length() > MAX_URL_LENGTH) throw new ScrapeException(Reason.TOO_LONG);
        String link = findLink(url);
        if (link == null) throw new ScrapeException(Reason.NO_LINK);

        Reason limited = checkLimit(userId);
        if (limited != null) throw new ScrapeException(limited);

        Recipe recipe;
        try {
            recipe = UrlFetcher.fetchRecipe(link, gemini);
        } catch (UrlFetcher.SiteRefusedException e) {
            log(userId, e);
            throw new ScrapeException(Reason.SITE_BLOCKED);
        } catch (UrlFetcher.NotAPageException e) {
            log(userId, e);
            throw new ScrapeException(Reason.NOT_A_PAGE);
        } catch (GeminiHandler.AiException e) {
            log(userId, e);
            switch (e.kind) {
                case NOT_RECIPE -> throw new ScrapeException(Reason.NO_RECIPE);
                case UNAVAILABLE -> throw new ScrapeException(Reason.AI_BUSY);
                default -> throw new ScrapeException(Reason.FAILED);
            }
        } catch (Exception e) {
            // Log the detail server-side; don't leak internal error/host info to the client.
            log(userId, e);
            throw new ScrapeException(Reason.FAILED);
        }
        // Every path sanitizes already; this is the last gate before the user sees it, so it
        // runs again rather than trusting that a future source remembered to.
        recipe = RecipeSanitizer.clean(recipe);
        // Null or empty arrays would break the bot's preview, so an incomplete recipe
        // counts as a failed extraction.
        if (!RecipeSanitizer.isUsable(recipe)) {
            throw new ScrapeException(Reason.NO_RECIPE);
        }
        return recipe;
    }

    private static final int MAX_URL_LENGTH = 2048;

    // A phone's share sheet sends "Shakshuka 😋 https://site/recipe" — the title around the
    // link made the whole message an invalid URL. Take the first http(s) link in the text,
    // and lower-case its scheme: keyboards capitalise the first letter ("Https://…").
    static String findLink(String text) {
        java.util.regex.Matcher m = java.util.regex.Pattern
                .compile("(?i)\\bhttps?://[^\\s<>\"']+").matcher(text);
        if (!m.find()) return null;
        String link = m.group().replaceAll("[).,!?;:'\"»”]+$", ""); // sentence punctuation after the link
        int colon = link.indexOf(':');
        return link.substring(0, colon).toLowerCase(java.util.Locale.ROOT) + link.substring(colon);
    }

    private static void log(String userId, Exception e) {
        System.err.println("[Scrape] failed for user " + userId + ": " + e);
    }

    // Returns the limit the user is over, else null and commits the hit.
    // One lock — scraping is low-frequency. Counters commit only when the call is allowed.
    private synchronized Reason checkLimit(String userId) {
        long now = System.currentTimeMillis();
        long day = now / 86_400_000L;

        // Bound memory: drop entries that can no longer matter (window elapsed / previous day).
        if (minHits.size() + dayHits.size() > 10_000) {
            minHits.values().removeIf(v -> now - v[0] >= MIN_WINDOW_MS);
            dayHits.values().removeIf(v -> v[0] != day);
        }

        long[] m = minHits.get(userId);
        boolean sameMin = m != null && now - m[0] < MIN_WINDOW_MS;
        if (sameMin && m[1] >= PER_MIN) return Reason.RATE_MINUTE;

        long[] d = dayHits.get(userId);
        boolean sameDay = d != null && d[0] == day;
        if (sameDay && d[1] >= USER_PER_DAY) return Reason.RATE_DAY;

        boolean globalSameDay = globalDay[0] == day;
        if (globalSameDay && globalDay[1] >= GLOBAL_PER_DAY) return Reason.RATE_GLOBAL;

        // all clear — commit
        if (sameMin) m[1]++; else minHits.put(userId, new long[]{now, 1});
        if (sameDay) d[1]++; else dayHits.put(userId, new long[]{day, 1});
        if (globalSameDay) globalDay[1]++; else { globalDay[0] = day; globalDay[1] = 1; }
        return null;
    }
}

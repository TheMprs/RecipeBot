package recipeBot;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.nodes.Node;
import org.jsoup.nodes.TextNode;
import org.jsoup.select.NodeTraversor;
import org.jsoup.select.NodeVisitor;

import java.net.InetAddress;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

public class UrlFetcher {

    private static final int MAX_REDIRECTS = 3;
    private static final int TIMEOUT_MS = 8000;
    // A recipe page is well under this; anything bigger is a download, not a page. Jsoup
    // stops reading at the cap, so a hostile endless response can't fill memory.
    private static final int MAX_BODY_BYTES = 2 * 1024 * 1024;
    // What Gemini sees, in characters. Structured hints get the first share, page text the rest.
    static final int AI_TEXT_MAX = 20000;
    private static final int AI_HINT_MAX = 8000;
    // Below this much text a candidate container is a teaser or an empty JS shell.
    private static final int MIN_CONTENT_CHARS = 200;

    /** The site answered, but not with a page we can read (blocked, missing, error). */
    public static class SiteRefusedException extends Exception {
        public SiteRefusedException(String m) { super(m); }
    }

    /** The link points at a file (image, PDF, video), not a web page. */
    public static class NotAPageException extends Exception {
        public NotAPageException(String m) { super(m); }
    }

    private static String userAgent() {
        return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    }

    /**
     * What a page offers, worked out without any network or AI call:
     * {@code complete} — a recipe from structured data good enough to use as is;
     * {@code partial}  — structured data with something in every field, kept in case Gemini is down;
     * {@code aiText}   — the text to hand Gemini when there is no complete recipe.
     */
    record Extracted(Recipe complete, Recipe partial, String aiText) {}

    // Fetch a URL and return a recipe. Structured data first (free, instant), Gemini only
    // when the page has no complete recipe. JSON-LD-first is a speed/cost win, NOT a security
    // control: a hostile page just omits it to force the Gemini path, which is why every
    // result, from either source, goes through RecipeSanitizer.
    public static Recipe fetchRecipe(String rawUrl, GeminiHandler gemini) throws Exception {
        Extracted ex = extract(fetchDocument(rawUrl));
        if (ex.complete() != null) return ex.complete();
        if (ex.aiText().isEmpty()) {
            if (ex.partial() != null) return ex.partial();
            throw new GeminiHandler.AiException(GeminiHandler.AiException.Kind.NOT_RECIPE, "empty page");
        }
        try {
            return gemini.extractRecipeFromText(ex.aiText());
        } catch (GeminiHandler.AiException e) {
            // Gemini down or out of quota: a partial recipe the user can fix beats a dead end.
            if (e.kind == GeminiHandler.AiException.Kind.UNAVAILABLE && ex.partial() != null) {
                System.err.println("[Scrape] Gemini unavailable, returning partial structured data");
                return ex.partial();
            }
            throw e;
        }
    }

    private static Document fetchDocument(String rawUrl) throws Exception {
        // Follow redirects manually so every hop goes through validateUrl —
        // jsoup's built-in redirect handling would only validate the first URL
        String url = rawUrl.trim();
        org.jsoup.Connection.Response res;
        int hops = 0;
        while (true) {
            validateUrl(url);
            res = org.jsoup.Jsoup.connect(url)
                    .userAgent(userAgent())
                    .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8")
                    .header("Accept-Language", "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7")
                    .referrer("https://www.google.com")
                    .followRedirects(false)
                    .ignoreHttpErrors(true)
                    // Checked below, after the status: an error page often has no
                    // Content-Type, and jsoup's own check would call it a file.
                    .ignoreContentType(true)
                    .maxBodySize(MAX_BODY_BYTES)
                    .timeout(TIMEOUT_MS)
                    .execute();

            int status = res.statusCode();
            if (status < 300 || status >= 400) break;

            String location = res.header("Location");
            if (location == null || location.isEmpty()) break;
            if (++hops > MAX_REDIRECTS) {
                throw new Exception("Too many redirects");
            }
            url = res.url().toURI().resolve(location.trim()).toString();
        }
        // An error or bot-wall page used to go to Gemini as if it were the recipe.
        if (res.statusCode() >= 300) {
            throw new SiteRefusedException("HTTP " + res.statusCode());
        }
        if (!isPageType(res.contentType())) throw new NotAPageException(res.contentType());
        return res.parse();
    }

    // HTML, XHTML or plain text. A missing header gets the benefit of the doubt; a stated
    // image, PDF, video or binary type doesn't.
    static boolean isPageType(String contentType) {
        if (contentType == null || contentType.isBlank()) return true;
        String t = contentType.toLowerCase(Locale.ROOT).split(";")[0].trim();
        return t.startsWith("text/") || t.endsWith("/xml") || t.endsWith("+xml");
    }

    // *** Extraction (pure — no network, so the tests exercise it directly) ***

    static Extracted extract(Document doc) {
        Recipe partial = null;
        StringBuilder hints = new StringBuilder();

        // 1. JSON-LD
        for (JsonElement root : jsonBlocks(doc, "script[type=application/ld+json]")) {
            JsonObject node = findTyped(root, "Recipe", 0);
            if (node == null) continue;
            Recipe r = RecipeSanitizer.clean(toRecipe(node));
            if (RecipeSanitizer.isComplete(r)) return new Extracted(r, null, "");
            if (partial == null && RecipeSanitizer.isUsable(r)) partial = r;
            appendHint(hints, "Structured recipe data from the page:", node.toString());
        }

        // 2. Microdata (itemprop markup — older WordPress themes, some Hebrew sites)
        Element scope = microdataRecipe(doc);
        if (scope != null) {
            Recipe r = RecipeSanitizer.clean(fromMicrodata(scope));
            if (RecipeSanitizer.isComplete(r)) return new Extracted(r, null, "");
            if (partial == null && RecipeSanitizer.isUsable(r)) partial = r;
        }

        // 3. Framework data blobs (Next.js __NEXT_DATA__ and friends). Sites that build the page
        // in the browser leave almost no text in the HTML — the recipe lives only here.
        for (JsonElement root : jsonBlocks(doc, "script[type=application/json]")) {
            JsonObject node = findTyped(root, "Recipe", 0);
            if (node != null) {
                Recipe r = RecipeSanitizer.clean(toRecipe(node));
                if (RecipeSanitizer.isComplete(r)) return new Extracted(r, null, "");
                if (partial == null && RecipeSanitizer.isUsable(r)) partial = r;
                appendHint(hints, "Structured recipe data from the page:", node.toString());
                continue;
            }
            JsonObject like = findRecipeLike(root, 0);
            if (like != null) appendHint(hints, "Recipe data from the page's scripts:", like.toString());
        }

        // 4. Page text, cleaned, for Gemini. Sent alongside any partial structured data rather
        // than instead of it: when JSON-LD is partial, the missing part is usually in the text.
        StringBuilder ai = new StringBuilder();
        String title = pageTitle(doc);
        if (!title.isEmpty()) ai.append("Page title: ").append(title).append("\n\n");
        if (hints.length() > 0) ai.append(cap(hints.toString(), AI_HINT_MAX)).append("\n\n");
        String body = recipeWindow(blockText(contentRoot(doc)));
        if (!body.isEmpty()) ai.append("Page text:\n").append(body);
        // A title alone is not something to spend a Gemini call on.
        String aiText = (hints.length() == 0 && body.isEmpty()) ? "" : cap(ai.toString().trim(), AI_TEXT_MAX);
        return new Extracted(null, partial, aiText);
    }

    private static void appendHint(StringBuilder sb, String label, String json) {
        if (sb.length() >= AI_HINT_MAX) return;
        // mako ships the same JSON-LD block twice; once is enough for Gemini.
        if (sb.indexOf(readable(json)) >= 0) return;
        sb.append(label).append('\n').append(readable(json)).append("\n\n");
    }

    private static List<JsonElement> jsonBlocks(Document doc, String selector) {
        List<JsonElement> out = new ArrayList<>();
        for (Element script : doc.select(selector)) {
            try {
                out.add(JsonParser.parseString(script.html()));
            } catch (Exception e) {
                // malformed block — skip it
            }
        }
        return out;
    }

    private static String pageTitle(Document doc) {
        Element og = doc.selectFirst("meta[property=og:title]");
        String t = og != null ? og.attr("content") : doc.title();
        String clean = RecipeSanitizer.text(t);
        return clean == null ? "" : RecipeSanitizer.cap(clean, 200);
    }

    static String cap(String s) {
        return cap(s, AI_TEXT_MAX);
    }

    private static String cap(String s, int max) {
        return s.length() > max ? s.substring(0, max) : s;
    }

    // Many sites write JSON-LD with every non-ASCII letter escaped ("פא…"), so a
    // Hebrew recipe reached Gemini as ~4x its size in codes it then had to decode. Parsing and
    // re-serializing gives the same data as plain text (Gson only escapes quotes, backslashes
    // and control characters). Unparseable blocks are passed through as they were.
    static String readable(String json) {
        try {
            return JsonParser.parseString(json).toString();
        } catch (Exception e) {
            return json;
        }
    }

    // *** JSON (JSON-LD and framework blobs) ***

    // Framework blobs can be large and deeply nested; this bounds the walk.
    private static final int MAX_DEPTH = 40;

    // A node of the given @type anywhere in the tree: inside arrays, @graph wrappers,
    // mainEntity, or a framework blob's props.
    static JsonObject findTyped(JsonElement el, String type, int depth) {
        if (el == null || depth > MAX_DEPTH) return null;
        if (el.isJsonArray()) {
            for (JsonElement e : el.getAsJsonArray()) {
                JsonObject r = findTyped(e, type, depth + 1);
                if (r != null) return r;
            }
            return null;
        }
        if (!el.isJsonObject()) return null;
        JsonObject o = el.getAsJsonObject();
        if (hasType(o, type)) return o;
        for (var entry : o.entrySet()) {
            JsonObject r = findTyped(entry.getValue(), type, depth + 1);
            if (r != null) return r;
        }
        return null;
    }

    private static final java.util.regex.Pattern INGREDIENT_KEY =
            java.util.regex.Pattern.compile("(?i).*ingredient.*");
    private static final java.util.regex.Pattern STEP_KEY =
            java.util.regex.Pattern.compile("(?i).*(instruction|step|method|direction|preparation).*");

    // No schema.org type in the blob: look for the innermost object holding both an
    // ingredients-like and a steps-like list. Only ever used as a hint for Gemini, never
    // trusted as a recipe on its own — key names in app data mean nothing for certain.
    static JsonObject findRecipeLike(JsonElement el, int depth) {
        if (el == null || depth > MAX_DEPTH) return null;
        if (el.isJsonArray()) {
            for (JsonElement e : el.getAsJsonArray()) {
                JsonObject r = findRecipeLike(e, depth + 1);
                if (r != null) return r;
            }
            return null;
        }
        if (!el.isJsonObject()) return null;
        JsonObject o = el.getAsJsonObject();
        for (var entry : o.entrySet()) {          // innermost match wins
            JsonObject r = findRecipeLike(entry.getValue(), depth + 1);
            if (r != null) return r;
        }
        boolean ing = false, steps = false;
        for (var entry : o.entrySet()) {
            boolean nonEmpty = (entry.getValue().isJsonArray() && entry.getValue().getAsJsonArray().size() > 0)
                    || (entry.getValue().isJsonPrimitive() && entry.getValue().getAsString().length() > 20);
            if (!nonEmpty) continue;
            if (INGREDIENT_KEY.matcher(entry.getKey()).matches()) ing = true;
            else if (STEP_KEY.matcher(entry.getKey()).matches()) steps = true;
        }
        return ing && steps ? o : null;
    }

    private static boolean hasType(JsonObject o, String type) {
        if (!o.has("@type")) return false;
        JsonElement t = o.get("@type");
        if (t.isJsonArray()) {
            for (JsonElement e : t.getAsJsonArray()) {
                if (e.isJsonPrimitive() && type.equals(e.getAsString())) return true;
            }
            return false;
        }
        return t.isJsonPrimitive() && type.equals(t.getAsString());
    }

    private static Recipe toRecipe(JsonObject o) {
        String[] ing = stringList(o.get("recipeIngredient")).toArray(new String[0]);
        if (ing.length == 0) ing = stringList(o.get("ingredients")).toArray(new String[0]); // pre-2017 schema name
        String[] instr = mergeFragments(instructionList(o.get("recipeInstructions"))).toArray(new String[0]);
        Recipe r = new Recipe(str(o, "name"), firstString(o.get("recipeCategory")), str(o, "description"), ing, instr);
        r.setCaloriesPerServing(caloriesFrom(o.get("nutrition")));
        return r;
    }

    // nutrition is a NutritionInformation object (sometimes wrapped in an array) whose
    // calories is "250 kcal", "250 calories", "250" or a bare number.
    private static Integer caloriesFrom(JsonElement nutrition) {
        if (nutrition == null) return null;
        if (nutrition.isJsonArray() && nutrition.getAsJsonArray().size() > 0) {
            nutrition = nutrition.getAsJsonArray().get(0);
        }
        if (!nutrition.isJsonObject()) return null;
        JsonElement c = nutrition.getAsJsonObject().get("calories");
        if (c == null || !c.isJsonPrimitive()) return null;
        return parseCalories(c.getAsString());
    }

    static Integer parseCalories(String s) {
        if (s == null) return null;
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("(\\d{1,5}(?:[.,]\\d+)?)").matcher(s);
        if (!m.find()) return null;
        try {
            return RecipeSanitizer.calories((int) Math.round(Double.parseDouble(m.group(1).replace(',', '.'))));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    // Decoding here as well as in RecipeSanitizer: JSON-LD strings are raw JSON, so HTML
    // entities (&rdquo;, &amp;, &nbsp; …) survive unescaped — Jsoup only decodes them in
    // parsed page text, not here.
    private static String clean(String s) {
        return org.jsoup.parser.Parser.unescapeEntities(s, false).trim();
    }

    private static String str(JsonObject o, String key) {
        JsonElement e = o.get(key);
        return (e != null && e.isJsonPrimitive()) ? clean(e.getAsString()) : null;
    }

    private static String firstString(JsonElement e) {
        if (e == null) return null;
        if (e.isJsonPrimitive()) return clean(e.getAsString());
        if (e.isJsonArray() && e.getAsJsonArray().size() > 0) {
            JsonElement f = e.getAsJsonArray().get(0);
            if (f.isJsonPrimitive()) return clean(f.getAsString());
        }
        return null;
    }

    private static List<String> stringList(JsonElement e) {
        List<String> out = new ArrayList<>();
        if (e == null) return out;
        if (e.isJsonArray()) {
            for (JsonElement x : e.getAsJsonArray()) {
                if (x.isJsonPrimitive()) {
                    addLines(x.getAsString(), out);
                } else if (x.isJsonArray()) {
                    out.addAll(stringList(x)); // some sites nest the list: [["a", "b"]]
                }
            }
        } else if (e.isJsonPrimitive()) {
            addLines(e.getAsString(), out);
        }
        return out;
    }

    // Some sites put a whole list in one string, one item per line. The sanitizer would
    // collapse those line breaks into spaces, so they are split here first.
    private static void addLines(String raw, List<String> out) {
        for (String line : raw.split("\\r?\\n|<br\\s*/?>")) {
            String s = clean(line);
            if (!s.isEmpty()) out.add(s);
        }
    }

    // recipeInstructions can be plain strings, HowToStep objects, or HowToSection
    // wrappers nesting steps under itemListElement — flatten them all to text.
    private static List<String> instructionList(JsonElement e) {
        List<String> out = new ArrayList<>();
        if (e == null) return out;
        if (e.isJsonArray()) {
            for (JsonElement x : e.getAsJsonArray()) collectInstruction(x, out);
        } else {
            collectInstruction(e, out);
        }
        return out;
    }

    private static void collectInstruction(JsonElement x, List<String> out) {
        if (x == null) return;
        if (x.isJsonPrimitive()) {
            addLines(x.getAsString(), out);
            return;
        }
        if (!x.isJsonObject()) return;
        JsonObject o = x.getAsJsonObject();
        if (o.has("itemListElement")) { // HowToSection
            // The section's name ("For the sauce") used to be dropped, merging two
            // separate methods into one list. It is kept as its own line ending in a colon.
            String title = str(o, "name");
            if (title != null && !title.isEmpty()) out.add(sectionTitle(title));
            JsonElement items = o.get("itemListElement");
            if (items != null && items.isJsonArray()) {
                for (JsonElement it : items.getAsJsonArray()) collectInstruction(it, out);
            } else {
                collectInstruction(items, out);
            }
            return;
        }
        String text = str(o, "text");
        if (text == null) text = str(o, "name");
        if (text != null && !text.isEmpty()) out.add(text);
    }

    // Some sites publish every line break of the method as its own step (kobiedri.co.il:
    // "Heat a wide pan ," / "score the legs…"). A step that ends mid-sentence is joined
    // with the next one when the break is unmistakable: it ends in a comma, or it has no
    // closing punctuation and the next step opens with a joining word — Hebrew ו ("and…"),
    // or English and/then/until/or.
    static List<String> mergeFragments(List<String> steps) {
        List<String> out = new ArrayList<>();
        for (String s : steps) {
            if (!out.isEmpty() && continues(out.get(out.size() - 1), s)) {
                String prev = out.remove(out.size() - 1).replaceAll("\\s+([,،])$", "$1");
                out.add(prev + " " + s);
            } else {
                out.add(s);
            }
        }
        return out;
    }

    private static final java.util.regex.Pattern JOINING_START =
            java.util.regex.Pattern.compile("^(ו[\\u05D0-\\u05EA]|(?:and|then|until|or)\\b)");

    private static boolean continues(String prev, String next) {
        String p = prev.trim(), n = next.trim();
        if (p.isEmpty() || n.isEmpty()) return false;
        char last = p.charAt(p.length() - 1);
        if (last == ',' || last == '،') return true;
        if (".!?:：…;".indexOf(last) >= 0) return false; // a finished sentence or a section title
        return JOINING_START.matcher(n).find();
    }

    private static String sectionTitle(String s) {
        return (s.endsWith(":") || s.endsWith("：")) ? s : s + ":";
    }

    // *** Microdata ***

    private static Element microdataRecipe(Document doc) {
        for (Element el : doc.select("[itemscope][itemtype]")) {
            String t = el.attr("itemtype").trim().toLowerCase(Locale.ROOT);
            if (t.endsWith("schema.org/recipe")) return el;
        }
        return null;
    }

    private static Recipe fromMicrodata(Element scope) {
        String name = firstProp(scope, "name");
        String desc = firstProp(scope, "description");
        String cat = firstProp(scope, "recipeCategory");
        List<String> ing = new ArrayList<>();
        for (Element e : props(scope, "recipeIngredient")) ing.add(propValue(e));
        if (ing.isEmpty()) for (Element e : props(scope, "ingredients")) ing.add(propValue(e));
        List<String> steps = new ArrayList<>();
        for (Element e : props(scope, "recipeInstructions")) steps.addAll(stepsIn(e));
        Recipe r = new Recipe(name, cat, desc, ing.toArray(new String[0]), mergeFragments(steps).toArray(new String[0]));
        Element cal = scope.selectFirst("[itemprop=calories]");
        if (cal != null) r.setCaloriesPerServing(parseCalories(propValue(cal)));
        return r;
    }

    // Elements carrying this itemprop whose own item is the recipe — so the author's
    // "name" or a review's "description" isn't read as the recipe's.
    private static List<Element> props(Element scope, String prop) {
        List<Element> out = new ArrayList<>();
        for (Element e : scope.select("[itemprop]")) {
            if (!java.util.Arrays.asList(e.attr("itemprop").trim().split("\\s+")).contains(prop)) continue;
            if (ownerScope(e) == scope) out.add(e);
        }
        return out;
    }

    private static Element ownerScope(Element e) {
        for (Element p = e.parent(); p != null; p = p.parent()) {
            if (p.hasAttr("itemscope")) return p;
        }
        return null;
    }

    private static String firstProp(Element scope, String prop) {
        List<Element> l = props(scope, prop);
        return l.isEmpty() ? null : propValue(l.get(0));
    }

    private static String propValue(Element e) {
        if (e.hasAttr("content")) return e.attr("content");
        return e.text();
    }

    // One recipeInstructions element may hold a single step, a list, or a HowToStep scope.
    private static List<String> stepsIn(Element e) {
        List<String> out = new ArrayList<>();
        if (e.hasAttr("content")) { out.add(e.attr("content")); return out; }
        Element text = e.hasAttr("itemscope") ? e.selectFirst("[itemprop=text]") : null;
        if (text != null) { out.add(text.text()); return out; }
        var items = e.select("li");
        if (items.isEmpty()) items = e.select("p");
        if (items.isEmpty()) out.add(e.text());
        else for (Element li : items) out.add(li.text());
        return out;
    }

    // *** Page text for Gemini ***

    // Containers that hold a recipe and little else, best first. Recipe-card plugins
    // (WPRM, Tasty, Mediavine) are the tightest; article/main are the fallback.
    private static final String[] CONTENT_SELECTORS = {
            ".wprm-recipe-container", ".wprm-recipe", ".tasty-recipes", ".mv-create-card",
            "[class*=recipe-card]", "article", "main", "[role=main]"
    };

    private static final String ALWAYS_NOISE =
            "script, style, noscript, template, svg, iframe, form, nav, footer, aside, button, select, "
            + "[role=navigation], [role=banner], [role=contentinfo], [aria-hidden=true], [hidden]";

    // class/id words that mark a block as page furniture, matched on whole words of the
    // class name so "recipe-share" goes but "shared-kitchen-recipe" isn't misread.
    private static final Set<String> NOISE_WORDS = Set.of(
            "comment", "comments", "related", "share", "sharing", "social", "newsletter",
            "advert", "ads", "ad", "promo", "cookie", "breadcrumb", "breadcrumbs", "sidebar",
            "widget", "popup", "modal", "subscribe");

    // The part of the page the recipe is in, with menus, comments, ads and scripts removed.
    // Works on a copy — the caller's document is left as fetched.
    static Element contentRoot(Document original) {
        Document doc = original.clone();
        Element micro = microdataRecipe(doc);
        Element root = null;
        if (micro != null && micro.text().length() >= MIN_CONTENT_CHARS) root = micro;
        for (int i = 0; root == null && i < CONTENT_SELECTORS.length; i++) {
            for (Element c : doc.select(CONTENT_SELECTORS[i])) {
                if (c.text().length() >= MIN_CONTENT_CHARS) { root = c; break; }
            }
        }
        if (root == null) root = doc.body();
        if (root == null) return doc;

        root.select(ALWAYS_NOISE).remove();
        int total = Math.max(1, root.text().length());
        for (Element e : root.select("[class], [id]")) {
            if (e == root || e.parent() == null || !isNoise(e)) continue;
            // A wrapper named e.g. "content-with-sidebar" can hold the recipe itself. Only
            // drop blocks that are a minor part of the page.
            if (e.text().length() * 10 < total * 4) e.remove();
        }
        return root;
    }

    private static boolean isNoise(Element e) {
        String names = (e.className() + " " + e.id()).toLowerCase(Locale.ROOT);
        for (String w : names.split("[\\s_-]+")) {
            if (NOISE_WORDS.contains(w)) return true;
        }
        return false;
    }

    // The element's text with its line structure kept. doc.text() ran a whole page into one
    // line, so Gemini had to guess where one ingredient ended and the next began.
    static String blockText(Element root) {
        StringBuilder sb = new StringBuilder();
        NodeTraversor.traverse(new NodeVisitor() {
            @Override public void head(Node node, int depth) {
                if (node instanceof TextNode t) sb.append(t.text());
                else if (node instanceof Element e && (e.isBlock() || e.tagName().equals("br"))) sb.append('\n');
            }
            @Override public void tail(Node node, int depth) {
                if (node instanceof Element e && e.isBlock()) sb.append('\n');
            }
        }, root);
        StringBuilder out = new StringBuilder();
        String prev = null;
        for (String line : sb.toString().split("\n")) {
            String l = line.replace(' ', ' ').replaceAll("\\s+", " ").trim();
            if (l.isEmpty() || l.equals(prev)) continue;
            out.append(l).append('\n');
            prev = l;
        }
        return out.toString().trim();
    }

    // *** Recipe window: the part of the page text that is the recipe ***

    // Same header words the web paste parser trusts (parseRecipeText.js), plus a few site
    // variants seen live ("המרכיבים" on mako).
    private static final Set<String> ING_HEADERS = Set.of(
            "ingredients", "ingredient", "you will need", "what you need", "shopping list",
            "מצרכים", "המצרכים", "רכיבים", "הרכיבים", "מרכיבים", "המרכיבים", "חומרים", "החומרים", "רשימת מצרכים");
    private static final Set<String> INS_HEADERS = Set.of(
            "instructions", "directions", "method", "preparation", "steps", "how to make",
            "הוראות", "הוראות הכנה", "אופן ההכנה", "אופן הכנה", "הכנה", "ההכנה", "אופן העבודה", "שלבי ההכנה");

    // Lines where a recipe page's recipe is over: comment counts, "more recipes", typo reports.
    private static final java.util.regex.Pattern TAIL = java.util.regex.Pattern.compile(
            "^(?:\\d+\\s*תגובות|תגובות$|לעוד מתכונים|עוד מתכונים|מתכונים נוספים|מתכונים דומים|אולי יעניין|"
            + "הכנתם\\?|מצאתם טעות|\\d+\\s+comments?$|comments$|leave a (?:comment|reply)|"
            + "(?:related|more|similar) recipes|you (?:may|might) also like)",
            java.util.regex.Pattern.CASE_INSENSITIVE);

    // Photo captions end with the photographer's credit; they describe a picture, not a step.
    private static final java.util.regex.Pattern PHOTO_CREDIT =
            java.util.regex.Pattern.compile("(?i)(צילום|photo(?:graph)?(?: credit)?|credit)\\s*:");

    private static final java.util.regex.Pattern CALORIE_LINE =
            java.util.regex.Pattern.compile("(?i)(קלוריות|calories|kcal|קק\"ל|קק״ל)");

    // How many lines above the ingredients header to keep — the recipe's own title and its
    // "serves 4, 30 minutes" line sit there.
    private static final int LINES_BEFORE = 3;

    // Blog-style pages wrap the recipe in a long story, photo captions, a comments section
    // and links to other recipes (thekitchencoach: about half the text). When the page has
    // an ingredients header followed by a method header, keep only from just above the one
    // to the first tail line after the other. Anything less certain leaves the text whole —
    // too much text costs tokens, too little loses the recipe.
    static String recipeWindow(String text) {
        String[] lines = text.split("\n");
        int insAt = -1;
        for (int i = 0; i < lines.length && insAt == -1; i++) {
            if (INS_HEADERS.contains(headerWord(lines[i]))) insAt = i;
        }
        int ingAt = -1;
        // The ingredients header nearest above the method: foody repeats "מרכיבים" as a count
        // label in its stats box well before the real list.
        for (int i = (insAt == -1 ? lines.length : insAt) - 1; i >= 0 && ingAt == -1; i--) {
            if (ING_HEADERS.contains(headerWord(lines[i]))) ingAt = i;
        }
        if (ingAt == -1) return text;

        int start = Math.max(0, ingAt - LINES_BEFORE);
        int end = lines.length;
        for (int i = Math.max(ingAt, insAt) + 1; i < lines.length; i++) {
            if (lines[i].length() <= 80 && TAIL.matcher(lines[i]).find()) { end = i; break; }
        }

        StringBuilder out = new StringBuilder();
        // Per-serving calories often sit in a stats box above the recipe ("קלוריות" / "457").
        int kept = 0;
        for (int i = 0; i < start && kept < 2; i++) {
            if (lines[i].length() <= 60 && CALORIE_LINE.matcher(lines[i]).find()) {
                out.append(lines[i]);
                if (i + 1 < start && lines[i + 1].length() <= 20) out.append(' ').append(lines[i + 1]);
                out.append('\n');
                kept++;
            }
        }
        for (int i = start; i < end; i++) {
            if (lines[i].length() <= 120 && PHOTO_CREDIT.matcher(lines[i]).find()) continue;
            out.append(lines[i]).append('\n');
        }
        String window = out.toString().trim();
        return window.length() < MIN_CONTENT_CHARS ? text : window;
    }

    // "Ingredients:" / "**אופן ההכנה**" / "• מצרכים" -> the bare word, for header lookup.
    private static String headerWord(String line) {
        if (line.length() > 30) return "";
        return line.replaceAll("[*_#~`•·►▪◦]", " ").replaceAll("[-–—:：]+", " ")
                .replaceAll("\\s+", " ").trim().toLowerCase(Locale.ROOT);
    }

    // *** SSRF validation ***

    // Package-private so UrlFetcherTest can exercise the guard directly — it is the one
    // piece here worth pinning down, and it is unreachable through fetchRecipe without
    // making a network call.
    static void validateUrl(String rawUrl) throws Exception {
        URI uri;
        try {
            uri = new URI(rawUrl.trim());
        } catch (Exception e) {
            throw new Exception("Invalid URL format");
        }

        String scheme = uri.getScheme();
        if (scheme == null || (!scheme.equals("http") && !scheme.equals("https"))) {
            throw new Exception("Only http and https URLs are allowed");
        }

        String host = uri.getHost();
        if (host == null || host.isEmpty()) {
            throw new Exception("Invalid URL: missing host");
        }

        // Resolve the hostname and check EVERY address it answers with. getByName returns
        // only the first, so a host publishing both a public and a private record would be
        // judged on whichever the resolver happened to put first — and the connection could
        // still go to the other one.
        InetAddress[] addresses;
        try {
            addresses = InetAddress.getAllByName(host);
        } catch (Exception e) {
            throw new Exception("Could not resolve host: " + host);
        }
        if (addresses == null || addresses.length == 0) {
            throw new Exception("Could not resolve host: " + host);
        }

        if (anyPrivate(addresses)) {
            throw new Exception("Requests to internal/private addresses are not allowed");
        }
    }

    // True if ANY resolved address is internal. Its own method so a test can hand it a
    // public-then-private list — the exact shape that slipped past the old getByName
    // version, and the one a live DNS lookup can't be relied on to reproduce.
    static boolean anyPrivate(InetAddress[] addresses) {
        for (InetAddress address : addresses) {
            if (isPrivateAddress(address)) return true;
        }
        return false;
    }

    private static boolean isPrivateAddress(InetAddress addr) {
        if (addr.isLoopbackAddress()) return true;     // 127.x.x.x, ::1
        if (addr.isLinkLocalAddress()) return true;    // 169.254.x.x (AWS/GCP metadata), fe80::/10
        if (addr.isSiteLocalAddress()) return true;    // 10.x, 172.16-31.x, 192.168.x (IPv4 only)
        if (addr.isAnyLocalAddress()) return true;     // 0.0.0.0, ::
        if (addr.isMulticastAddress()) return true;

        byte[] raw = addr.getAddress();
        if (raw.length == 4) {
            int b0 = raw[0] & 0xFF, b1 = raw[1] & 0xFF;
            if (b0 == 169 && b1 == 254) return true;   // belt-and-suspenders: GCP/AWS metadata
        } else if (raw.length == 16) {
            int b0 = raw[0] & 0xFF;
            if ((b0 & 0xFE) == 0xFC) return true;      // fc00::/7 IPv6 unique-local (isSiteLocalAddress misses this)
        }
        return false;
    }
}

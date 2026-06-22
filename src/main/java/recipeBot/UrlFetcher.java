package recipeBot;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.net.InetAddress;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;

public class UrlFetcher {

    private static final int MAX_REDIRECTS = 3;

    // A complete recipe parsed straight from the page's JSON-LD when present;
    // otherwise the page text for the Gemini fallback. Exactly one is the way forward.
    private static String userAgent() {
        return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    }

    // Fetch a URL and return a recipe: parsed directly from JSON-LD if the page
    // exposes a complete one, otherwise extracted from the page text by Gemini.
    // JSON-LD-first is a speed/cost win on well-structured sites — it is NOT a
    // security control (a hostile page just omits JSON-LD to force the fallback).
    public static Recipe fetchRecipe(String rawUrl, GeminiHandler gemini) throws Exception {
        org.jsoup.nodes.Document doc = fetchDocument(rawUrl);

        Recipe fromLd = parseJsonLd(doc);
        if (fromLd != null) return fromLd;

        String text = pageText(doc);
        if (text.isEmpty()) return null;
        return gemini.extractRecipeFromText(text);
    }

    private static org.jsoup.nodes.Document fetchDocument(String rawUrl) throws Exception {
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
                    .header("Accept-Language", "en-US,en;q=0.9")
                    .referrer("https://www.google.com")
                    .followRedirects(false)
                    .ignoreHttpErrors(true)
                    .timeout(5000)
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
        return res.parse();
    }

    private static String pageText(org.jsoup.nodes.Document doc) {
        // Prefer JSON-LD blob — Gemini parses it more reliably than raw page text
        for (org.jsoup.nodes.Element script : doc.select("script[type=application/ld+json]")) {
            String json = script.html().trim();
            if (json.contains("\"Recipe\"")) {
                return "JSON-LD structured recipe data:\n" + json;
            }
        }
        String text = doc.text();
        return text.length() > 20000 ? text.substring(0, 20000) : text;
    }

    // *** JSON-LD parsing ***

    private static Recipe parseJsonLd(org.jsoup.nodes.Document doc) {
        for (org.jsoup.nodes.Element script : doc.select("script[type=application/ld+json]")) {
            JsonElement root;
            try {
                root = JsonParser.parseString(script.html());
            } catch (Exception e) {
                continue; // malformed block — try the next one
            }
            JsonObject node = findRecipe(root);
            if (node == null) continue;
            Recipe r = toRecipe(node);
            if (isComplete(r)) return r;
        }
        return null;
    }

    // Recipe nodes hide inside arrays and @graph wrappers — recurse to find one
    private static JsonObject findRecipe(JsonElement el) {
        if (el == null) return null;
        if (el.isJsonArray()) {
            for (JsonElement e : el.getAsJsonArray()) {
                JsonObject r = findRecipe(e);
                if (r != null) return r;
            }
            return null;
        }
        if (!el.isJsonObject()) return null;
        JsonObject o = el.getAsJsonObject();
        if (hasType(o, "Recipe")) return o;
        if (o.has("@graph")) return findRecipe(o.get("@graph"));
        return null;
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
        String[] instr = instructionList(o.get("recipeInstructions")).toArray(new String[0]);
        return new Recipe(str(o, "name"), firstString(o.get("recipeCategory")), str(o, "description"), ing, instr);
    }

    // Complete enough to skip Gemini? Real recipes have a name, several
    // ingredients, and at least one step. Too few ingredients (e.g. mako lists
    // only the pan in recipeIngredient) means the structured data is partial —
    // fall back to the LLM rather than save a broken recipe.
    private static boolean isComplete(Recipe r) {
        return r.getName() != null && !r.getName().isEmpty()
                && r.getIngredients() != null && r.getIngredients().length >= 2
                && r.getInstructions() != null && r.getInstructions().length >= 1;
    }

    private static String str(JsonObject o, String key) {
        JsonElement e = o.get(key);
        return (e != null && e.isJsonPrimitive()) ? e.getAsString().trim() : null;
    }

    private static String firstString(JsonElement e) {
        if (e == null) return null;
        if (e.isJsonPrimitive()) return e.getAsString().trim();
        if (e.isJsonArray() && e.getAsJsonArray().size() > 0) {
            JsonElement f = e.getAsJsonArray().get(0);
            if (f.isJsonPrimitive()) return f.getAsString().trim();
        }
        return null;
    }

    private static List<String> stringList(JsonElement e) {
        List<String> out = new ArrayList<>();
        if (e == null) return out;
        if (e.isJsonArray()) {
            for (JsonElement x : e.getAsJsonArray()) {
                if (x.isJsonPrimitive()) {
                    String s = x.getAsString().trim();
                    if (!s.isEmpty()) out.add(s);
                }
            }
        } else if (e.isJsonPrimitive()) {
            String s = e.getAsString().trim();
            if (!s.isEmpty()) out.add(s);
        }
        return out;
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
            String s = x.getAsString().trim();
            if (!s.isEmpty()) out.add(s);
            return;
        }
        if (!x.isJsonObject()) return;
        JsonObject o = x.getAsJsonObject();
        if (o.has("itemListElement")) { // HowToSection
            JsonElement items = o.get("itemListElement");
            if (items != null && items.isJsonArray()) {
                for (JsonElement it : items.getAsJsonArray()) collectInstruction(it, out);
            }
            return;
        }
        String text = str(o, "text");
        if (text == null) text = str(o, "name");
        if (text != null && !text.isEmpty()) out.add(text);
    }

    // *** SSRF validation ***

    private static void validateUrl(String rawUrl) throws Exception {
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

        // Resolve hostname and check the actual IP
        InetAddress address;
        try {
            address = InetAddress.getByName(host);
        } catch (Exception e) {
            throw new Exception("Could not resolve host: " + host);
        }

        if (isPrivateAddress(address)) {
            throw new Exception("Requests to internal/private addresses are not allowed");
        }
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

    // Self-check: run `java recipeBot.UrlFetcher` after building. No network — just the JSON-LD parser.
    public static void main(String[] args) {
        String html = "<html><head><script type=\"application/ld+json\">"
                + "{\"@context\":\"https://schema.org\",\"@graph\":[{\"@type\":\"BreadcrumbList\"},"
                + "{\"@type\":[\"Recipe\",\"NewsArticle\"],\"name\":\"Test Cake\",\"recipeIngredient\":[\"1 cup flour\",\"2 eggs\"],"
                + "\"recipeInstructions\":[{\"@type\":\"HowToStep\",\"text\":\"Mix.\"},{\"@type\":\"HowToStep\",\"text\":\"Bake.\"}]}]}"
                + "</script></head><body></body></html>";
        Recipe r = parseJsonLd(org.jsoup.Jsoup.parse(html));
        assert r != null : "should parse Recipe out of @graph";
        assert "Test Cake".equals(r.getName());
        assert r.getIngredients().length == 2;
        assert r.getInstructions().length == 2 && "Bake.".equals(r.getInstructions()[1]);

        // Partial structured data (one ingredient) must NOT be accepted — forces fallback.
        String partial = "<html><head><script type=\"application/ld+json\">"
                + "{\"@type\":\"Recipe\",\"name\":\"Pan only\",\"recipeIngredient\":[\"28cm pan\"],"
                + "\"recipeInstructions\":[\"do stuff\"]}</script></head></html>";
        assert parseJsonLd(org.jsoup.Jsoup.parse(partial)) == null : "partial recipe should fall back";

        System.out.println("UrlFetcher self-check passed (run with -ea).");
    }
}

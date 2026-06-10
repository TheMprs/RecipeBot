package recipeBot;

import java.net.InetAddress;
import java.net.URI;

public class UrlFetcher {

    private static final int MAX_REDIRECTS = 3;

    public static String fetch(String rawUrl) throws Exception {
        // Follow redirects manually so every hop goes through validateUrl —
        // jsoup's built-in redirect handling would only validate the first URL
        String url = rawUrl.trim();
        org.jsoup.Connection.Response res;
        int hops = 0;
        while (true) {
            validateUrl(url);
            res = org.jsoup.Jsoup.connect(url)
                    .userAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
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

        org.jsoup.nodes.Document doc = res.parse();

        // Prefer JSON-LD structured data — most recipe sites embed it and it's clean
        for (org.jsoup.nodes.Element script : doc.select("script[type=application/ld+json]")) {
            String json = script.html().trim();
            if (json.contains("\"Recipe\"")) {
                return "JSON-LD structured recipe data:\n" + json;
            }
        }

        // Fall back to page text, capped to avoid token limits
        String text = doc.text();
        return text.length() > 20000 ? text.substring(0, 20000) : text;
    }

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
        if (addr.isLoopbackAddress()) return true;     // 127.x.x.x
        if (addr.isLinkLocalAddress()) return true;    // 169.254.x.x (AWS/GCP metadata)
        if (addr.isSiteLocalAddress()) return true;    // 10.x.x.x, 172.16-31.x.x, 192.168.x.x
        if (addr.isAnyLocalAddress()) return true;     // 0.0.0.0
        if (addr.isMulticastAddress()) return true;

        // Extra: block GCP metadata IP explicitly
        byte[] raw = addr.getAddress();
        if (raw.length == 4) {
            int b0 = raw[0] & 0xFF;
            int b1 = raw[1] & 0xFF;
            // 169.254.x.x — belt-and-suspenders since isLinkLocalAddress covers this
            if (b0 == 169 && b1 == 254) return true;
        }

        return false;
    }
}

package recipeBot;

import java.net.InetAddress;
import java.net.URI;

public class UrlFetcher {

    public static String fetch(String rawUrl) throws Exception {
        validateUrl(rawUrl);

        return org.jsoup.Jsoup.connect(rawUrl)
                .userAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                .referrer("http://www.google.com")
                .header("Accept-Language", "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7")
                .followRedirects(false)
                .timeout(10000)
                .get()
                .text();
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

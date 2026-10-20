package recipeBot;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

// The SSRF guard on URL import. Every case here uses a literal IP or a name the OS
// resolves from its own hosts file, so the suite stays offline and deterministic —
// no test should depend on a DNS server answering.
class UrlFetcherTest {

    private static boolean rejects(String url) {
        try {
            UrlFetcher.validateUrl(url);
            return false;
        } catch (Exception e) {
            return true;
        }
    }

    private static void allows(String url) {
        try {
            UrlFetcher.validateUrl(url);
        } catch (Exception e) {
            fail("should have been allowed: " + url + " (" + e.getMessage() + ")");
        }
    }

    @Test
    void rejects_loopback_and_link_local_and_private_ranges() {
        assertTrue(rejects("http://127.0.0.1/"), "IPv4 loopback");
        assertTrue(rejects("http://localhost/"), "loopback by name");
        assertTrue(rejects("http://[::1]/"), "IPv6 loopback");
        assertTrue(rejects("http://169.254.169.254/latest/meta-data/"), "cloud metadata");
        assertTrue(rejects("http://10.0.0.5/"), "private class A");
        assertTrue(rejects("http://192.168.1.1/"), "private class C");
        assertTrue(rejects("http://172.16.4.4/"), "private class B");
        assertTrue(rejects("http://0.0.0.0/"), "any-local");
        assertTrue(rejects("http://[fc00::1]/"), "IPv6 unique-local");
    }

    @Test
    void rejects_non_http_schemes_and_malformed_input() {
        assertTrue(rejects("file:///etc/passwd"), "file scheme");
        assertTrue(rejects("ftp://example.com/x"), "ftp scheme");
        assertTrue(rejects("gopher://example.com/x"), "gopher scheme");
        assertTrue(rejects("not a url"), "unparseable");
        assertTrue(rejects("http:///nohost"), "missing host");
    }

    @Test
    void allows_ordinary_public_addresses() {
        allows("http://8.8.8.8/");
        allows("https://1.1.1.1/recipe");
    }

    // The reason getAllByName replaced getByName: a name resolving to several addresses
    // must be judged on all of them, not on whichever the resolver returned first.
    //
    // The first case below is the regression itself — public address first, private
    // second. The old code read only element 0, called it public, and connected anyway.
    // Testing this through a hostname would need a DNS record we control, so the check
    // is handed the address list directly.
    @Test
    void a_private_address_anywhere_in_the_list_is_caught() throws Exception {
        java.net.InetAddress pub = java.net.InetAddress.getByName("8.8.8.8");
        java.net.InetAddress loopback = java.net.InetAddress.getByName("127.0.0.1");
        java.net.InetAddress metadata = java.net.InetAddress.getByName("169.254.169.254");

        assertTrue(UrlFetcher.anyPrivate(new java.net.InetAddress[]{ pub, loopback }),
                "public first, private second — the case the old getByName version missed");
        assertTrue(UrlFetcher.anyPrivate(new java.net.InetAddress[]{ pub, pub, metadata }),
                "private last in a longer list");
        assertTrue(UrlFetcher.anyPrivate(new java.net.InetAddress[]{ loopback, pub }),
                "private first still caught");
        assertFalse(UrlFetcher.anyPrivate(new java.net.InetAddress[]{ pub }),
                "an all-public list must still be allowed");
    }
}

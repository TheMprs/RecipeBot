package recipeBot;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public class LinkTokenStore {
    private static final long TTL_MS = 5 * 60 * 1000; // 5 minutes

    private record Entry(long chatId, long expiresAt) {}

    private final Map<String, Entry> tokens = new ConcurrentHashMap<>();

    public String generate(long chatId) {
        String token = UUID.randomUUID().toString();
        tokens.put(token, new Entry(chatId, System.currentTimeMillis() + TTL_MS));
        return token;
    }

    // Returns chatId if valid, null if expired or not found. One-time use.
    public Long consume(String token) {
        Entry entry = tokens.remove(token);
        if (entry == null) return null;
        if (System.currentTimeMillis() > entry.expiresAt()) return null;
        return entry.chatId();
    }
}

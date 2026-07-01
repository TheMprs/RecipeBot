package recipeBot;
import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

public class GeminiHandler {
    private final String apiKey;
    private final HttpClient client;
    private final Gson gson;

    public GeminiHandler(String apiKey) {
        this.apiKey = apiKey;
        this.client = HttpClient.newBuilder()
                .connectTimeout(java.time.Duration.ofSeconds(10))
                .build();
        this.gson = new Gson(); // create a Gson instance for JSON parsing and generation
    }

    public Recipe extractRecipeFromText(String rawText) {
        // Key goes in the x-goog-api-key header, not the query string — a ?key= URL
        // leaks the secret into server/proxy/access logs.
        String url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent";
        String prompt = "Extract the recipe from the provided text. " +
            "CRITICAL: All values (name, description, ingredients, instructions) MUST be in the same language as the source text (e.g., if the source is Hebrew, output Hebrew). " +
            "Return ONLY a valid JSON object without markdown formatting. " +
            "The 'name' and 'description' should be short and concise. " +
            "Ensure no details are missed in the instructions. " +
            "Use this exact JSON structure with English keys: " +
            "{\"name\": \"...\", \"description\": \"...\", \"ingredients\": [], \"instructions\": []}. " +
            "Text to parse: " + rawText;
        
        // Safely build the JSON request body
        JsonObject textPart = new JsonObject();
        textPart.addProperty("text", prompt);
        JsonArray partsArray = new JsonArray();
        partsArray.add(textPart);
        JsonObject contentObj = new JsonObject();
        contentObj.add("parts", partsArray);
        JsonArray contentsArray = new JsonArray();
        contentsArray.add(contentObj);

        // Force Gemini to output pure JSON
        JsonObject generationConfig = new JsonObject();
        generationConfig.addProperty("response_mime_type", "application/json");

        // Plain extraction needs no reasoning — disabling thinking saves
        // ~1000 tokens of latency per call
        JsonObject thinkingConfig = new JsonObject();
        thinkingConfig.addProperty("thinkingBudget", 0);
        generationConfig.add("thinkingConfig", thinkingConfig);

        JsonObject requestBody = new JsonObject();
        requestBody.add("contents", contentsArray);
        requestBody.add("generationConfig", generationConfig);

        // Make the HTTP POST Request
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(java.time.Duration.ofSeconds(20))
                .header("Content-Type", "application/json")
                .header("x-goog-api-key", apiKey)
                .POST(HttpRequest.BodyPublishers.ofString(gson.toJson(requestBody)))
                .build();

        // Gemini intermittently returns 503 UNAVAILABLE (model overloaded) —
        // retry transient failures before giving up
        for (int attempt = 1; attempt <= 3; attempt++) {
            try {
                HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

                if (response.statusCode() >= 500 || response.statusCode() == 429) {
                    System.err.println("[Gemini] attempt " + attempt + " failed: HTTP "
                            + response.statusCode() + " " + response.body());
                    Thread.sleep(1500L * attempt);
                    continue;
                }

                JsonObject jsonResponse = gson.fromJson(response.body(), JsonObject.class);
                if (!jsonResponse.has("candidates")) {
                    // Non-retryable API error (bad key, blocked content, etc.)
                    System.err.println("[Gemini] no candidates in response: " + response.body());
                    return null;
                }

                // Extract the generated JSON string from Gemini's response wrapper
                String recipeJsonString = jsonResponse.getAsJsonArray("candidates")
                        .get(0).getAsJsonObject()
                        .getAsJsonObject("content")
                        .getAsJsonArray("parts")
                        .get(0).getAsJsonObject()
                        .get("text").getAsString();

                return gson.fromJson(recipeJsonString, Recipe.class);

            } catch (java.net.http.HttpTimeoutException e) {
                // a 20s stall won't recover on retry — fail fast instead of stacking timeouts
                System.err.println("[Gemini] timed out after 20s");
                return null;
            } catch (Exception e) {
                e.printStackTrace();
                return null;
            }
        }
        System.err.println("[Gemini] giving up after 3 attempts");
        return null;
    }
}
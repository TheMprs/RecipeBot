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
        this.client = HttpClient.newHttpClient(); // create a client instance for making HTTP requests
        this.gson = new Gson(); // create a Gson instance for JSON parsing and generation
    }

    public Recipe extractRecipeFromText(String rawText) {
        String url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + apiKey;

        String allowedCategories = java.util.Arrays.toString(Category.values());

        // The prompt forcing the AI to return exactly what your Recipe object expects
        String prompt = "Extract the recipe from this text. " + 
                "Return ONLY a valid JSON object. Do not include markdown formatting: " +
                "the category must be one of: " + allowedCategories + ", " +
                "the recipe must match this exact structure" +
                "{\"name\": \"Recipe Name\", \"category\": \"MAIN\", \"description\": \"Short description\", \"ingredients\": [\"item 1\", \"item 2\"], \"instructions\": [\"step 1\", \"step 2\"]}. " +
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

        JsonObject requestBody = new JsonObject();
        requestBody.add("contents", contentsArray);
        requestBody.add("generationConfig", generationConfig);

        // Make the HTTP POST Request
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(gson.toJson(requestBody)))
                .build();

        try {
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            
            // Extract the generated JSON string from Gemini's response wrapper
            JsonObject jsonResponse = gson.fromJson(response.body(), JsonObject.class);
            String recipeJsonString = jsonResponse.getAsJsonArray("candidates")
                    .get(0).getAsJsonObject()
                    .getAsJsonObject("content")
                    .getAsJsonArray("parts")
                    .get(0).getAsJsonObject()
                    .get("text").getAsString();

            // Magically convert the JSON string straight into your Recipe Java object
            return gson.fromJson(recipeJsonString, Recipe.class);

        } catch (Exception e) {
            e.printStackTrace();
            return null;
        }
    }
}
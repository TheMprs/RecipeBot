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
        String url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + apiKey;
        String allowedCategories = java.util.Arrays.toString(Category.values());
        String prompt = "Extract the recipe from the provided text. " + 
            "CRITICAL: All values (name, description, ingredients, instructions) MUST be in the same language as the source text (e.g., if the source is Hebrew, the output values must be Hebrew). " +
            "Return ONLY a valid JSON object without markdown formatting. " +
            "The 'name' and 'description' should be short and concise. " +
            "The 'category' MUST be exactly one of: " + allowedCategories + ". " +
            "CRITICAL: Set 'direction' to 'rtl' or 'ltr' according to the recipe's language.\"" +
            "Ensure no details are missed in the instructions. " +
            "Use this exact JSON structure with English keys: " +
            "{\"name\": \"...\", \"category\": \"...\", \"description\": \"...\", \"ingredients\": [], \"instructions\": [], \"direction\": \"...\"}. " +
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
            
            System.out.println("Gemini Response: " + response.body());

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
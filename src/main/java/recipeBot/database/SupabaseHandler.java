package recipeBot.database;

import com.google.gson.*;
import recipeBot.*;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class SupabaseHandler {
    private final String supabaseUrl;
    private final String baseUrl;
    private final String serviceKey;
    private String defaultUserId;
    private final HttpClient client;
    private final Gson gson;

    public SupabaseHandler(String supabaseUrl, String serviceKey) {
        this.supabaseUrl = supabaseUrl;
        this.baseUrl = supabaseUrl + "/rest/v1";
        this.serviceKey = serviceKey;
        this.client = HttpClient.newHttpClient();
        this.gson = new Gson();
    }

    public void setDefaultUserId(String userId) {
        this.defaultUserId = userId;
    }

    // *** PUBLIC METHODS ***

    public void addRecipe(Recipe recipe) {
        JsonObject body = buildBody(recipe);

        HttpRequest req = base("/recipes")
                .header("Prefer", "return=representation")
                .POST(HttpRequest.BodyPublishers.ofString(gson.toJson(body)))
                .build();

        try {
            HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() == 201) {
                JsonArray arr = gson.fromJson(res.body(), JsonArray.class);
                if (arr.size() > 0) {
                    recipe.setId(arr.get(0).getAsJsonObject().get("id").getAsString());
                }
            } else {
                System.err.println("[Supabase] addRecipe failed: " + res.statusCode() + " " + res.body());
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public Recipe getRecipeByName(String name) {
        HttpRequest req = base("/recipes?name=eq." + encode(name) + "&select=*").GET().build();
        return fetchSingle(req);
    }

    public Recipe getRecipeById(String id) {
        HttpRequest req = base("/recipes?id=eq." + encode(id) + "&select=*").GET().build();
        return fetchSingle(req);
    }

    public String getIdOf(String name) {
        Recipe recipe = getRecipeByName(name);
        return recipe != null ? recipe.getId() : null;
    }


    public List<Recipe> getAllRecipes() {
        HttpRequest req = base("/recipes?select=*").GET().build();
        return fetchList(req);
    }

    public List<Recipe> getRecipesByCategory(Category category) {
        HttpRequest req = base("/recipes?category=eq." + encode(category.name()) + "&select=*").GET().build();
        return fetchList(req);
    }

    public boolean deleteRecipe(String name) {
        HttpRequest req = base("/recipes?name=eq." + encode(name))
                .DELETE()
                .build();
        try {
            HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
            return res.statusCode() == 204 || res.statusCode() == 200;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    public void updateRecipe(String recipeId, String entry, String newValue) {
        Set<String> allowed = Set.of("name", "category", "description", "ingredients", "instructions");
        if (!allowed.contains(entry)) throw new IllegalArgumentException("Invalid field: " + entry);

        JsonObject body = new JsonObject();
        if (entry.equals("ingredients") || entry.equals("instructions")) {
            JsonArray arr = new JsonArray();
            for (String part : newValue.split(";")) arr.add(part.trim());
            body.add(entry, arr);
        } else {
            body.addProperty(entry, newValue);
        }

        HttpRequest req = base("/recipes?id=eq." + encode(recipeId))
                .method("PATCH", HttpRequest.BodyPublishers.ofString(gson.toJson(body)))
                .build();
        try {
            HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() >= 400) {
                System.err.println("[Supabase] updateRecipe failed: " + res.statusCode() + " " + res.body());
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    // *** TELEGRAM AUTH ***

    public void linkTelegramUser(long chatId, String userId) {
        JsonObject body = new JsonObject();
        body.addProperty("telegram_chat_id", chatId);
        body.addProperty("user_id", userId);

        HttpRequest req = base("/telegram_auth")
                .header("Prefer", "resolution=merge-duplicates")
                .POST(HttpRequest.BodyPublishers.ofString(gson.toJson(body)))
                .build();
        try {
            HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() >= 400) {
                System.err.println("[Supabase] linkTelegramUser failed: " + res.statusCode() + " " + res.body());
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public String getLinkedUserId(long chatId) {
        HttpRequest req = base("/telegram_auth?telegram_chat_id=eq." + chatId + "&select=user_id")
                .GET().build();
        try {
            HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
            JsonArray arr = gson.fromJson(res.body(), JsonArray.class);
            if (arr.size() > 0) return arr.get(0).getAsJsonObject().get("user_id").getAsString();
        } catch (Exception e) {
            e.printStackTrace();
        }
        return null;
    }

    // Validates a Supabase JWT and returns the user's UUID, or null if invalid.
    public String getUserIdFromJwt(String jwt) {
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(supabaseUrl + "/auth/v1/user"))
                .header("apikey", serviceKey)
                .header("Authorization", "Bearer " + jwt)
                .GET()
                .build();
        try {
            HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() == 200) {
                return gson.fromJson(res.body(), JsonObject.class).get("id").getAsString();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        return null;
    }

    // addRecipe overload that attributes the recipe to a specific user
    public void addRecipe(Recipe recipe, String userId) {
        String previous = defaultUserId;
        defaultUserId = userId;
        addRecipe(recipe);
        defaultUserId = previous;
    }

    // *** PRIVATE HELPERS ***

    private HttpRequest.Builder base(String path) {
        return HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + path))
                .header("apikey", serviceKey)
                .header("Authorization", "Bearer " + serviceKey)
                .header("Content-Type", "application/json");
    }

    private String encode(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private JsonObject buildBody(Recipe recipe) {
        JsonObject body = new JsonObject();
        body.addProperty("name", recipe.getName());
        body.addProperty("category", recipe.getCategory().name());
        body.addProperty("description", recipe.getDescription() != null ? recipe.getDescription() : "");
        body.add("ingredients", toJsonArray(recipe.getIngredients()));
        body.add("instructions", toJsonArray(recipe.getInstructions()));
        body.addProperty("visibility", "public");
        if (defaultUserId != null) {
            body.addProperty("user_id", defaultUserId);
        }
        return body;
    }

    private JsonArray toJsonArray(String[] arr) {
        JsonArray ja = new JsonArray();
        if (arr != null) for (String s : arr) ja.add(s);
        return ja;
    }

    private Recipe parseRecipe(JsonObject obj) {
        String id = obj.get("id").getAsString();
        String name = obj.get("name").getAsString();
        String cat = obj.get("category").getAsString();
        String desc = obj.has("description") && !obj.get("description").isJsonNull()
                ? obj.get("description").getAsString() : "";
        String[] ingredients = parseArray(obj.get("ingredients"));
        String[] instructions = parseArray(obj.get("instructions"));

        Recipe recipe = new Recipe(name, Category.parse(cat), desc, ingredients, instructions);
        recipe.setId(id);
        return recipe;
    }

    private String[] parseArray(JsonElement el) {
        if (el == null || el.isJsonNull()) return new String[0];
        if (el.isJsonArray()) {
            JsonArray arr = el.getAsJsonArray();
            String[] result = new String[arr.size()];
            for (int i = 0; i < arr.size(); i++) result[i] = arr.get(i).getAsString();
            return result;
        }
        return el.getAsString().split(";");
    }

    private Recipe fetchSingle(HttpRequest req) {
        try {
            HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
            JsonArray arr = gson.fromJson(res.body(), JsonArray.class);
            if (arr.size() > 0) return parseRecipe(arr.get(0).getAsJsonObject());
        } catch (Exception e) {
            e.printStackTrace();
        }
        return null;
    }

    private List<Recipe> fetchList(HttpRequest req) {
        List<Recipe> recipes = new ArrayList<>();
        try {
            HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
            JsonArray arr = gson.fromJson(res.body(), JsonArray.class);
            for (JsonElement el : arr) recipes.add(parseRecipe(el.getAsJsonObject()));
        } catch (Exception e) {
            e.printStackTrace();
        }
        return recipes;
    }
}

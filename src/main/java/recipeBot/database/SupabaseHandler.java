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
    private final HttpClient client;
    private final Gson gson;

    public SupabaseHandler(String supabaseUrl, String serviceKey) {
        this.supabaseUrl = supabaseUrl;
        this.baseUrl = supabaseUrl + "/rest/v1";
        this.serviceKey = serviceKey;
        this.client = HttpClient.newHttpClient();
        this.gson = new Gson();
    }

    // *** PUBLIC METHODS ***

    // Inserts the recipe attributed to the given user; sets the recipe's id on success
    public void addRecipe(Recipe recipe, String userId) {
        JsonObject body = buildBody(recipe, userId);

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

    public Recipe getRecipeById(String id) {
        HttpRequest req = base("/recipes?id=eq." + encode(id) + "&select=*").GET().build();
        return fetchSingle(req);
    }

    public List<Recipe> getAllRecipes(String userId) {
        HttpRequest req = base("/recipes?user_id=eq." + encode(userId) + "&select=*").GET().build();
        return fetchList(req);
    }

    // *** CATEGORIES (user-defined, recipe_categories junction) ***

    // Returns the user's categories as id -> name, in creation order
    public Map<String, String> getUserCategories(String userId) {
        Map<String, String> categories = new LinkedHashMap<>();
        HttpRequest req = base("/categories?user_id=eq." + encode(userId) + "&select=id,name&order=created_at").GET().build();
        try {
            HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
            JsonArray arr = gson.fromJson(res.body(), JsonArray.class);
            for (JsonElement el : arr) {
                JsonObject obj = el.getAsJsonObject();
                categories.put(obj.get("id").getAsString(), obj.get("name").getAsString());
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        return categories;
    }

    public String getCategoryName(String categoryId) {
        HttpRequest req = base("/categories?id=eq." + encode(categoryId) + "&select=name").GET().build();
        try {
            HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
            JsonArray arr = gson.fromJson(res.body(), JsonArray.class);
            if (arr.size() > 0) return arr.get(0).getAsJsonObject().get("name").getAsString();
        } catch (Exception e) {
            e.printStackTrace();
        }
        return null;
    }

    public List<Recipe> getRecipesByCategoryId(String categoryId) {
        List<String> recipeIds = new ArrayList<>();
        HttpRequest req = base("/recipe_categories?category_id=eq." + encode(categoryId) + "&select=recipe_id").GET().build();
        try {
            HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
            JsonArray arr = gson.fromJson(res.body(), JsonArray.class);
            for (JsonElement el : arr) recipeIds.add(el.getAsJsonObject().get("recipe_id").getAsString());
        } catch (Exception e) {
            e.printStackTrace();
        }
        if (recipeIds.isEmpty()) return new ArrayList<>();
        return fetchList(base("/recipes?id=in.(" + String.join(",", recipeIds) + ")&select=*").GET().build());
    }

    public void linkRecipeCategory(String recipeId, String categoryId) {
        JsonObject body = new JsonObject();
        body.addProperty("recipe_id", recipeId);
        body.addProperty("category_id", categoryId);
        HttpRequest req = base("/recipe_categories")
                .header("Prefer", "resolution=merge-duplicates")
                .POST(HttpRequest.BodyPublishers.ofString(gson.toJson(body)))
                .build();
        try {
            HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() >= 400) {
                System.err.println("[Supabase] linkRecipeCategory failed: " + res.statusCode() + " " + res.body());
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    // Replaces a recipe's category links; null categoryId clears them
    public void setRecipeCategory(String recipeId, String categoryId) {
        HttpRequest req = base("/recipe_categories?recipe_id=eq." + encode(recipeId)).DELETE().build();
        try {
            client.send(req, HttpResponse.BodyHandlers.ofString());
        } catch (Exception e) {
            e.printStackTrace();
        }
        if (categoryId != null) linkRecipeCategory(recipeId, categoryId);
    }

    public boolean deleteRecipeById(String id) {
        HttpRequest req = base("/recipes?id=eq." + encode(id))
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

    // True only if the user's can_scrape flag is set. Fails closed on any error.
    public boolean canScrape(String userId) {
        HttpRequest req = base("/users?id=eq." + encode(userId) + "&select=can_scrape").GET().build();
        try {
            HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
            JsonArray arr = gson.fromJson(res.body(), JsonArray.class);
            return arr.size() > 0 && arr.get(0).getAsJsonObject().get("can_scrape").getAsBoolean();
        } catch (Exception e) {
            e.printStackTrace();
        }
        return false;
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

    // Deletes all user data and the auth account. Returns true on success.
    public boolean deleteAccount(String userId) {
        try {
            // Delete all user data first
            for (String path : new String[]{
                "/recipes?user_id=eq." + encode(userId),
                "/cook_logs?user_id=eq." + encode(userId),
                "/telegram_auth?user_id=eq." + encode(userId),
                "/users?id=eq." + encode(userId)
            }) {
                HttpResponse<String> res = client.send(
                    base(path).DELETE().build(),
                    HttpResponse.BodyHandlers.ofString()
                );
                if (res.statusCode() >= 400) {
                    System.err.println("[Supabase] deleteAccount data cleanup failed on " + path + ": " + res.statusCode() + " " + res.body());
                }
            }

            // Delete the auth user via admin API
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(supabaseUrl + "/auth/v1/admin/users/" + userId))
                    .header("apikey", serviceKey)
                    .header("Authorization", "Bearer " + serviceKey)
                    .DELETE()
                    .build();
            HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
            return res.statusCode() == 200 || res.statusCode() == 204;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
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

    private JsonObject buildBody(Recipe recipe, String userId) {
        JsonObject body = new JsonObject();
        body.addProperty("name", recipe.getName());
        body.addProperty("category", recipe.getCategory());
        body.addProperty("description", recipe.getDescription() != null ? recipe.getDescription() : "");
        body.add("ingredients", toJsonArray(recipe.getIngredients()));
        body.add("instructions", toJsonArray(recipe.getInstructions()));
        body.addProperty("visibility", "public");
        body.addProperty("user_id", userId);
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
        String cat = obj.has("category") && !obj.get("category").isJsonNull()
                ? obj.get("category").getAsString() : null;
        String desc = obj.has("description") && !obj.get("description").isJsonNull()
                ? obj.get("description").getAsString() : "";
        String[] ingredients = parseArray(obj.get("ingredients"));
        String[] instructions = parseArray(obj.get("instructions"));

        Recipe recipe = new Recipe(name, cat, desc, ingredients, instructions);
        recipe.setId(id);
        if (obj.has("user_id") && !obj.get("user_id").isJsonNull()) {
            recipe.setUserId(obj.get("user_id").getAsString());
        }
        if (obj.has("visibility") && !obj.get("visibility").isJsonNull()) {
            recipe.setVisibility(obj.get("visibility").getAsString());
        }
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

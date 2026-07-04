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
        this.client = HttpClient.newBuilder()
                .connectTimeout(java.time.Duration.ofSeconds(10))
                .build();
        this.gson = new Gson();
    }

    // *** PUBLIC METHODS ***

    // Inserts the recipe attributed to the given user; sets the recipe's id on success.
    // Returns false if the DB rejected it (length CHECKs, per-user row-limit trigger, etc.)
    // so callers don't claim success on a silent failure.
    public boolean addRecipe(Recipe recipe, String userId) {
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
                return true;
            }
            System.err.println("[Supabase] addRecipe failed: " + res.statusCode() + " " + res.body());
        } catch (Exception e) {
            e.printStackTrace();
        }
        return false;
    }

    // recipe_id -> row count, for a table with a recipe_id column (cook_logs / recipe_likes).
    // One query for the whole list; grouped client-side. Empty ids -> empty map.
    public Map<String, Integer> countByRecipe(String table, List<String> recipeIds) {
        Map<String, Integer> counts = new HashMap<>();
        if (recipeIds == null || recipeIds.isEmpty()) return counts;
        List<String> enc = new ArrayList<>();
        for (String r : recipeIds) enc.add(encode(r));
        HttpRequest req = base("/" + table + "?recipe_id=in.(" + String.join(",", enc) + ")&select=recipe_id").GET().build();
        try {
            HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
            JsonArray arr = gson.fromJson(res.body(), JsonArray.class);
            for (JsonElement el : arr) {
                counts.merge(el.getAsJsonObject().get("recipe_id").getAsString(), 1, Integer::sum);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        return counts;
    }

    // Exact row count for a user on a table with a user_id column (recipes/categories).
    // Used for friendly "limit reached" messages; -1 on error so callers fail open
    // (the DB row-limit trigger is the real enforcement).
    public int countByUser(String table, String userId) {
        HttpRequest req = base("/" + table + "?user_id=eq." + encode(userId) + "&select=id")
                .header("Prefer", "count=exact")
                .method("HEAD", HttpRequest.BodyPublishers.noBody())
                .build();
        try {
            HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
            String cr = res.headers().firstValue("content-range").orElse("");
            int slash = cr.indexOf('/');
            if (slash >= 0) return Integer.parseInt(cr.substring(slash + 1).trim());
        } catch (Exception e) {
            e.printStackTrace();
        }
        return -1;
    }

    public Recipe getRecipeById(String id) {
        HttpRequest req = base("/recipes?id=eq." + encode(id)
                + "&select=*,recipe_categories(categories(name))").GET().build();
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

    // Creates a user-defined category. Returns true on success.
    public boolean createCategory(String userId, String name) {
        JsonObject body = new JsonObject();
        body.addProperty("user_id", userId);
        body.addProperty("name", name);
        HttpRequest req = base("/categories")
                .POST(HttpRequest.BodyPublishers.ofString(gson.toJson(body)))
                .build();
        try {
            HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() == 201) return true;
            System.err.println("[Supabase] createCategory failed: " + res.statusCode() + " " + res.body());
        } catch (Exception e) {
            e.printStackTrace();
        }
        return false;
    }

    // id -> color hex (or null) for the user's categories; drives the emoji swatch.
    public Map<String, String> getUserCategoryColors(String userId) {
        Map<String, String> colors = new LinkedHashMap<>();
        HttpRequest req = base("/categories?user_id=eq." + encode(userId) + "&select=id,color&order=created_at").GET().build();
        try {
            HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
            JsonArray arr = gson.fromJson(res.body(), JsonArray.class);
            for (JsonElement el : arr) {
                JsonObject o = el.getAsJsonObject();
                colors.put(o.get("id").getAsString(),
                        o.has("color") && !o.get("color").isJsonNull() ? o.get("color").getAsString() : null);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        return colors;
    }

    public boolean renameCategory(String categoryId, String userId, String newName) {
        JsonObject body = new JsonObject();
        body.addProperty("name", newName);
        return patchCategory(categoryId, userId, body);
    }

    // color == null clears it (falls back to the name-hash palette on the web).
    public boolean setCategoryColor(String categoryId, String userId, String color) {
        JsonObject body = new JsonObject();
        if (color == null) body.add("color", com.google.gson.JsonNull.INSTANCE);
        else body.addProperty("color", color);
        return patchCategory(categoryId, userId, body);
    }

    // Ownership enforced at the query (service key bypasses RLS).
    private boolean patchCategory(String categoryId, String userId, JsonObject body) {
        HttpRequest req = base("/categories?id=eq." + encode(categoryId) + "&user_id=eq." + encode(userId))
                .method("PATCH", HttpRequest.BodyPublishers.ofString(gson.toJson(body)))
                .build();
        try {
            HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() >= 400) {
                System.err.println("[Supabase] patchCategory failed: " + res.statusCode() + " " + res.body());
                return false;
            }
            return true;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    // Deletes a category (and its recipe links first, so no FK is left dangling).
    public boolean deleteCategory(String categoryId, String userId) {
        try {
            client.send(base("/recipe_categories?category_id=eq." + encode(categoryId)).DELETE().build(),
                    HttpResponse.BodyHandlers.ofString());
            HttpResponse<String> res = client.send(
                    base("/categories?id=eq." + encode(categoryId) + "&user_id=eq." + encode(userId)).DELETE().build(),
                    HttpResponse.BodyHandlers.ofString());
            return res.statusCode() == 204 || res.statusCode() == 200;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    // Category ids currently linked to a recipe — for the multi-select toggle menu.
    public Set<String> getRecipeCategoryIds(String recipeId) {
        Set<String> ids = new LinkedHashSet<>();
        HttpRequest req = base("/recipe_categories?recipe_id=eq." + encode(recipeId) + "&select=category_id").GET().build();
        try {
            HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
            JsonArray arr = gson.fromJson(res.body(), JsonArray.class);
            for (JsonElement el : arr) ids.add(el.getAsJsonObject().get("category_id").getAsString());
        } catch (Exception e) {
            e.printStackTrace();
        }
        return ids;
    }

    // Removes a single recipe↔category link (multi-select untoggle). True on success.
    public boolean unlinkRecipeCategory(String recipeId, String categoryId) {
        HttpRequest req = base("/recipe_categories?recipe_id=eq." + encode(recipeId)
                + "&category_id=eq." + encode(categoryId)).DELETE().build();
        try {
            HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
            return res.statusCode() == 204 || res.statusCode() == 200;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
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

    public List<Recipe> getRecipesByCategoryId(String categoryId, String userId) {
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
        List<String> encoded = new ArrayList<>();
        for (String rid : recipeIds) encoded.add(encode(rid));
        // Filter to the caller's own recipes: the service key bypasses RLS, so a junction
        // row pointing at someone else's recipe (e.g. one injected via the web) must not
        // leak that recipe's content through a category browse.
        return fetchList(base("/recipes?id=in.(" + String.join(",", encoded)
                + ")&user_id=eq." + encode(userId) + "&select=*").GET().build());
    }

    public boolean linkRecipeCategory(String recipeId, String categoryId) {
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
                return false;
            }
            return true;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    public boolean deleteRecipeById(String id, String userId) {
        // user_id filter enforces ownership at the query — the service key bypasses RLS.
        HttpRequest req = base("/recipes?id=eq." + encode(id) + "&user_id=eq." + encode(userId))
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

    public boolean updateRecipe(String recipeId, String userId, String entry, String newValue) {
        Set<String> allowed = Set.of("name", "description");
        if (!allowed.contains(entry)) throw new IllegalArgumentException("Invalid field: " + entry);

        JsonObject body = new JsonObject();
        body.addProperty(entry, newValue);
        return patchRecipe(recipeId, userId, body);
    }

    // Sets an array column (ingredients/instructions) directly — no string round-trip,
    // so items containing ';' or other delimiters survive intact.
    public boolean updateRecipeArray(String recipeId, String userId, String entry, String[] values) {
        Set<String> allowed = Set.of("ingredients", "instructions");
        if (!allowed.contains(entry)) throw new IllegalArgumentException("Invalid field: " + entry);

        JsonObject body = new JsonObject();
        body.add(entry, toJsonArray(values));
        return patchRecipe(recipeId, userId, body);
    }

    // Sets visibility ("public"/"private") on an existing recipe.
    public boolean updateRecipeVisibility(String recipeId, String userId, String visibility) {
        JsonObject body = new JsonObject();
        body.addProperty("visibility", visibility);
        return patchRecipe(recipeId, userId, body);
    }

    // Sets calories_per_serving (same column the web form writes). null clears it.
    public boolean updateRecipeCalories(String recipeId, String userId, Integer calories) {
        JsonObject body = new JsonObject();
        if (calories == null) body.add("calories_per_serving", com.google.gson.JsonNull.INSTANCE);
        else body.addProperty("calories_per_serving", calories);
        return patchRecipe(recipeId, userId, body);
    }

    // The user_id filter enforces ownership at the write itself (service key bypasses RLS),
    // so a wrong/missing owner patches zero rows instead of someone else's recipe.
    // True on success — callers relay failures instead of claiming success.
    private boolean patchRecipe(String recipeId, String userId, JsonObject body) {
        HttpRequest req = base("/recipes?id=eq." + encode(recipeId) + "&user_id=eq." + encode(userId))
                .method("PATCH", HttpRequest.BodyPublishers.ofString(gson.toJson(body)))
                .build();
        try {
            HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() >= 400) {
                System.err.println("[Supabase] updateRecipe failed: " + res.statusCode() + " " + res.body());
                return false;
            }
            return true;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
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
                .timeout(java.time.Duration.ofSeconds(15))
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

    // Deletes the user and the auth account. Recipe/category data (recipes, categories,
    // cook_logs, recipe_likes, recipe_categories) cascades off the users row via ON DELETE
    // CASCADE FKs. telegram_auth is deleted explicitly since its FK cascade isn't confirmed.
    public boolean deleteAccount(String userId) {
        try {
            // telegram_auth cascades off the users row too, but delete it explicitly
            // first; a failure here is non-fatal (the cascade still covers it).
            client.send(base("/telegram_auth?user_id=eq." + encode(userId)).DELETE().build(),
                    HttpResponse.BodyHandlers.ofString());

            // The users-row delete is the one that cascades everything. If it fails,
            // do NOT delete the auth account — that would orphan it from its profile.
            HttpResponse<String> usersRes = client.send(
                    base("/users?id=eq." + encode(userId)).DELETE().build(),
                    HttpResponse.BodyHandlers.ofString());
            if (usersRes.statusCode() >= 400) {
                System.err.println("[Supabase] deleteAccount: users delete failed: "
                        + usersRes.statusCode() + " " + usersRes.body());
                return false;
            }

            // Delete the auth user via admin API
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(supabaseUrl + "/auth/v1/admin/users/" + userId))
                    .timeout(java.time.Duration.ofSeconds(15))
                    .header("apikey", serviceKey)
                    .header("Authorization", "Bearer " + serviceKey)
                    .DELETE()
                    .build();
            HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() != 200 && res.statusCode() != 204) {
                System.err.println("[Supabase] deleteAccount: auth admin delete failed: "
                        + res.statusCode() + " " + res.body());
                return false;
            }
            return true;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    // *** PRIVATE HELPERS ***

    private HttpRequest.Builder base(String path) {
        return HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + path))
                .timeout(java.time.Duration.ofSeconds(15))
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
        body.addProperty("description", recipe.getDescription() != null ? recipe.getDescription() : "");
        body.add("ingredients", toJsonArray(recipe.getIngredients()));
        body.add("instructions", toJsonArray(recipe.getInstructions()));
        body.addProperty("visibility", recipe.getVisibility() != null ? recipe.getVisibility() : "public");
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
        // Category now lives only in the recipe_categories junction; read the first
        // linked category name when the caller embedded it (select=...recipe_categories(categories(name))).
        String cat = null;
        if (obj.has("recipe_categories") && obj.get("recipe_categories").isJsonArray()) {
            JsonArray rc = obj.getAsJsonArray("recipe_categories");
            if (rc.size() > 0) {
                JsonObject c = rc.get(0).getAsJsonObject().getAsJsonObject("categories");
                if (c != null && c.has("name") && !c.get("name").isJsonNull()) cat = c.get("name").getAsString();
            }
        }
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

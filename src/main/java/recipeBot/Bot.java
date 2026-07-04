package recipeBot;

import org.telegram.telegrambots.bots.TelegramLongPollingBot;
import org.telegram.telegrambots.meta.api.methods.commands.SetMyCommands;
import org.telegram.telegrambots.meta.api.objects.commands.BotCommand;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.EditMessageReplyMarkup;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.EditMessageText;
import org.telegram.telegrambots.meta.api.objects.CallbackQuery;
import org.telegram.telegrambots.meta.api.methods.AnswerCallbackQuery;
import org.telegram.telegrambots.meta.api.objects.Message;
import org.telegram.telegrambots.meta.api.objects.Update;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.ReplyKeyboardMarkup;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.InlineKeyboardButton;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.KeyboardRow;
import org.telegram.telegrambots.meta.exceptions.TelegramApiException;

import io.github.cdimascio.dotenv.Dotenv;
import recipeBot.database.SupabaseHandler;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class Bot extends TelegramLongPollingBot {
    private final SupabaseHandler db;
    private final Dotenv dotenv = Dotenv.load();
    private final ScrapeService scrapeService;
    private final boolean debug;
    private final LinkTokenStore tokenStore;

    private Map<Long, State> userState = new HashMap<>();
    private Map<Long, Recipe> tempRecipes = new HashMap<>();
    private Map<Long, Integer> lastSentMsg = new HashMap<>();
    private Map<Long, String> pendingCategoryId = new HashMap<>(); // category picked during manual add, linked after insert
    private Map<Long, String> renamingCategoryId = new HashMap<>(); // category being renamed via /editcategories

    // Per-user ceilings — mirror the web caps and the DB row-limit trigger (the real gate).
    private static final int MAX_RECIPES = 999;
    private static final int MAX_CATEGORIES = 99;
    private static final int MAX_CALORIES = 100000;

    public Bot(SupabaseHandler dbHandler, boolean debug, LinkTokenStore tokenStore, ScrapeService scrapeService) {
        this.db = dbHandler;
        this.debug = debug;
        this.tokenStore = tokenStore;
        this.scrapeService = scrapeService;
    }

    // Registers the native Telegram command menu (the "Menu" button next to the text box)
    public void registerCommandMenu() {
        List<BotCommand> commands = List.of(
                new BotCommand("recipe", "Add a recipe — manually or from a link"),
                new BotCommand("list", "All your recipes"),
                new BotCommand("listcategories", "Browse recipes by category"),
                new BotCommand("newcategory", "Create a new category"),
                new BotCommand("editcategories", "Rename, recolor or delete categories"),
                new BotCommand("help", "What this bot can do")
        );
        try {
            execute(new SetMyCommands(commands, null, null));
        } catch (TelegramApiException e) {
            System.err.println("[Bot] Failed to register command menu: " + e.getMessage());
        }
    }

    @Override
    public String getBotUsername() {
        return debug ? "@recipe_book_test_bot" : "@Yuvals_Recipe_Book_bot";
    }

    @Override
    public String getBotToken() {
        return dotenv.get(debug ? "TEST_BOT_TOKEN" : "BOT_TOKEN");
    }

    @Override
    public void onUpdateReceived(Update update) {
        Long chatId = extractChatId(update);
        if (chatId == null) return;

        // Block unlinked users — send them the linking flow
        String userId = db.getLinkedUserId(chatId);
        if (userId == null) {
            String token = tokenStore.generate(chatId);
            String link = "https://babrecipebook.vercel.app/?link_token=" + token;
            sendText(chatId, "Please link your RecipeBook account to use this bot:\n" + link);
            return;
        }

        if (update.hasCallbackQuery()) {
            removePreviousKeyboard(chatId);
            handleCallback(update.getCallbackQuery(), userId);
        } else if (update.hasMessage() && update.getMessage().hasText()) {
            removePreviousKeyboard(chatId);
            Message message = update.getMessage();
            if (message.isCommand()) {
                handleCommand(chatId, message, userId);
            } else if (userState.containsKey(chatId)) {
                handleInput(chatId, message, userId);
            }
        }
    }

    private Long extractChatId(Update update) {
        if (update.hasCallbackQuery()) return update.getCallbackQuery().getMessage().getChatId();
        if (update.hasMessage()) return update.getMessage().getChatId();
        return null;
    }

    public void handleCallback(CallbackQuery callbackQuery, String userId) {
        Long id = callbackQuery.getMessage().getChatId();
        String data = callbackQuery.getData();

        // handle delete button press
        if (data.startsWith("DELETE_")) {
            removePreviousKeyboard(id);
            String recipeId = data.substring(7);
            Recipe recipe = db.getRecipeById(recipeId);
            if (recipe == null || !recipe.isOwnedBy(userId)) {
                replaceMessageWithText(id, callbackQuery.getMessage().getMessageId(), "Recipe not found.");
                return;
            }
            String recipeName = esc(recipe.getName());
            if (db.deleteRecipeById(recipeId, userId)) {
                replaceMessageWithText(id, callbackQuery.getMessage().getMessageId(), recipeName + " Recipe Deleted!");
            } else {
                replaceMessageWithText(id, callbackQuery.getMessage().getMessageId(),
                        "Failed to delete " + recipeName + " Recipe.");
            }
            return;
        }


        // handle edit button press
        if (data.startsWith("EDIT_")) {
            removePreviousKeyboard(id);
            String recipeId = data.substring(5);
            sendEditMenu(id, recipeId, userId);
            return;
        }

        if (data.startsWith("EDITFIELD_")) {
            String[] parts = data.split("_", 3);
            String field = parts[1];
            String recipeid = parts[2];
            Recipe recipe = db.getRecipeById(recipeid);
            if (recipe == null || !recipe.isOwnedBy(userId)) {
                replaceMessageWithText(id, callbackQuery.getMessage().getMessageId(), "Recipe not found.");
                return;
            }
            tempRecipes.put(id, recipe); // store recipe in temp storage for editing process
            String recipeName = recipe.getName();
            switch (field) {
                case "NAME":
                    userState.put(id, State.EDITING_NAME);
                    replaceMessageWithTextAndAddCancel(id, callbackQuery.getMessage().getMessageId(),
                            "Enter new name for " + recipeName + ":");
                    break;
                case "CATEGORY":
                    if (db.getUserCategories(userId).isEmpty()) {
                        replaceMessageWithText(id, callbackQuery.getMessage().getMessageId(),
                                "You have no categories yet — make some with /newcategory.");
                    } else {
                        // Multi-select toggle menu (edits this message in place) — no longer
                        // wipes the recipe's other categories the way the old single-pick did.
                        sendMultiCategoryMenu(id, recipe.getId(), userId, callbackQuery.getMessage().getMessageId());
                    }
                    break;
                case "DESCRIPTION":
                    userState.put(id, State.EDITING_DESCRIPTION);
                    replaceMessageWithTextAndAddCancel(id, callbackQuery.getMessage().getMessageId(),
                            "Enter new description for " + recipeName + ":");
                    break;
                case "INGREDIENTS":
                    userState.put(id, State.EDITING_INGREDIENTS);
                    replaceMessageWithTextAndAddCancel(id, callbackQuery.getMessage().getMessageId(),
                            "Enter new ingredients for " + recipeName + " (separated by lines):");
                    break;
                case "INSTRUCTIONS":
                    userState.put(id, State.EDITING_INSTRUCTIONS);
                    replaceMessageWithTextAndAddCancel(id, callbackQuery.getMessage().getMessageId(),
                            "Enter new instructions for " + recipeName + " (separated by lines):");
                    break;
            }
            return;
        }

        if (data.startsWith("EDITVIS_")) {
            String recipeId = data.substring(8);
            Recipe recipe = db.getRecipeById(recipeId);
            if (recipe == null || !recipe.isOwnedBy(userId)) {
                replaceMessageWithText(id, callbackQuery.getMessage().getMessageId(), "Recipe not found.");
                return;
            }
            EditMessageText edit = new EditMessageText();
            edit.setChatId(id.toString());
            edit.setMessageId(callbackQuery.getMessage().getMessageId());
            edit.setText("Who can see this recipe?");
            InlineKeyboardMarkup markup = new InlineKeyboardMarkup();
            List<InlineKeyboardButton> row = new LinkedList<>();
            row.add(createButton("🌎 Public", "SETVIS_PUBLIC_" + recipeId));
            row.add(createButton("🔒 Private", "SETVIS_PRIVATE_" + recipeId));
            markup.setKeyboard(List.of(row));
            edit.setReplyMarkup(markup);
            try { execute(edit); lastSentMsg.put(id, callbackQuery.getMessage().getMessageId()); }
            catch (TelegramApiException e) { throw new RuntimeException(e); }
            return;
        }

        if (data.startsWith("SETVIS_")) {
            String[] parts = data.split("_", 3);
            String vis = parts[1].toLowerCase();
            // Callback data is client-forgeable — only the two real values pass.
            if (!vis.equals("public") && !vis.equals("private")) return;
            String recipeId = parts[2];
            Recipe recipe = db.getRecipeById(recipeId);
            if (recipe == null || !recipe.isOwnedBy(userId)) {
                replaceMessageWithText(id, callbackQuery.getMessage().getMessageId(), "Recipe not found.");
                return;
            }
            boolean ok = db.updateRecipeVisibility(recipeId, userId, vis);
            replaceMessageWithText(id, callbackQuery.getMessage().getMessageId(),
                    !ok ? "Update failed, please try again."
                        : vis.equals("public") ? "Recipe is now public 🌎" : "Recipe is now private 🔒");
            return;
        }

        if (data.startsWith("MAKEPUBLIC_")) {
            String recipeId = data.substring(11);
            Recipe recipe = db.getRecipeById(recipeId);
            if (recipe == null || !recipe.isOwnedBy(userId)) {
                replaceMessageWithText(id, callbackQuery.getMessage().getMessageId(), "Recipe not found.");
                return;
            }
            boolean ok = db.updateRecipeVisibility(recipeId, userId, "public");
            replaceMessageWithText(id, callbackQuery.getMessage().getMessageId(),
                    ok ? "Recipe is now public 🌎" : "Update failed, please try again.");
            return;
        }

        if (data.equals("KEEPPRIVATE")) {
            replaceMessageWithText(id, callbackQuery.getMessage().getMessageId(), "Recipe stays private 🔒");
            return;
        }

        if (data.startsWith("SETCAL_")) {
            String recipeId = data.substring(7);
            Recipe recipe = db.getRecipeById(recipeId);
            if (recipe == null || !recipe.isOwnedBy(userId)) {
                replaceMessageWithText(id, callbackQuery.getMessage().getMessageId(), "Recipe not found.");
                return;
            }
            tempRecipes.put(id, recipe);
            userState.put(id, State.EDITING_CALORIES);
            replaceMessageWithTextAndAddCancel(id, callbackQuery.getMessage().getMessageId(),
                    "Send the calories per serving (a number):");
            return;
        }

        // handle cancel button press
        if (data.equals("CANCEL")) {
            userState.remove(id);
            tempRecipes.remove(id);
            pendingCategoryId.remove(id);
            replaceMessageWithText(id, callbackQuery.getMessage().getMessageId(), "Recipe addition cancelled.");
            return;
        }

        if (data.startsWith("VIS_")) {
            if (userState.get(id) != State.WAITING_FOR_VISIBILITY) return;
            Recipe recipe = tempRecipes.get(id);
            if (recipe == null) { // state expired / stale callback
                replaceMessageWithText(id, callbackQuery.getMessage().getMessageId(), "That recipe is no longer being added.");
                return;
            }
            recipe.setVisibility(data.equals("VIS_PUBLIC") ? "public" : "private");

            if (db.countByUser("recipes", userId) >= MAX_RECIPES) {
                userState.remove(id);
                tempRecipes.remove(id);
                replaceMessageWithText(id, callbackQuery.getMessage().getMessageId(),
                        "You've reached the maximum of " + MAX_RECIPES + " recipes. Delete some to add more.");
                return;
            }
            boolean added = db.addRecipe(recipe, userId);
            userState.remove(id);
            tempRecipes.remove(id);
            if (!added) {
                replaceMessageWithText(id, callbackQuery.getMessage().getMessageId(),
                        "Couldn't save the recipe — please try again.");
                return;
            }
            // link the picked category (junction table, same as the web app)
            String categoryId = pendingCategoryId.remove(id);
            if (categoryId != null && recipe.getId() != null) {
                db.linkRecipeCategory(recipe.getId(), categoryId);
            }

            replaceMessageWithText(id, callbackQuery.getMessage().getMessageId(), "Recipe added successfully!");
            sendRecipePreview(id, recipe, true);
            sendPostAddOptions(id, recipe.getId());
            return;
        }

        if (data.equals("MANUAL")) {
            userState.put(id, State.WAITING_FOR_NAME); // start progress on new recipe addition
            tempRecipes.put(id, new Recipe());
            sendTextWithCancel(id, "Insert recipe name:");
            return;
        }

        if (data.equals("IMPORT_URL")) {
            // Pre-check for UX only — ScrapeService.scrape is the authoritative gate.
            if (!db.canScrape(userId)) {
                replaceMessageWithText(id, callbackQuery.getMessage().getMessageId(),
                        "URL import isn't enabled for your account yet.");
                return;
            }
            replaceMessageWithTextAndAddCancel(id, callbackQuery.getMessage().getMessageId(),
                    "Please send the URL of the recipe you want to import:");
            userState.put(id, State.WAITING_FOR_URL);
            return;
        }

        // handles category selection during recipe addition/editing (user-defined categories)
        if (data.startsWith("PICKCAT_")) {
            String categoryId = data.substring(8);
            boolean none = categoryId.equals("NONE");
            // Reject a category that isn't the user's own (callback IDs are otherwise trusted blindly).
            if (!none && !db.getUserCategories(userId).containsKey(categoryId)) {
                replaceMessageWithText(id, callbackQuery.getMessage().getMessageId(), "Category not found.");
                return;
            }
            String categoryName = none ? null : db.getCategoryName(categoryId);
            Recipe recipe = tempRecipes.get(id);
            if (recipe == null) { // state expired / stale callback
                replaceMessageWithText(id, callbackQuery.getMessage().getMessageId(), "That recipe is no longer being edited.");
                return;
            }

            // PICKCAT is now only the single pick during recipe *creation*; editing an
            // existing recipe's categories goes through the multi-select TOGGLECAT flow.
            if (userState.get(id) == State.WAITING_FOR_CATEGORY) {
                recipe.setCategory(categoryName);
                if (!none) pendingCategoryId.put(id, categoryId);
                replaceMessageWithTextAndAddCancel(id, callbackQuery.getMessage().getMessageId(),
                        "Insert recipe description:");
                userState.put(id, State.WAITING_FOR_DESCRIPTION); // move to next step in recipe addition process
            }
            return;
        }

        // Multi-select category editing: toggle one link, then re-render the menu in place.
        if (data.startsWith("TOGGLECAT_")) {
            String[] parts = data.split("_", 3); // TOGGLECAT_<recipeId>_<categoryId>
            String recipeId = parts[1], categoryId = parts[2];
            Recipe recipe = db.getRecipeById(recipeId);
            if (recipe == null || !recipe.isOwnedBy(userId) || !db.getUserCategories(userId).containsKey(categoryId)) {
                replaceMessageWithText(id, callbackQuery.getMessage().getMessageId(), "Not found.");
                return;
            }
            if (db.getRecipeCategoryIds(recipeId).contains(categoryId)) db.unlinkRecipeCategory(recipeId, categoryId);
            else db.linkRecipeCategory(recipeId, categoryId);
            sendMultiCategoryMenu(id, recipeId, userId, callbackQuery.getMessage().getMessageId());
            return;
        }
        if (data.startsWith("CATDONE_")) {
            replaceMessageWithText(id, callbackQuery.getMessage().getMessageId(), "Categories updated ✅");
            return;
        }

        // --- /editcategories flow: pick a category, then rename / recolor / delete ---
        Integer cbMsgId = callbackQuery.getMessage().getMessageId();
        if (data.startsWith("EDITCAT_")) {
            String catId = data.substring(8);
            if (!db.getUserCategories(userId).containsKey(catId)) { replaceMessageWithText(id, cbMsgId, "Category not found."); return; }
            sendCategoryActionsMenu(id, catId, cbMsgId);
            return;
        }
        if (data.startsWith("CATRENAME_")) {
            String catId = data.substring(10);
            if (!db.getUserCategories(userId).containsKey(catId)) { replaceMessageWithText(id, cbMsgId, "Category not found."); return; }
            renamingCategoryId.put(id, catId);
            userState.put(id, State.RENAMING_CATEGORY);
            replaceMessageWithTextAndAddCancel(id, cbMsgId, "Send the new name for this category:");
            return;
        }
        if (data.startsWith("CATCOLOR_")) {
            String catId = data.substring(9);
            if (!db.getUserCategories(userId).containsKey(catId)) { replaceMessageWithText(id, cbMsgId, "Category not found."); return; }
            sendColorPicker(id, catId, cbMsgId);
            return;
        }
        if (data.startsWith("CATSETCOLOR_")) {
            String[] parts = data.split("_", 3); // CATSETCOLOR_<catId>_<hex|NONE>
            String catId = parts[1], hex = parts[2];
            if (!db.getUserCategories(userId).containsKey(catId)) { replaceMessageWithText(id, cbMsgId, "Category not found."); return; }
            String color = hex.equals("NONE") ? null : "#" + hex;
            boolean ok = db.setCategoryColor(catId, userId, color);
            replaceMessageWithText(id, cbMsgId, ok ? "Color updated " + BotFormat.colorEmoji(color) : "Update failed, please try again.");
            return;
        }
        if (data.startsWith("CATDELYES_")) {
            String catId = data.substring(10);
            boolean ok = db.deleteCategory(catId, userId);
            replaceMessageWithText(id, cbMsgId, ok ? "Category deleted." : "Delete failed, please try again.");
            return;
        }
        if (data.startsWith("CATDEL_")) {
            String catId = data.substring(7);
            if (!db.getUserCategories(userId).containsKey(catId)) { replaceMessageWithText(id, cbMsgId, "Category not found."); return; }
            EditMessageText edit = new EditMessageText();
            edit.setChatId(id.toString());
            edit.setMessageId(cbMsgId);
            edit.setText("Delete <b>" + esc(db.getCategoryName(catId)) + "</b>? It'll be removed from all recipes.");
            edit.setParseMode("HTML");
            InlineKeyboardMarkup markup = new InlineKeyboardMarkup();
            List<InlineKeyboardButton> row = new LinkedList<>();
            row.add(createButton("🗑 Delete", "CATDELYES_" + catId));
            row.add(createButton("Cancel", "CATCANCEL"));
            markup.setKeyboard(List.of(row));
            edit.setReplyMarkup(markup);
            try { execute(edit); } catch (TelegramApiException e) { throw new RuntimeException(e); }
            return;
        }
        if (data.equals("CATCANCEL")) {
            replaceMessageWithText(id, cbMsgId, "Cancelled.");
            return;
        }

        // Prepped log (own recipe) and like toggle (any recipe) — refresh the keyboard in place.
        if (data.startsWith("PREPPED_")) {
            String recipeId = data.substring(8);
            Recipe recipe = db.getRecipeById(recipeId);
            if (recipe == null || !recipe.isOwnedBy(userId)) return;
            db.addCookLog(userId, recipeId);
            refreshPreviewMarkup(id, cbMsgId, recipe, true, userId);
            return;
        }
        if (data.startsWith("LIKE_")) {
            String recipeId = data.substring(5);
            Recipe recipe = db.getRecipeById(recipeId);
            if (recipe == null) return;
            if (db.isLiked(userId, recipeId)) db.removeLike(userId, recipeId);
            else db.addLike(userId, recipeId);
            refreshPreviewMarkup(id, cbMsgId, recipe, recipe.isOwnedBy(userId), userId);
            return;
        }

        // handles browsing all recipes in a category
        if (data.startsWith("SHOWCAT_")) {
            String categoryId = data.substring(8);
            // Verify the category belongs to the user — don't list another user's (incl. private) recipes.
            if (!db.getUserCategories(userId).containsKey(categoryId)) {
                replaceMessageWithText(id, callbackQuery.getMessage().getMessageId(), "Category not found.");
                return;
            }
            String categoryName = db.getCategoryName(categoryId);
            List<Recipe> recipes = db.getRecipesByCategoryId(categoryId, userId);
            if (recipes.isEmpty()) {
                replaceMessageWithText(id, callbackQuery.getMessage().getMessageId(),
                        "No recipes in " + esc(categoryName) + " yet.");
            } else {
                StringBuilder sb = new StringBuilder("<b><u>" + esc(categoryName) + ":</u></b>\n");
                String botName = getBotUsername().replace("@", ""); // remove @ from bot username for link formatting

                for (Recipe recipe : recipes) {
                    String recipeLink = "https://t.me/" + botName + "?start=show_" + recipe.getId();

                    sb.append("<a href=\"" + recipeLink + "\">" + esc(recipe.getName()) + "</a>\n");
                }
                replaceMessageWithText(id, callbackQuery.getMessage().getMessageId(), sb.toString());
            }
            return;
        }

        // acknowledge button press to remove loading state
        AnswerCallbackQuery answer = new AnswerCallbackQuery();
        answer.setCallbackQueryId(callbackQuery.getId());
        try {
            execute(answer);
        } catch (TelegramApiException e) {
            throw new RuntimeException(e);
        }
        return;
    }

    public void handleCommand(Long chatId, Message message, String userId) {
        userState.remove(chatId); // reset progress on new command
        String text = message.getText();
        if (text.equals("/help")) {
            sendText(chatId, "🍽️ <b>Recipe Book Bot</b>\n\n" +
                    "/recipe — add a recipe (manually or from a link)\n" +
                    "/list — all your recipes\n" +
                    "/listCategories — browse by category\n" +
                    "/newCategory — create a new category\n\n" +
                    "Recipes you add here also show up at babrecipebook.vercel.app");
            return;
        }

        if (text.startsWith("/start")) {
            if (text.startsWith("/start show_")) {
                String recipeId = text.substring(12).trim();

                Recipe recipe = db.getRecipeById(recipeId);
                // own recipes always; other users' only if public
                if (recipe == null || !(recipe.isOwnedBy(userId) || "public".equals(recipe.getVisibility()))) {
                    sendText(chatId, "Recipe not found.");
                    return;
                }
                sendRecipePreview(chatId, recipe, recipe.isOwnedBy(userId));
                // deep-link taps reset the reply keyboard client-side — this message restores it
                sendText(chatId, "🔗 <a href=\"https://babrecipebook.vercel.app/?r=" + recipe.getId()
                        + "\">View on the website</a>");
            } else {
                // welcome message
                sendText(chatId, "Hello I am Recipe Book Bot! 🍽️");
            }
            return;
        }

        if (text.equalsIgnoreCase("/listCategories")) {
            sendBrowseCategoriesMenu(chatId, userId);
            return;
        }

        if (text.equalsIgnoreCase("/newcategory")) {
            userState.put(chatId, State.WAITING_FOR_NEW_CATEGORY);
            sendTextWithCancel(chatId, "Send the new category name:");
            return;
        }

        if (text.equalsIgnoreCase("/editcategories")) {
            sendEditCategoriesMenu(chatId, userId);
            return;
        }

        // code to add new recipe
        if (text.equals("/recipe")) {
            sendAddRecipeMenu(chatId);
            return;
        }

        if (text.equals("/list")) {
            sendText(chatId, buildRecipeList(userId));
            return;
        }

    }

    public void handleInput(Long id, Message message, String userId) {
        State state = userState.get(id);
        Recipe recipe = tempRecipes.get(id);
        // insert recipe name
        if (state == State.WAITING_FOR_NAME) {
            // capitalize first letter of each word
            String[] words = message.getText().split(" ");
            StringBuilder sb = new StringBuilder();
            for (String word : words) {
                if (word.length() > 0) {
                    sb.append(Character.toUpperCase(word.charAt(0))).append(word.substring(1)).append(" ");
                }
            }

            recipe.setName(sb.toString().trim());
            if (sendCategoryMenu(id, recipe.getName(), userId)) {
                userState.put(id, State.WAITING_FOR_CATEGORY);
            } else {
                // no categories defined — skip straight to description
                userState.put(id, State.WAITING_FOR_DESCRIPTION);
                sendTextWithCancel(id, "Insert recipe description:");
            }
            return;
        }
        // insert recipe description
        if (state == State.WAITING_FOR_DESCRIPTION) {
            recipe.setDescription(message.getText());
            userState.put(id, State.WAITING_FOR_INGREDIENTS);
            sendTextWithCancel(id, "Insert recipe ingredients:\n" +
                    "Example:\n" +
                    "2 eggs\n" +
                    "1 cup of flour\n");
            return;
        }
        // insert recipe ingredients
        if (state == State.WAITING_FOR_INGREDIENTS) {
            recipe.setIngredients(splitSteps(message.getText()));
            userState.put(id, State.WAITING_FOR_INSTRUCTIONS);
            sendTextWithCancel(id, "Insert recipe instructions (separated by lines):");
            return;
        }
        // insert recipe instructions, then ask for visibility before saving
        if (state == State.WAITING_FOR_INSTRUCTIONS) {
            recipe.setInstructions(splitSteps(message.getText()));
            userState.put(id, State.WAITING_FOR_VISIBILITY);
            sendVisibilityMenu(id);
            return;
        }

        if (state == State.WAITING_FOR_URL) {
            String url = message.getText();
            // sent without the reply keyboard — Telegram can't edit messages that have one
            Integer processingMsgId = sendPlainText(id, "⏳ Processing URL...");

            String result;
            Recipe importedRecipe = null;
            try {
                // ScrapeService gates permission + rate limits, then fetches — same path as the web.
                if (db.countByUser("recipes", userId) >= MAX_RECIPES) {
                    result = "You've reached the maximum of " + MAX_RECIPES + " recipes. Delete some to add more.";
                } else {
                    importedRecipe = scrapeService.scrape(userId, url);
                    importedRecipe.setVisibility("private"); // imports default to private; user can flip below
                    if (db.addRecipe(importedRecipe, userId)) {
                        result = "Recipe imported successfully!";
                    } else {
                        importedRecipe = null;
                        result = "Couldn't save the imported recipe — please try again.";
                    }
                }
            } catch (ScrapeService.ScrapeException e) {
                result = e.getMessage();
            }
            replaceMessageWithText(id, processingMsgId, result);
            System.out.println("[Import] result message updated");
            if (importedRecipe != null) {
                sendRecipePreview(id, importedRecipe, true);
                sendImportVisibilityPrompt(id, importedRecipe.getId());
                sendPostAddOptions(id, importedRecipe.getId());
            }

            userState.remove(id);
            tempRecipes.remove(id);
            return;
        }

        if (state == State.EDITING_NAME) {
            Recipe recipeToEdit = tempRecipes.get(id);
            finishEdit(id, db.updateRecipe(recipeToEdit.getId(), userId, "name", message.getText()),
                    "Recipe name updated successfully!");
            return;
        }

        if (state == State.EDITING_DESCRIPTION) {
            Recipe recipeToEdit = tempRecipes.get(id);
            finishEdit(id, db.updateRecipe(recipeToEdit.getId(), userId, "description", message.getText()),
                    "Recipe description updated successfully!");
            return;
        }

        if (state == State.WAITING_FOR_NEW_CATEGORY) {
            String name = message.getText().trim();
            userState.remove(id);
            if (name.isEmpty()) {
                sendText(id, "Category name can't be empty.");
            } else if (db.countByUser("categories", userId) >= MAX_CATEGORIES) {
                sendText(id, "You've reached the maximum of " + MAX_CATEGORIES + " categories.");
            } else if (db.createCategory(userId, name)) {
                sendText(id, "Category \"" + esc(name) + "\" created!");
            } else {
                sendText(id, "Couldn't create that category — it may already exist.");
            }
            return;
        }

        if (state == State.RENAMING_CATEGORY) {
            String catId = renamingCategoryId.remove(id);
            userState.remove(id);
            String newName = message.getText().trim();
            if (catId == null) {
                sendText(id, "That edit expired — try /editcategories again.");
            } else if (newName.isEmpty()) {
                sendText(id, "Category name can't be empty.");
            } else {
                sendText(id, db.renameCategory(catId, userId, newName)
                        ? "Renamed to \"" + esc(newName) + "\"."
                        : "Rename failed — that name may already exist.");
            }
            return;
        }

        if (state == State.EDITING_CALORIES) {
            Recipe recipeToEdit = tempRecipes.get(id);
            try {
                int cal = Integer.parseInt(message.getText().trim());
                if (cal < 0 || cal > MAX_CALORIES) throw new NumberFormatException();
                finishEdit(id, db.updateRecipeCalories(recipeToEdit.getId(), userId, cal),
                        "Calories per serving updated!");
            } catch (NumberFormatException e) {
                sendTextWithCancel(id, "Please send a whole number between 0 and " + MAX_CALORIES + ", e.g. 250:");
            }
            return;
        }

        if (state == State.EDITING_INGREDIENTS) {
            Recipe recipeToEdit = tempRecipes.get(id);
            finishEdit(id, db.updateRecipeArray(recipeToEdit.getId(), userId, "ingredients", splitSteps(message.getText())),
                    "Recipe ingredients updated successfully!");
            return;
        }

        if (state == State.EDITING_INSTRUCTIONS) {
            Recipe recipeToEdit = tempRecipes.get(id);
            finishEdit(id, db.updateRecipeArray(recipeToEdit.getId(), userId, "instructions", splitSteps(message.getText())),
                    "Recipe instructions updated successfully!");
            return;
        }

    }

    public void sendText(Long Who, String message) {
        SendMessage sendMessage = SendMessage.builder()
                .chatId(Who.toString())
                .text(message)
                .parseMode("HTML")
                .replyMarkup(getMainMenuKeyboard())
                .build();
        try {
            // not tracked in lastSentMsg: no inline keyboard to clean up, and editing
            // this message would strip the reply keyboard it carries
            execute(sendMessage);
        } catch (TelegramApiException e) {
            throw new RuntimeException(e);
        }
    }

    // Like sendText but without the main-menu reply keyboard, so the message stays editable
    public Integer sendPlainText(Long Who, String message) {
        SendMessage sendMessage = SendMessage.builder()
                .chatId(Who.toString())
                .text(message)
                .parseMode("HTML")
                .build();
        try {
            return execute(sendMessage).getMessageId();
        } catch (TelegramApiException e) {
            throw new RuntimeException(e);
        }
    }

    public void sendTextWithCancel(Long Who, String message) {
        SendMessage sendMessage = SendMessage.builder()
                .chatId(Who.toString())
                .text(message)
                .parseMode("HTML")
                .build();
        InlineKeyboardMarkup markup = new InlineKeyboardMarkup();
        List<List<InlineKeyboardButton>> rows = new ArrayList<>();
        List<InlineKeyboardButton> row1 = new ArrayList<>();
        InlineKeyboardButton cancelBtn = new InlineKeyboardButton();
        cancelBtn.setText("❌ Cancel");
        cancelBtn.setCallbackData("CANCEL");
        row1.add(cancelBtn);
        rows.add(row1);
        markup.setKeyboard(rows);
        sendMessage.setReplyMarkup(markup);
        try {
            Message sentMessage = execute(sendMessage);
            lastSentMsg.put(Who, sentMessage.getMessageId()); // track msg id
        } catch (TelegramApiException e) {
            throw new RuntimeException(e);
        }
    }

    // -======== PRIVATE METHODS ========-

    // LOGIC METHODS

    private ReplyKeyboardMarkup getMainMenuKeyboard() {
        ReplyKeyboardMarkup keyboardMarkup = new ReplyKeyboardMarkup();
        keyboardMarkup.setResizeKeyboard(true);
        keyboardMarkup.setOneTimeKeyboard(false);
        keyboardMarkup.setIsPersistent(true); // always shown, never collapses behind the keyboard toggle

        List<KeyboardRow> keyboard = new ArrayList<>();

        // Row 1: Primary actions
        KeyboardRow row1 = new KeyboardRow();
        row1.add("/recipe");
        row1.add("/list");

        // Row 2: Secondary actions
        KeyboardRow row2 = new KeyboardRow();
        row2.add("/help");

        keyboard.add(row1);
        keyboard.add(row2);
        keyboardMarkup.setKeyboard(keyboard);

        return keyboardMarkup;
    }

    // ownerButtons: only the recipe's owner gets Delete/Edit
    // Split a free-typed blob (ingredients or instructions) into items on line breaks AND
    // sentence endings (. ! ?) followed by whitespace — mirrors the web form's splitSteps.
    // Requiring whitespace after the period keeps decimals like "1.5" intact; empty pieces dropped.
    // Escape user content before putting it in an HTML-parse-mode message, so names/descriptions
    // containing <, >, & can't inject markup (recipes are viewable cross-user via deep links).
    private static String esc(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    // One item per line — see BotFormat.splitLines (unit-tested seam).
    private static String[] splitSteps(String text) {
        return BotFormat.splitLines(text);
    }

    // Ends an edit flow: clears the state (so the next message isn't swallowed as
    // another edit) and reports the real outcome instead of assuming success.
    private void finishEdit(Long id, boolean ok, String successMsg) {
        userState.remove(id);
        tempRecipes.remove(id);
        sendText(id, ok ? successMsg : "Update failed, please try again.");
    }

    private String buildRecipeList(String userId) {
        List<Recipe> recipes = db.getAllRecipes(userId);
        if (recipes.isEmpty()) return "No recipes found. Add some with /recipe!";

        List<String> ids = new ArrayList<>();
        for (Recipe r : recipes) ids.add(r.getId());
        Map<String, Integer> cooks = db.countByRecipe("cook_logs", ids);
        Map<String, Integer> likes = db.countByRecipe("recipe_likes", ids);

        StringBuilder sb = new StringBuilder("<b><u>Recipes:</u></b>\n");
        String botName = getBotUsername().replace("@", "");
        for (Recipe recipe : recipes) {
            String recipeLink = "https://t.me/" + botName + "?start=show_" + recipe.getId();
            sb.append("<a href=\"" + recipeLink + "\">" + esc(recipe.getName()) + "</a>")
              .append(BotFormat.countSuffix(cooks.getOrDefault(recipe.getId(), 0), likes.getOrDefault(recipe.getId(), 0)))
              .append("\n");
        }
        return sb.toString();
    }

    // Builds the preview keyboard: owner gets Delete/Edit + a "Made it" prepped button;
    // everyone gets Share + a Like toggle. Counts are live so the label reflects state.
    private InlineKeyboardMarkup buildPreviewMarkup(Recipe recipe, boolean ownerButtons, String userId) {
        String recipeId = recipe.getId();
        List<List<InlineKeyboardButton>> rows = new ArrayList<>();

        List<InlineKeyboardButton> row1 = new ArrayList<>();
        if (ownerButtons) {
            row1.add(createButton("🗑 Delete", "DELETE_" + recipeId));
            row1.add(createButton("✏️ Edit", "EDIT_" + recipeId));
        }
        InlineKeyboardButton shareBtn = new InlineKeyboardButton();
        shareBtn.setText("📤 Share");
        try {
            String rawWebUrl = "https://babrecipebook.vercel.app/?r=" + recipeId;
            String encodedWebUrl = java.net.URLEncoder.encode(rawWebUrl, java.nio.charset.StandardCharsets.UTF_8.name());
            String textToShare = java.net.URLEncoder.encode(recipe.toString(), java.nio.charset.StandardCharsets.UTF_8.name()).replace("+", "%20");
            shareBtn.setUrl("https://t.me/share/url?url=" + encodedWebUrl + "&text=" + textToShare);
        } catch (Exception e) {
            shareBtn.setCallbackData("SHARE_" + recipeId);
        }
        row1.add(shareBtn);
        rows.add(row1);

        // Engagement row: prepped log (owner only) + like toggle (everyone).
        List<InlineKeyboardButton> row2 = new ArrayList<>();
        if (ownerButtons) {
            int cooks = db.countByRecipe("cook_logs", List.of(recipeId)).getOrDefault(recipeId, 0);
            row2.add(createButton("🍳 Made it" + (cooks > 0 ? " (" + cooks + ")" : ""), "PREPPED_" + recipeId));
        }
        int likes = db.countByRecipe("recipe_likes", List.of(recipeId)).getOrDefault(recipeId, 0);
        boolean liked = userId != null && db.isLiked(userId, recipeId);
        row2.add(createButton((liked ? "❤️" : "🤍") + (likes > 0 ? " " + likes : ""), "LIKE_" + recipeId));
        rows.add(row2);

        InlineKeyboardMarkup markup = new InlineKeyboardMarkup();
        markup.setKeyboard(rows);
        return markup;
    }

    // Re-renders just the preview keyboard (updated counts/like state) after a tap.
    private void refreshPreviewMarkup(Long id, Integer msgId, Recipe recipe, boolean ownerButtons, String userId) {
        EditMessageReplyMarkup edit = new EditMessageReplyMarkup();
        edit.setChatId(id.toString());
        edit.setMessageId(msgId);
        edit.setReplyMarkup(buildPreviewMarkup(recipe, ownerButtons, userId));
        try { execute(edit); } catch (TelegramApiException e) { /* stale/identical markup — ignore */ }
    }

    private void sendRecipePreview(Long id, Recipe recipe, boolean ownerButtons) {
        StringBuilder sb = new StringBuilder();
        sb.append("<b><u>" + esc(recipe.getName()) + "</u></b>\n");
        if (recipe.getCategory() != null) sb.append(esc(recipe.getCategory()) + "\n");
        sb.append("\n");
        sb.append("<u>Description: </u>\n" + esc(recipe.getDescription()) + "\n");
        sb.append("🛒 <u>Ingredients: </u>\n");
        for (String ingredient : recipe.getIngredients()) {
            sb.append("• " + esc(ingredient) + "\n");
        }
        sb.append("\n📝 <u>Instructions: </u>\n");
        for (int i = 0; i < recipe.getInstructions().length; i++) {
            sb.append(i + 1 + ". " + esc(recipe.getInstructions()[i]) + "\n");
        }

        SendMessage msg = new SendMessage();
        msg.setChatId(id.toString());
        msg.setText(sb.toString());
        msg.setParseMode("HTML");
        msg.setReplyMarkup(buildPreviewMarkup(recipe, ownerButtons, db.getLinkedUserId(id)));

        try {
            Message sentMessage = execute(msg);
            lastSentMsg.put(id, sentMessage.getMessageId()); // track msg id
        } catch (TelegramApiException e) {
            e.printStackTrace();
            ;
        }
    }

    // INTERFACE METHODS
    private void sendAddRecipeMenu(Long id) {
        SendMessage message = new SendMessage();
        message.setChatId(id.toString());
        message.setText("How would you like to add a recipe?");

        // create categories keyboard
        InlineKeyboardMarkup markup = new InlineKeyboardMarkup();
        List<List<InlineKeyboardButton>> rows = new LinkedList<>();

        // create a row of buttons
        List<InlineKeyboardButton> row = new LinkedList<>();
        row.add(createButton("Manually", "MANUAL"));
        row.add(createButton("🔗", "IMPORT_URL"));

        rows.add(row);
        markup.setKeyboard(rows);
        message.setReplyMarkup(markup);

        try {
            Message sentMessage = execute(message);
            lastSentMsg.put(id, sentMessage.getMessageId()); // track msg id
        } catch (TelegramApiException e) {
            throw new RuntimeException(e);
        }
    }

    // Final step of manual add: pick visibility before the recipe is saved.
    private void sendVisibilityMenu(Long id) {
        SendMessage message = new SendMessage();
        message.setChatId(id.toString());
        message.setText("Who can see this recipe?");

        InlineKeyboardMarkup markup = new InlineKeyboardMarkup();
        List<InlineKeyboardButton> row = new LinkedList<>();
        row.add(createButton("🌎 Public", "VIS_PUBLIC"));
        row.add(createButton("🔒 Private", "VIS_PRIVATE"));
        markup.setKeyboard(List.of(row));
        message.setReplyMarkup(markup);

        try {
            Message sentMessage = execute(message);
            lastSentMsg.put(id, sentMessage.getMessageId());
        } catch (TelegramApiException e) {
            throw new RuntimeException(e);
        }
    }

    // After a URL import (saved private): offer to make it public.
    private void sendImportVisibilityPrompt(Long id, String recipeId) {
        if (recipeId == null) return;
        SendMessage message = new SendMessage();
        message.setChatId(id.toString());
        message.setText("Saved as 🔒 private. Make it public?");

        InlineKeyboardMarkup markup = new InlineKeyboardMarkup();
        List<InlineKeyboardButton> row = new LinkedList<>();
        row.add(createButton("🌎 Make public", "MAKEPUBLIC_" + recipeId));
        row.add(createButton("🔒 Keep private", "KEEPPRIVATE"));
        markup.setKeyboard(List.of(row));
        message.setReplyMarkup(markup);

        try {
            Message sentMessage = execute(message);
            lastSentMsg.put(id, sentMessage.getMessageId());
        } catch (TelegramApiException e) {
            throw new RuntimeException(e);
        }
    }

    // Offered right after a recipe is added (manual or URL import): set a category or calories.
    private void sendPostAddOptions(Long id, String recipeId) {
        if (recipeId == null) return;
        SendMessage message = new SendMessage();
        message.setChatId(id.toString());
        message.setText("Want to set anything else?");

        InlineKeyboardMarkup markup = new InlineKeyboardMarkup();
        List<InlineKeyboardButton> row = new LinkedList<>();
        row.add(createButton("🏷 Category", "EDITFIELD_CATEGORY_" + recipeId));
        row.add(createButton("🔥 Calories", "SETCAL_" + recipeId));
        markup.setKeyboard(List.of(row));
        message.setReplyMarkup(markup);

        try {
            Message sentMessage = execute(message);
            lastSentMsg.put(id, sentMessage.getMessageId());
        } catch (TelegramApiException e) {
            throw new RuntimeException(e);
        }
    }

    private void sendEditMenu(Long id, String recipeId, String userId) {
        Recipe recipe = db.getRecipeById(recipeId);
        if (recipe == null || !recipe.isOwnedBy(userId)) {
            sendText(id, "Recipe not found.");
            return;
        }
        String recipeName = recipe.getName();

        SendMessage message = new SendMessage();
        message.setChatId(id.toString());
        message.setText("What would you like to edit in " + recipeName + "?");

        // create categories keyboard
        InlineKeyboardMarkup markup = new InlineKeyboardMarkup();
        List<List<InlineKeyboardButton>> rows = new LinkedList<>();

        // create a row of buttons
        List<InlineKeyboardButton> row1 = new LinkedList<>();
        row1.add(createButton("Name", "EDITFIELD_NAME_" + recipeId));
        row1.add(createButton("Category", "EDITFIELD_CATEGORY_" + recipeId));

        List<InlineKeyboardButton> row2 = new LinkedList<>();
        row2.add(createButton("Description", "EDITFIELD_DESCRIPTION_" + recipeId));

        List<InlineKeyboardButton> row3 = new LinkedList<>();
        row3.add(createButton("Ingredients", "EDITFIELD_INGREDIENTS_" + recipeId));
        row3.add(createButton("Instructions", "EDITFIELD_INSTRUCTIONS_" + recipeId));

        List<InlineKeyboardButton> row4 = new LinkedList<>();
        row4.add(createButton("🔥 Calories", "SETCAL_" + recipeId));
        row4.add(createButton("👁 Visibility", "EDITVIS_" + recipeId));

        rows.add(row1);
        rows.add(row2);
        rows.add(row3);
        rows.add(row4);
        markup.setKeyboard(rows);
        message.setReplyMarkup(markup);

        try {
            Message sentMessage = execute(message);
            lastSentMsg.put(id, sentMessage.getMessageId()); // track msg id
        } catch (TelegramApiException e) {
            throw new RuntimeException(e);
        }
    }

    // Shows the user's own categories as buttons. Returns false (and sends nothing)
    // if the user has no categories yet.
    private boolean sendCategoryMenu(Long id, String recipeName, String userId) {
        Map<String, String> categories = db.getUserCategories(userId);
        if (categories.isEmpty()) return false;

        SendMessage message = new SendMessage();
        message.setChatId(id.toString());
        message.setText("Select a category for " + recipeName + ":");

        InlineKeyboardMarkup markup = new InlineKeyboardMarkup();
        markup.setKeyboard(buildCategoryRows(categories, db.getUserCategoryColors(userId), "PICKCAT_", createButton("✖️ None", "PICKCAT_NONE")));
        message.setReplyMarkup(markup);

        try {
            Message sentMessage = execute(message);
            lastSentMsg.put(id, sentMessage.getMessageId()); // track msg id
        } catch (TelegramApiException e) {
            throw new RuntimeException(e);
        }
        return true;
    }

    // Multi-select category editor for an existing recipe: each category shows ✅ when
    // linked (else its colour swatch); tapping toggles just that link. Edits in place.
    private void sendMultiCategoryMenu(Long id, String recipeId, String userId, Integer editMsgId) {
        Recipe recipe = db.getRecipeById(recipeId);
        if (recipe == null) return;
        Map<String, String> categories = db.getUserCategories(userId);
        Map<String, String> colors = db.getUserCategoryColors(userId);
        Set<String> linked = db.getRecipeCategoryIds(recipeId);

        List<List<InlineKeyboardButton>> rows = new LinkedList<>();
        List<InlineKeyboardButton> row = new LinkedList<>();
        for (Map.Entry<String, String> cat : categories.entrySet()) {
            boolean on = linked.contains(cat.getKey());
            String label = (on ? "✅" : BotFormat.colorEmoji(colors.get(cat.getKey()))) + " " + cat.getValue();
            row.add(createButton(label, "TOGGLECAT_" + recipeId + "_" + cat.getKey()));
            if (row.size() == 2) { rows.add(row); row = new LinkedList<>(); }
        }
        if (!row.isEmpty()) rows.add(row);
        rows.add(List.of(createButton("✅ Done", "CATDONE_" + recipeId)));

        InlineKeyboardMarkup markup = new InlineKeyboardMarkup();
        markup.setKeyboard(rows);
        EditMessageText edit = new EditMessageText();
        edit.setChatId(id.toString());
        edit.setMessageId(editMsgId);
        edit.setText("Tap to add/remove categories for <b>" + esc(recipe.getName()) + "</b>:");
        edit.setParseMode("HTML");
        edit.setReplyMarkup(markup);
        try { execute(edit); lastSentMsg.put(id, editMsgId); }
        catch (TelegramApiException e) { throw new RuntimeException(e); }
    }

    // /editcategories entry: list the user's categories to pick one to edit.
    private void sendEditCategoriesMenu(Long id, String userId) {
        Map<String, String> categories = db.getUserCategories(userId);
        if (categories.isEmpty()) {
            sendText(id, "You have no categories yet — make some with /newcategory.");
            return;
        }
        SendMessage message = new SendMessage();
        message.setChatId(id.toString());
        message.setText("Pick a category to edit:");
        InlineKeyboardMarkup markup = new InlineKeyboardMarkup();
        markup.setKeyboard(buildCategoryRows(categories, db.getUserCategoryColors(userId), "EDITCAT_", null));
        message.setReplyMarkup(markup);
        try {
            Message sent = execute(message);
            lastSentMsg.put(id, sent.getMessageId());
        } catch (TelegramApiException e) {
            throw new RuntimeException(e);
        }
    }

    // Rename / recolor / delete actions for one category (edits the picker message).
    private void sendCategoryActionsMenu(Long id, String catId, Integer editMsgId) {
        EditMessageText edit = new EditMessageText();
        edit.setChatId(id.toString());
        edit.setMessageId(editMsgId);
        edit.setText("Editing <b>" + esc(db.getCategoryName(catId)) + "</b>:");
        edit.setParseMode("HTML");
        InlineKeyboardMarkup markup = new InlineKeyboardMarkup();
        List<InlineKeyboardButton> row1 = new LinkedList<>();
        row1.add(createButton("✏️ Rename", "CATRENAME_" + catId));
        row1.add(createButton("🎨 Color", "CATCOLOR_" + catId));
        markup.setKeyboard(List.of(row1, List.of(createButton("🗑 Delete", "CATDEL_" + catId))));
        edit.setReplyMarkup(markup);
        try { execute(edit); lastSentMsg.put(id, editMsgId); }
        catch (TelegramApiException e) { throw new RuntimeException(e); }
    }

    // Palette swatches + a "None" (clear) option; sets the category colour on tap.
    private void sendColorPicker(Long id, String catId, Integer editMsgId) {
        List<List<InlineKeyboardButton>> rows = new LinkedList<>();
        List<InlineKeyboardButton> row = new LinkedList<>();
        for (String hex : BotFormat.paletteHexes()) {
            row.add(createButton(BotFormat.colorEmoji("#" + hex), "CATSETCOLOR_" + catId + "_" + hex));
            if (row.size() == 4) { rows.add(row); row = new LinkedList<>(); }
        }
        if (!row.isEmpty()) rows.add(row);
        rows.add(List.of(createButton("⚪ None", "CATSETCOLOR_" + catId + "_NONE")));
        EditMessageText edit = new EditMessageText();
        edit.setChatId(id.toString());
        edit.setMessageId(editMsgId);
        edit.setText("Pick a color:");
        InlineKeyboardMarkup markup = new InlineKeyboardMarkup();
        markup.setKeyboard(rows);
        edit.setReplyMarkup(markup);
        try { execute(edit); lastSentMsg.put(id, editMsgId); }
        catch (TelegramApiException e) { throw new RuntimeException(e); }
    }

    private void sendBrowseCategoriesMenu(Long id, String userId) {
        Map<String, String> categories = db.getUserCategories(userId);
        if (categories.isEmpty()) {
            sendText(id, "You have no categories yet — create them on the website first.");
            return;
        }

        SendMessage message = new SendMessage();
        message.setChatId(id.toString());
        message.setText("Pick a category:");

        InlineKeyboardMarkup markup = new InlineKeyboardMarkup();
        markup.setKeyboard(buildCategoryRows(categories, db.getUserCategoryColors(userId), "SHOWCAT_", null));
        message.setReplyMarkup(markup);

        try {
            Message sentMessage = execute(message);
            lastSentMsg.put(id, sentMessage.getMessageId()); // track msg id
        } catch (TelegramApiException e) {
            throw new RuntimeException(e);
        }
    }

    // Lays out category buttons two per row, each prefixed with its colour swatch,
    // with an optional extra button on its own row. `colors` = id -> hex (nullable).
    private List<List<InlineKeyboardButton>> buildCategoryRows(Map<String, String> categories,
                                                               Map<String, String> colors,
                                                               String callbackPrefix,
                                                               InlineKeyboardButton extraButton) {
        List<List<InlineKeyboardButton>> rows = new LinkedList<>();
        List<InlineKeyboardButton> row = new LinkedList<>();
        for (Map.Entry<String, String> cat : categories.entrySet()) {
            String swatch = BotFormat.colorEmoji(colors == null ? null : colors.get(cat.getKey()));
            row.add(createButton(swatch + " " + cat.getValue(), callbackPrefix + cat.getKey()));
            if (row.size() == 2) {
                rows.add(row);
                row = new LinkedList<>();
            }
        }
        if (!row.isEmpty()) rows.add(row);
        if (extraButton != null) rows.add(List.of(extraButton));
        return rows;
    }

    private InlineKeyboardButton createButton(String text, String callbackData) {
        InlineKeyboardButton button = new InlineKeyboardButton();
        button.setText(text);
        button.setCallbackData(callbackData);
        return button;
    }

    // helper method to remove previous keyboard
    private void removePreviousKeyboard(Long chatId) {
        Integer messageId = lastSentMsg.get(chatId);
        if (messageId != null) {
            EditMessageReplyMarkup editMarkup = new EditMessageReplyMarkup();
            editMarkup.setChatId(chatId.toString());
            editMarkup.setMessageId(messageId);
            editMarkup.setReplyMarkup(null); // Removes the keyboard

            try {
                execute(editMarkup);
            } catch (TelegramApiException e) {
                // Ignore errors if the message was already deleted
            } finally {
                lastSentMsg.remove(chatId); // Clear it from memory
            }
        }
    }

    // helper method to replace message text (used to update category selection
    // message after button press)
    private void replaceMessageWithText(Long chatId, Integer messageId, String newText) {
        EditMessageText edit = new EditMessageText();
        edit.setChatId(chatId.toString());
        edit.setText(newText);
        edit.setParseMode("HTML");
        edit.setMessageId(messageId);

        try {
            execute(edit);
            lastSentMsg.remove(chatId); // edited message no longer has an inline keyboard
        } catch (TelegramApiException e) {
            throw new RuntimeException(e);
        }
    }

    private void replaceMessageWithTextAndAddCancel(Long chatId, Integer messageId, String newText) {
        EditMessageText edit = new EditMessageText();
        edit.setChatId(chatId.toString());
        edit.setText(newText);
        edit.setMessageId(messageId);

        // add cancel button
        InlineKeyboardMarkup markup = new InlineKeyboardMarkup();
        List<List<InlineKeyboardButton>> rows = new ArrayList<>();
        List<InlineKeyboardButton> row1 = new ArrayList<>();
        InlineKeyboardButton cancelBtn = new InlineKeyboardButton();
        cancelBtn.setText("❌ Cancel");
        cancelBtn.setCallbackData("CANCEL");
        row1.add(cancelBtn);
        rows.add(row1);
        markup.setKeyboard(rows);
        edit.setReplyMarkup(markup);

        try {
            execute(edit);
            lastSentMsg.put(chatId, messageId); // track msg id
        } catch (TelegramApiException e) {
            throw new RuntimeException(e);
        }
    }

}
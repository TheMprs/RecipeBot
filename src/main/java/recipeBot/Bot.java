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

public class Bot extends TelegramLongPollingBot {
    private final SupabaseHandler db;
    private final Dotenv dotenv = Dotenv.load();
    private final GeminiHandler gemini = new GeminiHandler(dotenv.get("GEMINI_API_KEY"));
    private final boolean debug;
    private final LinkTokenStore tokenStore;

    private Map<Long, State> userState = new HashMap<>();
    private Map<Long, Recipe> tempRecipes = new HashMap<>();
    private Map<Long, Integer> lastSentMsg = new HashMap<>();
    private Map<Long, String> pendingCategoryId = new HashMap<>(); // category picked during manual add, linked after insert

    public Bot(SupabaseHandler dbHandler, boolean debug, LinkTokenStore tokenStore) {
        this.db = dbHandler;
        this.debug = debug;
        this.tokenStore = tokenStore;
    }

    // Registers the native Telegram command menu (the "Menu" button next to the text box)
    public void registerCommandMenu() {
        List<BotCommand> commands = List.of(
                new BotCommand("recipe", "Add a recipe — manually or from a link"),
                new BotCommand("list", "All your recipes"),
                new BotCommand("listcategories", "Browse recipes by category"),
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
            String recipeName = recipe.getName();
            if (db.deleteRecipeById(recipeId)) {
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
                    if (sendCategoryMenu(id, "the new category for " + recipeName, userId)) {
                        userState.put(id, State.EDITING_CATEGORY);
                    } else {
                        replaceMessageWithText(id, callbackQuery.getMessage().getMessageId(),
                                "You have no categories yet — create them on the website first.");
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

        // handle cancel button press
        if (data.equals("CANCEL")) {
            userState.remove(id);
            tempRecipes.remove(id);
            pendingCategoryId.remove(id);
            replaceMessageWithText(id, callbackQuery.getMessage().getMessageId(), "Recipe addition cancelled.");
            return;
        }

        if (data.equals("MANUAL")) {
            userState.put(id, State.WAITING_FOR_NAME); // start progress on new recipe addition
            tempRecipes.put(id, new Recipe());
            sendTextWithCancel(id, "Insert recipe name:");
            return;
        }

        if (data.equals("IMPORT_URL")) {
            replaceMessageWithTextAndAddCancel(id, callbackQuery.getMessage().getMessageId(),
                    "Please send the URL of the recipe you want to import:");
            userState.put(id, State.WAITING_FOR_URL);
            return;
        }

        // handles category selection during recipe addition/editing (user-defined categories)
        if (data.startsWith("PICKCAT_")) {
            String categoryId = data.substring(8);
            boolean none = categoryId.equals("NONE");
            String categoryName = none ? null : db.getCategoryName(categoryId);
            Recipe recipe = tempRecipes.get(id);

            if (userState.get(id) == State.WAITING_FOR_CATEGORY) {
                recipe.setCategory(categoryName);
                if (!none) pendingCategoryId.put(id, categoryId);
                replaceMessageWithTextAndAddCancel(id, callbackQuery.getMessage().getMessageId(),
                        "Insert recipe description:");
                userState.put(id, State.WAITING_FOR_DESCRIPTION); // move to next step in recipe addition process
            } else if (userState.get(id) == State.EDITING_CATEGORY) {
                db.updateRecipe(recipe.getId(), "category", categoryName != null ? categoryName : "");
                db.setRecipeCategory(recipe.getId(), none ? null : categoryId);
                userState.remove(id);
                tempRecipes.remove(id);
                replaceMessageWithText(id, callbackQuery.getMessage().getMessageId(),
                        "Recipe category updated successfully!");
            }
            return;
        }

        // handles browsing all recipes in a category
        if (data.startsWith("SHOWCAT_")) {
            String categoryId = data.substring(8);
            String categoryName = db.getCategoryName(categoryId);
            List<Recipe> recipes = db.getRecipesByCategoryId(categoryId);
            if (recipes.isEmpty()) {
                replaceMessageWithText(id, callbackQuery.getMessage().getMessageId(),
                        "No recipes in " + categoryName + " yet.");
            } else {
                StringBuilder sb = new StringBuilder("<b><u>" + categoryName + ":</u></b>\n");
                String botName = getBotUsername().replace("@", ""); // remove @ from bot username for link formatting

                for (Recipe recipe : recipes) {
                    String recipeLink = "https://t.me/" + botName + "?start=show_" + recipe.getId();

                    sb.append("<a href=\"" + recipeLink + "\">" + recipe.getName() + "</a>\n");
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
                    "/listCategories — browse by category\n\n" +
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
            String[] rawIngredients = message.getText().split("\n");
            for (int i = 0; i < rawIngredients.length; i++) {
                rawIngredients[i] = rawIngredients[i].trim();
            }
            recipe.setIngredients(rawIngredients);
            userState.put(id, State.WAITING_FOR_INSTRUCTIONS);
            sendTextWithCancel(id, "Insert recipe instructions (separated by lines):");
            return;
        }
        // insert recipe instructions and save to database
        if (state == State.WAITING_FOR_INSTRUCTIONS) {
            String[] instructions = message.getText().split("\n");
            for (int i = 0; i < instructions.length; i++) {
                instructions[i] = instructions[i].trim();
            }
            recipe.setInstructions(instructions);
            
            // save recipe attributed to the linked user
            db.addRecipe(recipe, userId);

            // link the picked category (junction table, same as the web app)
            String categoryId = pendingCategoryId.remove(id);
            if (categoryId != null && recipe.getId() != null) {
                db.linkRecipeCategory(recipe.getId(), categoryId);
            }

            // clean up addition process
            userState.remove(id);
            tempRecipes.remove(id);

            sendText(id, "Recipe added successfully!");
            sendRecipePreview(id, recipe, true);
            return;
        }

        if (state == State.WAITING_FOR_URL) {
            String url = message.getText();
            // sent without the reply keyboard — Telegram can't edit messages that have one
            Integer processingMsgId = sendPlainText(id, "⏳ Processing URL...");

            String result;
            Recipe importedRecipe = null;
            try {
                System.out.println("[Import] fetching " + url);
                Recipe extractedRecipe = UrlFetcher.fetchRecipe(url, gemini);
                System.out.println("[Import] extracted: " + (extractedRecipe != null ? extractedRecipe.getName() : "null"));
                if (extractedRecipe != null && extractedRecipe.getName() != null) {
                    db.addRecipe(extractedRecipe, userId);
                    importedRecipe = extractedRecipe;
                    result = "Recipe imported successfully!";
                } else {
                    result = "Failed to extract recipe from the provided URL. Please make sure it's a valid recipe page and try again.";
                }
            } catch (Exception e) {
                System.err.println("[Import] failed: " + e);
                result = "Invalid URL: " + e.getMessage();
            }
            replaceMessageWithText(id, processingMsgId, result);
            System.out.println("[Import] result message updated");
            if (importedRecipe != null) {
                sendRecipePreview(id, importedRecipe, true);
            }

            userState.remove(id);
            tempRecipes.remove(id);
            return;
        }

        if (state == State.EDITING_NAME) {
            Recipe recipeToEdit = tempRecipes.get(id);
            db.updateRecipe(recipeToEdit.getId(), "name", message.getText());
            sendText(id, "Recipe name updated successfully!");
            return;
        }

        if (state == State.EDITING_DESCRIPTION) {
            Recipe recipeToEdit = tempRecipes.get(id);
            db.updateRecipe(recipeToEdit.getId(), "description", message.getText());
            sendText(id, "Recipe description updated successfully!");
            return;
        }

        if (state == State.EDITING_INGREDIENTS) {
            Recipe recipeToEdit = tempRecipes.get(id);
            String[] rawIngredients = message.getText().split("\n");
            for (int i = 0; i < rawIngredients.length; i++) rawIngredients[i] = rawIngredients[i].trim();
            db.updateRecipe(recipeToEdit.getId(), "ingredients", String.join(";", rawIngredients));
            sendText(id, "Recipe ingredients updated successfully!");
            return;
        }

        if (state == State.EDITING_INSTRUCTIONS) {
            Recipe recipeToEdit = tempRecipes.get(id);
            String[] instructions = message.getText().split("\n");
            for (int i = 0; i < instructions.length; i++) instructions[i] = instructions[i].trim();
            db.updateRecipe(recipeToEdit.getId(), "instructions", String.join(";", instructions));
            sendText(id, "Recipe instructions updated successfully!");
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
    private String buildRecipeList(String userId) {
        List<Recipe> recipes = db.getAllRecipes(userId);
        if (recipes.isEmpty()) return "No recipes found. Add some with /recipe!";

        StringBuilder sb = new StringBuilder("<b><u>Recipes:</u></b>\n");
        String botName = getBotUsername().replace("@", "");
        for (Recipe recipe : recipes) {
            String recipeLink = "https://t.me/" + botName + "?start=show_" + recipe.getId();
            sb.append("<a href=\"" + recipeLink + "\">" + recipe.getName() + "</a>\n");
        }
        return sb.toString();
    }

    private void sendRecipePreview(Long id, Recipe recipe, boolean ownerButtons) {
        StringBuilder sb = new StringBuilder();
        sb.append("<b><u>" + recipe.getName() + "</u></b>\n");
        if (recipe.getCategory() != null) sb.append(recipe.getCategory() + "\n");
        sb.append("\n");
        sb.append("<u>Description: </u>\n" + recipe.getDescription() + "\n");
        sb.append("🛒 <u>Ingredients: </u>\n");
        for (String ingredient : recipe.getIngredients()) {
            sb.append("• " + ingredient + "\n");
        }
        sb.append("\n📝 <u>Instructions: </u>\n");
        for (int i = 0; i < recipe.getInstructions().length; i++) {
            sb.append(i + 1 + ". " + recipe.getInstructions()[i] + "\n");
        }

        // create inline keyboard with delete button
        InlineKeyboardMarkup markup = new InlineKeyboardMarkup();
        List<List<InlineKeyboardButton>> rows = new ArrayList<>();
        List<InlineKeyboardButton> row1 = new ArrayList<>();

        String recipeId = recipe.getId();

        if (ownerButtons) {
            InlineKeyboardButton delBtn = new InlineKeyboardButton();
            delBtn.setText("🗑 Delete");
            delBtn.setCallbackData("DELETE_" + recipeId);
            row1.add(delBtn);

            InlineKeyboardButton editBtn = new InlineKeyboardButton();
            editBtn.setText("✏️ Edit");
            editBtn.setCallbackData("EDIT_" + recipeId);
            row1.add(editBtn);
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
        markup.setKeyboard(rows);

        SendMessage msg = new SendMessage();
        msg.setChatId(id.toString());
        msg.setText(sb.toString());
        msg.setParseMode("HTML");
        msg.setReplyMarkup(markup);

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

        rows.add(row1);
        rows.add(row2);
        rows.add(row3);
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
        markup.setKeyboard(buildCategoryRows(categories, "PICKCAT_", createButton("✖️ None", "PICKCAT_NONE")));
        message.setReplyMarkup(markup);

        try {
            Message sentMessage = execute(message);
            lastSentMsg.put(id, sentMessage.getMessageId()); // track msg id
        } catch (TelegramApiException e) {
            throw new RuntimeException(e);
        }
        return true;
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
        markup.setKeyboard(buildCategoryRows(categories, "SHOWCAT_", null));
        message.setReplyMarkup(markup);

        try {
            Message sentMessage = execute(message);
            lastSentMsg.put(id, sentMessage.getMessageId()); // track msg id
        } catch (TelegramApiException e) {
            throw new RuntimeException(e);
        }
    }

    // Lays out category buttons two per row, with an optional extra button on its own row
    private List<List<InlineKeyboardButton>> buildCategoryRows(Map<String, String> categories,
                                                               String callbackPrefix,
                                                               InlineKeyboardButton extraButton) {
        List<List<InlineKeyboardButton>> rows = new LinkedList<>();
        List<InlineKeyboardButton> row = new LinkedList<>();
        for (Map.Entry<String, String> cat : categories.entrySet()) {
            row.add(createButton(cat.getValue(), callbackPrefix + cat.getKey()));
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
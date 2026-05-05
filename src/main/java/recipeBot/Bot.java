package recipeBot;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.telegram.telegrambots.bots.TelegramLongPollingBot;
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
import recipeBot.database.DatabaseHandler;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;

public class Bot extends TelegramLongPollingBot {
    // database handler for recipe storage
    private final DatabaseHandler db;
    // dotenv for environment variable management
    private final Dotenv dotenv = Dotenv.load();
    // GeminiHandler for AI interactions
    private final GeminiHandler gemini = new GeminiHandler(dotenv.get("GEMINI_API_KEY"));

    // tracks recipe addition progress
    private Map<Long, State> userState = new HashMap<>();
    // temp storage for recipe building
    private Map<Long, Recipe> tempRecipes = new HashMap<>();
    // tracks last sent message for each user to enable message editing
    private Map<Long, Integer> lastSentMsg = new HashMap<>();

    public Bot(DatabaseHandler dbHandler) {
        this.db = dbHandler;
    }

    @Override
    public String getBotUsername() {
        return "@Yuvals_Recipe_Book_bot";
    }

    @Override
    public String getBotToken() {
        return dotenv.get("BOT_TOKEN");
    }

    @Override
    public void onUpdateReceived(Update update) {
        // handle button presses here
        if (update.hasCallbackQuery()) {
            var callbackQuery = update.getCallbackQuery();
            var id = callbackQuery.getMessage().getChatId();
            removePreviousKeyboard(id);
            handleCallback(callbackQuery);
        }
        // handle messages here
        else if (update.hasMessage()) {
            var message = update.getMessage();
            if (message.hasText()) {
                var id = message.getChatId();
                removePreviousKeyboard(id);

                if (message.isCommand()) {
                    handleCommand(id, message);
                } else if (userState.containsKey(id)) {
                    handleInput(id, message);
                }
            }
        }
    }

    public void handleCallback(CallbackQuery callbackQuery) {
        Long id = callbackQuery.getMessage().getChatId();
        String data = callbackQuery.getData();

        // handle delete button press
        if (data.startsWith("DELETE_")) {
            removePreviousKeyboard(id);
            String recipeId = data.substring(7);
            String recipeName = db.getRecipeById(recipeId).getName();
            if (db.deleteRecipe(recipeName)) {
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
            String recipeName = data.substring(5);
            sendEditMenu(id, recipeName);
            return;
        }

        if (data.startsWith("EDITFIELD_")) {
            String[] parts = data.split("_", 3);
            String field = parts[1];
            String recipeid = parts[2];
            Recipe recipe = db.getRecipeById(recipeid);
            if (recipe == null) {
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
                    sendCategoryMenu(id, "the new category for " + recipeName);
                    userState.put(id, State.EDITING_CATEGORY);
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

        if (data.equals("IMPORT_IMAGE")) {
            replaceMessageWithTextAndAddCancel(id, callbackQuery.getMessage().getMessageId(),
                    "Please send the image of the recipe you want to import:");
            userState.put(id, State.WAITING_FOR_IMAGE);
            return;
        }

        // handles category selection during recipe addition process
        if (userState.get(id) == State.WAITING_FOR_CATEGORY) {
            Recipe recipe = tempRecipes.get(id);
            Category category = Category.parse(data.toString());
            recipe.setCategory(category);

            replaceMessageWithTextAndAddCancel(id, callbackQuery.getMessage().getMessageId(),
                    " Insert recipe description:");
            userState.put(id, State.WAITING_FOR_DESCRIPTION); // move to next step in recipe addition process
        }

        // handles category selection during recipe editing process
        if (userState.get(id) == State.EDITING_CATEGORY) {
            Recipe recipe = tempRecipes.get(id);
            Category category = Category.parse(data.toString());

            recipe.setCategory(category);

            int recipeId = db.getIdOf(recipe.getName());
            db.updateRecipe(recipeId, "category", category.toString());
            sendText(id, "Recipe category updated successfully!");

            return;
        }

        // handles choosing all recipes from specific category
        if (userState.get(id) == State.SHOW_CATEGORIES) {
            Category category = Category.parse(data.toString());
            List<Recipe> recipes = db.getRecipesByCategory(category);
            if (recipes.isEmpty()) {
                sendText(id, "No recipes found in " + category + ".");
            } else {
                StringBuilder sb = new StringBuilder("<b><u>Recipes in " + category + "s:</u></b>\n");
                String botName = getBotUsername().replace("@", ""); // remove @ from bot username for link formatting

                for (Recipe recipe : recipes) {
                    int idOfRecipe = db.getIdOf(recipe.getName());

                    String recipeLink = "https://t.me/" + botName + "?start=show_" + idOfRecipe;

                    sb.append("<a href=\"" + recipeLink + "\">" + recipe.getName() + "</a>\n");
                }
                sendText(id, sb.toString());
            }
            userState.remove(id); // reset progress after showing category recipes
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

    public void handleCommand(Long chatId, Message message) {
        userState.remove(chatId); // reset progress on new command
        String text = message.getText();
        if (text.equals("/help")) {

            // sendText(chatId, message);
        }

        if (text.startsWith("/start")) {
            if (text.startsWith("/start show_")) {
                String recipeId = text.substring(12).trim();

                Recipe recipe = db.getRecipeById(recipeId);
                if (recipe == null) {
                    sendText(chatId, "Recipe not found.");
                    return;
                }
                sendRecipePreview(chatId, recipe.getName());
            } else {
                // welcome message
                sendText(chatId, "Hello I am Recipe Book Bot! 🍽️");
            }
            return;
        }

        if (text.equals("/listCategories")) {
            userState.put(chatId, State.SHOW_CATEGORIES);
            sendCategoryMenu(chatId, text);
        }

        // code to add new recipe
        if (text.equals("/recipe")) {
            sendAddRecipeMenu(chatId);
            return;
        }

        if (text.equals("/list")) {
            // code to list all recipes
            List<String> recipes = db.getAllRecipeNames();

            if (recipes.isEmpty()) {
                sendText(chatId, "No recipes found. Add some with /recipe!");
            } else {
                StringBuilder sb = new StringBuilder("<b><u>Recipes:</u></b>\n");
                String botName = getBotUsername().replace("@", ""); // remove @ from bot username for link formatting

                for (String recipeName : recipes) {
                    int id = db.getIdOf(recipeName);

                    String recipeLink = "https://t.me/" + botName + "?start=show_" + id;

                    sb.append("<a href=\"" + recipeLink + "\">" + recipeName + "</a>\n");
                }
                sendText(chatId, sb.toString());
            }
            return;
        }

        if (text.startsWith("/show_")) {
            String recipeName = text.substring(6).replace("_", " ");
            sendRecipePreview(chatId, recipeName);
            return;
        }

    }

    public void handleInput(Long id, Message message) {
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
            userState.put(id, State.WAITING_FOR_CATEGORY);
            sendCategoryMenu(id, recipe.getName());
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
            
            // save recipe to database
            db.addRecipe(recipe);

            // clean up addition process
            userState.remove(id);
            tempRecipes.remove(id);

            sendText(id, "Recipe added successfully!");
            sendRecipePreview(id, recipe.getName());
            return;
        }

        if (state == State.WAITING_FOR_URL) {
            String url = message.getText();

            sendText(id, "Processing URL");

            String rawText = extractTextFromUrl(url);
            Recipe extractedRecipe = gemini.extractRecipeFromText(rawText);

            if (extractedRecipe != null && extractedRecipe.getName() != null) {
                db.addRecipe(extractedRecipe);
                sendText(id, "Recipe imported successfully!");
            } else {
                sendText(id,
                        "Failed to extract recipe from the provided URL. Please make sure it's a valid recipe page and try again.");
            }

            userState.remove(id);
            tempRecipes.remove(id);
            return;
        }

        if (state == State.EDITING_NAME) {
            Recipe recipeToEdit = tempRecipes.get(id);
            int recipeId = db.getIdOf(recipeToEdit.getName());

            db.updateRecipe(recipeId, "name", message.getText());
            sendText(id, "Recipe name updated successfully!");

            return;
        }

        if (state == State.EDITING_DESCRIPTION) {
            Recipe recipeToEdit = tempRecipes.get(id);
            int recipeId = db.getIdOf(recipeToEdit.getName());


            db.updateRecipe(recipeId, "description", message.getText());
            sendText(id, "Recipe description updated successfully!");

            return;
        }

        if (state == State.EDITING_INGREDIENTS) {
            Recipe recipeToEdit = tempRecipes.get(id);
            int recipeId = db.getIdOf(recipeToEdit.getName());

            String[] rawIngredients = message.getText().split("\n");
            for (int i = 0; i < rawIngredients.length; i++) {
                rawIngredients[i] = rawIngredients[i].trim();
            }
            db.updateRecipe(recipeId, "ingredients", String.join(";", rawIngredients));
            sendText(id, "Recipe ingredients updated successfully!");

            return;
        }

        if (state == State.EDITING_INSTRUCTIONS) {
            Recipe recipeToEdit = tempRecipes.get(id);
            int recipeId = db.getIdOf(recipeToEdit.getName());

            String[] instructions = message.getText().split("\n");
            for (int i = 0; i < instructions.length; i++) {
                instructions[i] = instructions[i].trim();
            }
            db.updateRecipe(recipeId, "instructions", String.join(";", instructions));
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
            Message sentMessage = execute(sendMessage);
            lastSentMsg.put(Who, sentMessage.getMessageId()); // track msg id
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
        keyboardMarkup.setSelective(true);
        keyboardMarkup.setResizeKeyboard(true);
        keyboardMarkup.setOneTimeKeyboard(false);

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

    private void sendRecipePreview(Long id, String recipeName) {
        Recipe recipe = db.getRecipeByName(recipeName);
        if (recipe == null) {
            sendText(id, "Recipe not found.");
            return;
        }

        StringBuilder sb = new StringBuilder();
        sb.append("<b><u>" + recipe.getName() + "</u></b>\n");
        sb.append(recipe.getCategory() + "\n\n");
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

        int recipeId = db.getIdOf(recipe.getName());

        InlineKeyboardButton delBtn = new InlineKeyboardButton();
        delBtn.setText("🗑 Delete");
        delBtn.setCallbackData("DELETE_" + recipeId);
        row1.add(delBtn);
        InlineKeyboardButton editBtn = new InlineKeyboardButton();
        editBtn.setText("✏️ Edit");
        editBtn.setCallbackData("EDIT_" + recipeId);

        row1.add(editBtn);
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

    private String extractTextFromUrl(String url) {
        try {
            return Jsoup.connect(url)
                    .userAgent(
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                    .referrer("http://www.google.com")
                    .header("Accept-Language", "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7")
                    .timeout(10000) // Give it 10 seconds to load
                    .get()
                    .text();
        } catch (Exception e) {
            e.printStackTrace();
            return null;
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
        row.add(createButton("🖼️", "IMPORT_IMAGE"));

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

    private void sendEditMenu(Long id, String recipeId) {
        Recipe recipe = db.getRecipeById(recipeId);
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

    private void sendCategoryMenu(Long id, String recipeName) {
        SendMessage message = new SendMessage();
        message.setChatId(id.toString());
        message.setText("Select a category for " + recipeName + ":");

        // create categories keyboard
        InlineKeyboardMarkup markup = new InlineKeyboardMarkup();
        List<List<InlineKeyboardButton>> rows = new LinkedList<>();

        // create a row of buttons
        List<InlineKeyboardButton> row = new LinkedList<>();
        row.add(createButton("Dessert", "DESSERT"));
        row.add(createButton("Main", "MAIN"));
        row.add(createButton("Snack", "SNACK"));
        row.add(createButton("Special", "SPECIAL"));

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
        edit.setMessageId(messageId);

        try {
            execute(edit);
            lastSentMsg.put(chatId, messageId); // track msg id
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
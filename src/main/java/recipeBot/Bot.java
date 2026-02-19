package recipeBot;

import org.telegram.telegrambots.bots.TelegramLongPollingBot;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.EditMessageText;
import org.telegram.telegrambots.meta.api.objects.CallbackQuery;
import org.telegram.telegrambots.meta.api.methods.AnswerCallbackQuery;
import org.telegram.telegrambots.meta.api.objects.Message;
import org.telegram.telegrambots.meta.api.objects.Update;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.InlineKeyboardButton;
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

    public Bot(DatabaseHandler dbHandler) {
        this.db = dbHandler;
    }

    @Override
    public String getBotUsername() {
        return "@Yuvals_Recipe_Book_bot";
    }

    @Override
    public String getBotToken() { return dotenv.get("BOT_TOKEN"); }

    @Override
    public void onUpdateReceived(Update update) {   
        // handle button presses here
        if(update.hasCallbackQuery()) {
            handleCallback(update.getCallbackQuery());
        }
        // handle messages here
        else if(update.hasMessage()) {
            var message = update.getMessage();
            if(message.hasText()) {
                var id = message.getChatId();
                
                if(message.isCommand()){
                    handleCommand(id, message);
                }
                else if(userState.containsKey(id)){
                    handleInput(id, message);
                }
            }
        }
    }

    public void handleCallback(CallbackQuery callbackQuery){
        Long id = callbackQuery.getMessage().getChatId();
        String data = callbackQuery.getData();

        // handle delete button press
        if(data.startsWith("DELETE_")) {
            String recipeName = data.substring(7);
            if(db.deleteRecipe(recipeName)) {
                replaceMessageWithText(id, callbackQuery.getMessage().getMessageId(), recipeName+" Recipe Deleted!");
            } else {
                replaceMessageWithText(id, callbackQuery.getMessage().getMessageId(), "Failed to delete "+recipeName+" Recipe.");
            }
            return;
        }

        // handle cancel button press
        if(data.equals("CANCEL")) {
            userState.remove(id);
            tempRecipes.remove(id);
            replaceMessageWithText(id, callbackQuery.getMessage().getMessageId(), "Recipe addition cancelled.");
            return;
        }

        // handles category selection during recipe addition process
        if(userState.get(id) == State.WAITING_FOR_CATEGORY) {
            Recipe recipe = tempRecipes.get(id);
            Category category = Category.parse(data.toString());
            recipe.setCategory(category);
            
            replaceMessageWithTextAndAddCancel(id, callbackQuery.getMessage().getMessageId()," Insert recipe description:");
            userState.put(id, State.WAITING_FOR_DESCRIPTION); // move to next step in recipe addition process
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

    public void handleCommand(Long id, Message message){
        userState.remove(id); // reset progress on new command
        String text = message.getText();     
        
        if(text.startsWith("/start")){
            if(text.startsWith("/start show_")){
                String recipeName = text.substring(12).replace("_", " ");
                sendRecipePreview(id, recipeName);
            } else {
                // welcome message
                sendText(id, "Hello I am Recipe Book Bot! 🍽️");
            }   
            return;
        }
        
        // code to add new recipe    
        if(text.equals("/recipe")) {
            
            userState.put(id, State.WAITING_FOR_NAME); // start progress on new recipe addition
            tempRecipes.put(id, new Recipe());
            sendTextWithCancel(id, "Insert recipe name:");

            return;
        }

        if(text.equals("/list")){
            // code to list all recipes
            List<String> recipes = db.getAllRecipesNames();
            
            if(recipes.isEmpty()) {
                sendText(id, "No recipes found. Add some with /recipe!");
            } else {
                StringBuilder sb = new StringBuilder("<b><u>Recipes:</u></b>\n");
                String botName = getBotUsername().replace("@", ""); // remove @ from bot username for link formatting

                for(String recipeName : recipes){
                    recipeName = recipeName.replace(" ", "_"); // replace spaces with underscores for link formatting
                    String recipeLink = "https://t.me/" + botName + "?start=show_" + recipeName;
                    
                    sb.append("<a href=\"" + recipeLink + "\">" + recipeName + "</a>\n");
                }
                sendText(id, sb.toString());
            }
            return;
        }

        if(text.startsWith("/show_")){
            String recipeName = text.substring(6).replace("_", " ");
            sendRecipePreview(id, recipeName);
            return;
        }
        
    }

    public void handleInput(Long id, Message message){
        State state = userState.get(id);
        Recipe recipe = tempRecipes.get(id);
        // insert recipe name
        if(state == State.WAITING_FOR_NAME) {
            // capitalize first letter of each word
            String[] words = message.getText().split(" ");
            StringBuilder sb = new StringBuilder();
            for(String word : words) {
                if(word.length() > 0) {
                    sb.append(Character.toUpperCase(word.charAt(0))).append(word.substring(1)).append(" ");
                }
            }

            recipe.setName(sb.toString().trim());
            userState.put(id, State.WAITING_FOR_CATEGORY);
            sendCategoryMenu(id, recipe.getName());
            return;
        }
        // insert recipe description
        if(state == State.WAITING_FOR_DESCRIPTION) { 
            recipe.setDescription(message.getText());
            userState.put(id, State.WAITING_FOR_INGREDIENTS);
            sendTextWithCancel(id, "Insert recipe ingredients:\n" +
            "Example:\n" + 
            "2 eggs\n" +
            "1 cup of flour\n");
            return;
        }
        // insert recipe ingredients
        if(state == State.WAITING_FOR_INGREDIENTS) {
            String[] rawIngredients = message.getText().split("\n");
            for(int i=0; i<rawIngredients.length; i++){
                rawIngredients[i]=rawIngredients[i].trim();
            }
            recipe.setIngredients(rawIngredients);
            userState.put(id, State.WAITING_FOR_INSTRUCTIONS);
            sendTextWithCancel(id, "Insert recipe instructions (separated by lines):");
            return;
        }
        // insert recipe instructions and save to database
        if(state == State.WAITING_FOR_INSTRUCTIONS) {
            String[] instructions = message.getText().split("\n");
            for(int i=0; i<instructions.length; i++){
                instructions[i] = instructions[i].trim();
            }
            recipe.setInstructions(instructions);
            
            // save recipe to database
            db.addRecipe(recipe);
        
            //clean up addition process
            userState.remove(id);
            tempRecipes.remove(id);

            sendText(id, "Recipe added successfully!");
            return;
        }
    }

    public void sendText(Long Who, String message) {
        SendMessage sendMessage = SendMessage.builder()
                                    .chatId(Who.toString())
                                    .text(message)
                                    .parseMode("HTML")
                                    .build();
        try {
            execute(sendMessage);
        }
        catch (TelegramApiException e) {
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
            execute(sendMessage);
        }
        catch (TelegramApiException e) {
            throw new RuntimeException(e);
        }
    }

    // -======== PRIVATE METHODS ========-

    // LOGIC METHODS
    private void sendRecipePreview(Long id, String recipeName) {
    Recipe recipe = db.getRecipeByName(recipeName);
        if (recipe == null) {
            sendText(id, "Recipe not found.");
            return;
        } 

        StringBuilder sb = new StringBuilder();
        sb.append("<b><u>" + recipe.getName() +"</u></b>\n");
        sb.append("Category: " + recipe.getCategory() + "\n");
        sb.append("<u>Description: </u>\n" + recipe.getDescription() + "\n");
        sb.append("<u>Ingredients: </u>\n");
        for(String ingredient : recipe.getIngredients()) {
            sb.append("• " + ingredient + "\n");
        }
        sb.append("<u>Instructions: </u>\n");
        for(int i = 0; i < recipe.getInstructions().length; i++) {
            sb.append(i+1+". " + recipe.getInstructions()[i] + "\n");
        }
        
        // create inline keyboard with delete button
        InlineKeyboardMarkup markup = new InlineKeyboardMarkup();
        List<List<InlineKeyboardButton>> rows = new ArrayList<>();        
        List<InlineKeyboardButton> row1 = new ArrayList<>();
        
        InlineKeyboardButton delBtn = new InlineKeyboardButton();
        delBtn.setText("🗑 Delete");
        delBtn.setCallbackData("DELETE_" + recipe.getName());
        row1.add(delBtn);

        rows.add(row1);
        markup.setKeyboard(rows);


        SendMessage msg = new SendMessage();
        msg.setChatId(id.toString());
        msg.setText(sb.toString());
        msg.setParseMode("HTML"); 
        msg.setReplyMarkup(markup);

        try { execute(msg); }
        catch (TelegramApiException e) { e.printStackTrace();; }
    }

    // INTERFACE METHODS

    private void sendCategoryMenu(Long id, String recipeName) {
        SendMessage message = new SendMessage();
        message.setChatId(id.toString());
        message.setText("Select a category for "+recipeName+":");

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
            execute(message);
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

    // helper method to replace message text (used to update category selection message after button press)
    private void replaceMessageWithText(Long chatId, Integer messageId, String newText) {
        EditMessageText edit = new EditMessageText();
        edit.setChatId(chatId.toString());
        edit.setText(newText);
        edit.setMessageId(messageId);

        try {
            execute(edit);
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
        } catch (TelegramApiException e) {
            throw new RuntimeException(e);
        }
    }
}
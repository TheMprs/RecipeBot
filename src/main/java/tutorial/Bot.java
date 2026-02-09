package tutorial;

import org.telegram.telegrambots.bots.TelegramLongPollingBot;
import org.telegram.telegrambots.meta.api.methods.AnswerCallbackQuery;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.EditMessageReplyMarkup;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.EditMessageText;
import org.telegram.telegrambots.meta.api.objects.Message;
import org.telegram.telegrambots.meta.api.objects.Update;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;
import org.telegram.telegrambots.meta.exceptions.TelegramApiException;

import java.util.HashMap;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;

public class Bot extends TelegramLongPollingBot {

    // stores recipes for each user
    private List<Recipe> recipeBook = new LinkedList<Recipe>();
    // tracks recipe addition progress
    private Map<Long, State> userState = new HashMap<>();
    // temp storage for recipe building
    private Map<Long, Recipe> tempRecipes = new HashMap<>();

    @Override
    public String getBotUsername() {
        return "@Yuvals_Recipe_Book_bot";
    }

    @Override
    public String getBotToken() { return null; }

    @Override
    public void onUpdateReceived(Update update) {
        var message = update.getMessage();
        var user = message.getFrom();
        var id = message.getChatId();

        if(message.isCommand()){
            handleCommand(id, message);
        }
        else if(userState.containsKey(id)){
            handleInput(id, message);
        }
    }

    public void handleCommand(Long id, Message message){
        userState.remove(id); // reset progress on new command
        if(message.equals("/recipe")) {
            // code to add new recipe
            userState.put(id, State.WAITING_FOR_NAME); // start progress on new recipe addition
            tempRecipes.put(id, new Recipe());
            sendText(id, "Insert recipe name:");
        }
        else if(message.equals("/list")){
            // code to list all recipes
        }
    }

    public void handleInput(Long id, Message message){
        State state = userState.get(id);
        Recipe recipe = tempRecipes.get(id);

        if(state == State.WAITING_FOR_NAME) {
            recipe.setName(message.getText());
            userState.put(id, State.WAITING_FOR_CATEGORY);
            sendText(id, "What category is "+ recipe.getName()+"?");
        }
        else if(state == State.WAITING_FOR_CATEGORY) {
            Category category = parseCategory(message);
            if(category == null) { sendText(id, "Category "+message.getText()+" not found"); }
            else {
                recipe.setCategory(category);
                recipeBook.add(recipe);

                //clean up addition process
                userState.remove(id);
                tempRecipes.remove(id);
                sendText(id, recipe.getName()+" Recipe Saved!");
            }
        }
    }

    private Category parseCategory(Message message){
        switch (message.getText()) {
            case "dessert", "Dessert": return Category.DESSERT;
            case "main", "Main":  return Category.MAIN;
            case "snack", "Snack":  return Category.SNACK;
            default: return null;
        }
    }

    public void sendText(Long Who, String message) {
        SendMessage sendMessage = SendMessage.builder()
                                    .chatId(Who.toString())
                                    .text(message)
                                    .build();
        try {
            execute(sendMessage);
        }
        catch (TelegramApiException e) {
            throw new RuntimeException(e);
        }
    }

    public void sendMenu(Long Who, String message, InlineKeyboardMarkup keyboardMarkup) {
        SendMessage sendMessage = SendMessage.builder()
                .chatId(Who.toString())
                .parseMode("HTML")
                .text(message)
                .replyMarkup(keyboardMarkup)
                .build();

        try {
            execute(sendMessage);
        }
        catch (TelegramApiException e) {
            throw new RuntimeException(e);
        }
    }
}

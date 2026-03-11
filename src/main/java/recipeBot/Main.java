package recipeBot;

import recipeBot.database.DatabaseHandler;
import org.telegram.telegrambots.meta.TelegramBotsApi;
import org.telegram.telegrambots.meta.exceptions.TelegramApiException;
import org.telegram.telegrambots.updatesreceivers.DefaultBotSession;
import io.javalin.Javalin;
import recipeBot.database.DatabaseHandler;

public class Main {
    public static void main(String[] args) throws TelegramApiException {
        // db init
        DatabaseHandler db = new DatabaseHandler();

        // bot init
        TelegramBotsApi telegramBotsApi = new TelegramBotsApi(DefaultBotSession.class);
        Bot bot = new Bot(db);
        telegramBotsApi.registerBot(bot);
        
        // init web server
        Javalin app = Javalin.create(config -> {
            // allow cross origin requests from bot and web server
            config.bundledPlugins.enableCors(cors -> cors.addRule(it -> it.anyHost()));
        }).start(8080);

        app.get("/api/recipes", ctx -> {
            ctx.json(db.getAllRecipesNames());
        });
    }
}
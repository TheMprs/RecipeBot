package recipeBot;

import recipeBot.database.SupabaseHandler;
import org.telegram.telegrambots.meta.TelegramBotsApi;
import org.telegram.telegrambots.meta.exceptions.TelegramApiException;
import org.telegram.telegrambots.updatesreceivers.DefaultBotSession;
import io.github.cdimascio.dotenv.Dotenv;
import io.javalin.Javalin;

public class Main {
    public static void main(String[] args) throws TelegramApiException {
        Dotenv dotenv = Dotenv.load();

        SupabaseHandler db = new SupabaseHandler(
                dotenv.get("SUPABASE_URL"),
                dotenv.get("SUPABASE_SERVICE_KEY")
        );

        // Optional: attribute bot-added recipes to the owner's Supabase user
        String botUserId = dotenv.get("BOT_USER_ID", null);
        if (botUserId != null) db.setDefaultUserId(botUserId);

        boolean debug = args.length > 0 && args[0].equals("-debug");
        if (debug) System.out.println("[Mode] DEBUG — using test bot");

        LinkTokenStore tokenStore = new LinkTokenStore();

        TelegramBotsApi telegramBotsApi = new TelegramBotsApi(DefaultBotSession.class);
        Bot bot = new Bot(db, debug, tokenStore);
        telegramBotsApi.registerBot(bot);

        Javalin app = Javalin.create(config -> {
            config.bundledPlugins.enableCors(cors -> cors.addRule(it -> it.anyHost()));
        }).start(8080);

        webManager webManager = new webManager(db, tokenStore);
        webManager.registerRoutes(app);
    }
}

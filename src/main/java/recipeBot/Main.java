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

        boolean debug = args.length > 0 && args[0].equals("-debug");
        if (debug) System.out.println("[Mode] DEBUG — using test bot");

        LinkTokenStore tokenStore = new LinkTokenStore();
        // One shared scrape chokepoint — same permission + rate-limit state for bot and web.
        ScrapeService scrapeService = new ScrapeService(db, dotenv.get("GEMINI_API_KEY"));

        TelegramBotsApi telegramBotsApi = new TelegramBotsApi(DefaultBotSession.class);
        Bot bot = new Bot(db, debug, tokenStore, scrapeService);
        telegramBotsApi.registerBot(bot);
        bot.registerCommandMenu();

        Javalin app = Javalin.create(config -> {
            config.bundledPlugins.enableCors(cors -> cors.addRule(it -> {
                it.allowHost("https://babrecipebook.vercel.app");
                if (debug) it.allowHost("http://localhost:5173"); // dev origin only in -debug
            }));
        // Bind to localhost only — Caddy (same VM) terminates TLS on 443 and
        // reverse-proxies here. The cleartext port is never exposed publicly.
        }).start("127.0.0.1", 8080);

        webManager webManager = new webManager(db, tokenStore, scrapeService);
        webManager.registerRoutes(app);
    }
}

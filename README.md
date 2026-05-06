# 🍳 Yuval's Recipe Book

![Java](https://img.shields.io/badge/Java-23-orange?style=for-the-badge&logo=openjdk)
![React](https://img.shields.io/badge/React_19-Vite-61DAFB?style=for-the-badge&logo=react)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-3-38B2AC?style=for-the-badge&logo=tailwind-css)
![Telegram](https://img.shields.io/badge/Telegram-Bot-26A5E4?style=for-the-badge&logo=telegram)
![SQLite](https://img.shields.io/badge/SQLite-Database-003B57?style=for-the-badge&logo=sqlite)
![GCP](https://img.shields.io/badge/Google_Cloud-VM-4285F4?style=for-the-badge&logo=google-cloud)
![Vercel](https://img.shields.io/badge/Vercel-Deployed-black?style=for-the-badge&logo=vercel)

> A full-stack personal cookbook — React web app, Telegram bot, and AI scraper, all sharing one backend on Google Cloud.

**[→ Open the Web App](https://babrecipebook.vercel.app)**

---

## What it does

You can add, browse, and cook recipes from two completely different surfaces — a polished web dashboard or a Telegram bot — and they stay perfectly in sync. Both interfaces talk to the same Java REST API, which persists everything to a single SQLite database on a GCP VM.

There's also an AI pipeline: paste any recipe URL (or a photo in Telegram), and Gemini extracts the structured recipe automatically — title, category, description, ingredients, instructions — even when the source is in Hebrew.

---

## Architecture

```
┌─────────────────────┐     ┌─────────────────────┐
│   React + Vite      │     │   Telegram Bot       │
│   (Vercel)          │     │   (Java)             │
└────────┬────────────┘     └──────────┬───────────┘
         │  REST /api/*                │
         └──────────────┬──────────────┘
                        ▼
            ┌───────────────────────┐
            │  Javalin HTTP Server  │  ← GCP VM (port 8080)
            │  + TelegramBots API   │
            ├───────────────────────┤
            │  GeminiHandler (AI)   │
            ├───────────────────────┤
            │  SQLite Database      │
            └───────────────────────┘
```

The frontend proxies `/api/*` to the GCP VM — in production via Vercel rewrites, in development via Vite's proxy config.

---

## Features

**Web App**
- Clean card-based recipe browser with live search and category filtering
- Recipe detail view with step-by-step instructions and a **checkable ingredient list** (state persisted in cookies, survives page refreshes)
- Add / edit / delete recipes through a fully guided form
- **AI import:** paste any recipe URL → Gemini parses the page and pre-fills the form
- **Share:** generates a shareable link or copies a formatted text card to clipboard
- Full bilingual support — Hebrew (RTL) and English, toggle at any time

**Telegram Bot**
- Step-by-step recipe creation wizard via inline keyboard buttons
- Browse all recipes as deep-linked messages — tap a name, get the full card
- Filter by category, delete or edit any field with button menus
- **URL import:** send a recipe URL, get a structured recipe back in seconds
- **Image import:** send a photo of a recipe and Gemini OCRs + extracts it
- Share button generates a Telegram-native share link to the web app

**Backend**
- REST API built with [Javalin](https://javalin.io/) — lightweight, no Spring bloat
- AI extraction via Gemini 2.5 Flash with structured JSON output (`response_mime_type: application/json`)
- Web scraping via Jsoup with realistic browser headers to handle most recipe sites
- Automated CI/CD via GitHub Actions: build → SSH database backup → deploy JAR → restart systemd service

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite 7, Tailwind CSS 3, Lucide React |
| Backend | Java 23, Javalin 6, TelegramBots 6 |
| AI | Google Gemini 2.5 Flash API |
| Scraping | Jsoup |
| Database | SQLite (via JDBC) |
| Hosting | GCP VM (backend) + Vercel (frontend) |
| CI/CD | GitHub Actions |

---

## CI/CD Pipeline

Every push to `main` triggers a GitHub Actions workflow that:

1. Builds the fat JAR with Maven
2. **SSHs into the GCP VM and backs up the database** before touching anything
3. SCPs the new JAR to the server
4. Restores the database backup (guards against accidental schema wipes)
5. Rewrites the systemd service file and restarts the server
6. Tails the journal logs as a final health check

Zero downtime on the database, automatic rollback safety on every deploy.

---

## Local Development

**Prerequisites:** Java 23, Maven, Node 20+, a Telegram bot token, a Gemini API key.

```bash
git clone https://github.com/TheMprs/RecipeBot.git
cd RecipeBot
```

Create a `.env` file in the project root:

```env
BOT_TOKEN=your_telegram_bot_token
GEMINI_API_KEY=your_gemini_api_key
```

**Run the backend:**
```bash
mvn clean package -DskipTests
java -jar target/RecipeBot-1.0-SNAPSHOT-jar-with-dependencies.jar
```

**Run the frontend:**
```bash
cd web
npm install
npm run dev
```

The Vite dev server proxies `/api/*` to `localhost:8080` automatically.

---

## Project Structure

```
RecipeBot/
├── src/main/java/recipeBot/
│   ├── Main.java            # Boots Javalin + Telegram bot
│   ├── Bot.java             # Telegram long-polling handler
│   ├── webManager.java      # REST route handlers
│   ├── GeminiHandler.java   # AI extraction pipeline
│   ├── Recipe.java          # Domain model
│   ├── Category.java        # Enum: MAIN / DESSERT / SNACK / SPECIAL
│   └── database/
│       └── DatabaseHandler.java
├── web/                     # React frontend
│   └── src/
│       ├── App.jsx
│       └── components/
│           ├── RecipeCard.jsx
│           ├── RecipeDetail.jsx
│           └── RecipeForm.jsx
├── .github/workflows/
│   └── deploy.yml           # CI/CD pipeline
└── pom.xml
```

---

## License

MIT

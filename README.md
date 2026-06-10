# 🍳 Yuval's Recipe Book

![Java](https://img.shields.io/badge/Java-23-orange?style=for-the-badge&logo=openjdk)
![React](https://img.shields.io/badge/React_19-Vite-61DAFB?style=for-the-badge&logo=react)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-3-38B2AC?style=for-the-badge&logo=tailwind-css)
![Telegram](https://img.shields.io/badge/Telegram-Bot-26A5E4?style=for-the-badge&logo=telegram)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ECF8E?style=for-the-badge&logo=supabase)
![GCP](https://img.shields.io/badge/Google_Cloud-VM-4285F4?style=for-the-badge&logo=google-cloud)
![Vercel](https://img.shields.io/badge/Vercel-Deployed-black?style=for-the-badge&logo=vercel)

> A full-stack personal cookbook — a React web app and a Telegram bot, both backed by Supabase, with an AI scraper that turns any recipe URL into a structured recipe.

**[→ Open the Web App](https://babrecipebook.vercel.app)**

---

## Table of Contents

1. [What it does](#what-it-does)
2. [Architecture](#architecture)
3. [Tech stack](#tech-stack)
4. [Data model](#data-model)
5. [Backend API surface](#backend-api-surface)
6. [Authentication](#authentication)
7. [Environment variables](#environment-variables)
8. [Local development](#local-development)
9. [CI/CD pipeline](#cicd-pipeline)
10. [Project structure](#project-structure)
11. [Roadmap](#roadmap)

---

## What it does

You add, browse, and cook recipes from two surfaces — a React web dashboard or a Telegram bot — and they stay in sync because both read and write the **same Supabase Postgres database**.

- **Web app** (Vercel): Google sign-in, your own recipe library, public recipe discovery, likes, "I made this" cook logging, a "Most Liked" carousel, a most-prepped podium, user profiles with handles, per-user categories, bilingual Hebrew (RTL) / English UI.
- **Telegram bot** (Java, on a GCP VM): a button-driven wizard to add/edit/delete recipes, list and deep-link recipes, and import a recipe from a URL. Requires linking your web account first.
- **AI import**: paste a recipe URL → a Java service fetches the page and Gemini 2.5 Flash extracts a structured recipe (name, category, description, ingredients, instructions, text direction), preserving the source language.

---

## Architecture

```
┌─────────────────────┐         ┌─────────────────────┐
│   React + Vite      │         │   Telegram Bot      │
│   (Vercel)          │         │   (Java, GCP VM)    │
└─────────┬───────────┘         └──────────┬──────────┘
          │                                │
          │  CRUD goes direct              │  DB access via
          │  to Supabase REST              │  backend
          │                                │
          │   ┌────────────────────────────┘
          ▼   ▼
   ┌──────────────────┐        ┌───────────────────────────┐
   │  Supabase        │        │  Java backend (GCP VM)     │
   │  Postgres + RLS  │◄───────│  Javalin                   │
   │  + Auth (Google) │        │   • /api/recipes/scrape    │
   └──────────────────┘        │   • /api/recipes/{name}/share│
          ▲                    │   • /api/link              │
          │                    │   • /api/account (DELETE)  │
          │                    │  GeminiHandler + UrlFetcher│
   browser also calls          │  TelegramLongPollingBot    │
   Supabase directly           └───────────────────────────┘
```

The web app talks **directly to the Supabase REST API** for most data, with Row-Level Security enforcing access in Postgres. The Java backend handles four things: AI scraping, share-text formatting, Telegram account linking, and account deletion.

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite 7, Tailwind CSS 3, lucide-react, `@supabase/supabase-js` |
| Backend | Java 23, Javalin 6, TelegramBots 6.0.1, Gson, Jsoup, dotenv-java |
| AI | Google Gemini 2.5 Flash (`generateContent`, `response_mime_type: application/json`) |
| Database / Auth | Supabase (Postgres + Auth, Google OAuth) |
| Hosting | GCP VM (backend, systemd service `recipebot`) + Vercel (frontend) |
| CI/CD | GitHub Actions → SCP + SSH to the VM |

---

## Data model

All tables live in Supabase Postgres with RLS enabled.

| Table | Columns (key ones) | Notes |
|---|---|---|
| `recipes` | `id` (uuid), `name`, `category` (text), `description`, `ingredients[]`, `instructions[]`, `user_id`, `visibility`, `created_at` | `category` is a single legacy text column; multi-category lives in `recipe_categories`. |
| `users` | `id` (uuid), `username` (unique handle), `display_name`, `bio`, `avatar_url` | New users get `username = id` until they pick a handle. |
| `categories` | `id` (uuid), `user_id`, `name`, `created_at` | User-defined categories, `unique(user_id, name)`. |
| `recipe_categories` | `recipe_id`, `category_id` | Many-to-many "save to" junction. |
| `recipe_likes` | `user_id`, `recipe_id` | `unique(user_id, recipe_id)`. |
| `cook_logs` | `user_id`, `recipe_id`, `created_at` | One row per "I made this" tap. |
| `telegram_auth` | `telegram_chat_id` → `user_id` | Links a Telegram chat to a user. |
| RPC `get_top_liked_recipes(limit_count)` | returns `recipe_id`, `like_count` | Powers the "Most Liked" carousel. |

### Identity model
- `id` (UUID) — permanent, from Supabase Auth.
- `username` — unique, changeable handle (`a-z0-9_`), used in profile URLs (`/?user=<handle>`).
- `display_name` — non-unique display name, seeded from Google full name.
- `avatar_url` — Google CDN URL, refreshed on every login (not stored as a file).

---

## Backend API surface

The Java backend exposes four routes (`webManager.java`). Recipe create/update/delete happen client-side against Supabase.

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/recipes/scrape` | Body = recipe URL. Fetches page, runs Gemini, returns a `Recipe` JSON. |
| `GET` | `/api/recipes/{name}/share` | Returns a formatted plain-text recipe card for a public recipe. |
| `POST` | `/api/link` | Links a Telegram chat to a Supabase user via a one-time token. |
| `DELETE` | `/api/account` | Deletes all of a user's data and the auth account. |

---

## Authentication

- **Web auth:** Supabase Google OAuth. The browser holds a JWT; writes to Supabase are gated by RLS.
- **Public reads:** done with the Supabase anon key (public recipes, profiles, likes).
- **Telegram auth:** the bot only serves linked chats. An unlinked user receives a link to sign in on the web; the frontend then calls `POST /api/link`, which stores the `telegram_chat_id → user_id` mapping. Link tokens are one-time and short-lived (`LinkTokenStore`).

---

## Environment variables

**Backend `.env`** (never commit):

```env
BOT_TOKEN=               # prod Telegram bot token
TEST_BOT_TOKEN=          # test bot token (used with -debug)
GEMINI_API_KEY=          # Google Gemini API key
SUPABASE_URL=            # https://<project>.supabase.co
SUPABASE_SERVICE_KEY=    # Supabase service key
```

**Frontend** (`web/.env.local` for dev, Vercel project env for prod):

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_URL=            # optional; overrides the /api proxy with an absolute URL
```

---

## Local development

**Prerequisites:** Java 23, Maven, Node 20+, a Supabase project, a Telegram bot token, a Gemini API key.

```bash
git clone https://github.com/TheMprs/RecipeBot.git
cd RecipeBot
```

Create `.env` in the project root (see above), then:

**Backend:**
```bash
mvn clean package -DskipTests
java -jar target/RecipeBot-1.0-SNAPSHOT-jar-with-dependencies.jar          # prod bot
java -jar target/RecipeBot-1.0-SNAPSHOT-jar-with-dependencies.jar -debug    # test bot
```

**Frontend:**
```bash
cd web
npm install
cp .env.local.example .env.local   # then fill in Supabase values
npm run dev
```

The Vite dev server proxies `/api/*` to the backend (see `vite.config.js`). To test the backend locally, point that proxy at `http://localhost:8080`.

---

## CI/CD pipeline

`.github/workflows/deploy.yml` runs on every push to `main`:

1. Build the fat JAR with Maven.
2. SCP the JAR to the VM.
3. SSH in and restart the `recipebot` systemd service.
4. Tail logs as a health check.

---

## Project structure

```
RecipeBot/
├── src/main/java/recipeBot/
│   ├── Main.java              # boots SupabaseHandler + Bot + Javalin
│   ├── Bot.java               # Telegram long-polling bot (wizard, edit/delete, URL import)
│   ├── webManager.java        # the 4 Javalin routes
│   ├── GeminiHandler.java     # Gemini extraction
│   ├── UrlFetcher.java        # URL fetch
│   ├── LinkTokenStore.java    # one-time Telegram link tokens (in-memory)
│   ├── Recipe.java            # domain model
│   ├── State.java             # bot conversation states
│   └── database/
│       └── SupabaseHandler.java  # all Supabase REST calls
├── web/
│   ├── src/
│   │   ├── App.jsx            # root: state, data fetching, routing, home page
│   │   ├── supabaseClient.js
│   │   └── components/        # RecipeCard, RecipeDetail, RecipeForm, UserProfile, Login, ConfirmDialog
│   ├── vercel.json            # /api/* rewrite → backend
│   └── vite.config.js         # dev /api proxy → backend
├── .github/workflows/deploy.yml
└── pom.xml
```

---

## Roadmap

- **Followers / following** — social graph (planned).
- **Recipe sharing to Instagram Stories** — generate a shareable card with a QR code (planned).
- **App.jsx refactor** — split the root component and extract a shared API helper.
- **Automated tests** — backend and frontend.

---

## License

MIT

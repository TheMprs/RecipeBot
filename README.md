# 🍳 Recipe Bot

![Java](https://img.shields.io/badge/Java-17%2B-orange?style=for-the-badge&logo=java)
![Telegram](https://img.shields.io/badge/Telegram-Bot-blue?style=for-the-badge&logo=telegram)
![SQLite](https://img.shields.io/badge/Database-SQLite-lightgrey?style=for-the-badge&logo=sqlite)
![Status](https://img.shields.io/badge/Status-Active-brightgreen?style=for-the-badge)

> **Your personal digital cookbook on Telegram.** > Save, organize, and cook your favorite recipes with an interactive interface.

---

## 📖 About The Project

**Yuval's Recipe Bot** is a Java-based Telegram bot designed to replace your messy notes and bookmarks. It uses a local SQLite database to store your recipes and provides a sleek, button-based interface to interact with them. 

Whether you're looking for that specific pasta sauce or need a checklist while shopping for ingredients, this bot has you covered.

## ✨ Key Features

### 📝 **Easy Recipe Addition**
Stop typing long texts! The bot guides you through a step-by-step wizard to add names, categories, ingredients, and instructions.

### 🗂 **Smart Organization**
Automatically categorizes your food into **Mains**, **Desserts**, **Snacks**, and **Specials**.

### 🔗 **Deep Linking & Navigation**
No more scrolling! The `/list` command generates **clickable hyperlinks** for every recipe. Click a name, and it instantly opens the recipe card.

### ✅ **Interactive Cooking Mode**
The recipe card features an **Ingredient Checklist**.  
* Click an ingredient (e.g., `⬜ Eggs`) to mark it as done (`✅ Eggs`).
* Perfect for shopping or tracking progress while cooking.

### 🗑 **Management**
Made a mistake? Easily delete recipes with a single tap.

---

## 🛠️ Tech Stack

* **Language:** Java 17+
* **Framework:** [TelegramBots](https://github.com/rubenlagus/TelegramBots) (Long Polling)
* **Database:** SQLite (JDBC)
* **Build Tool:** Maven

---

## 🚀 Getting Started

### Prerequisites
* Java JDK 17 or higher
* Maven installed
* A Telegram Bot Token (Get one from [@BotFather](https://t.me/BotFather))

### Installation

1.  **Clone the repo**
    ```sh
    git clone [https://github.com/yourusername/recipe-bot.git](https://github.com/yourusername/recipe-bot.git)
    cd recipe-bot
    ```

2.  **Configure Environment**
    Set up your bot token as an environment variable.
    * **Windows (PowerShell):** `$env:BOT_TOKEN="your_token_here"`
    * **Linux/Mac:** `export BOT_TOKEN="your_token_here"`

3.  **Build the Project**
    ```sh
    mvn clean install
    ```

4.  **Run the Bot**
    ```sh
    java -jar target/recipe-bot-1.0-SNAPSHOT.jar
    ```

---

## 🤖 Usage Guide

| Command | Description |
| :--- | :--- |
| `/start` | Wakes up the bot and shows the welcome message. |
| `/recipe` | Starts the wizard to add a new recipe. |
| `/list` | Shows all saved recipes as clickable links. |

### How to Add a Recipe
1.  Type `/recipe`.
2.  Enter the **Name** (e.g., "Cheesecake").
3.  Select a **Category** from the button menu.
4.  Enter **Ingredients** (separated by commas or new lines).
5.  Enter **Instructions**.
6.  **Done!** It's saved to the database.

---

## 📸 Screenshots

*(Add screenshots of your bot in action here!)*

| **Recipe List** | **Recipe Card & Checklist** |
| :---: | :---: |
| ![List View](https://via.placeholder.com/300x500?text=Recipe+List+View) | ![Card View](https://via.placeholder.com/300x500?text=Recipe+Card+View) |

---

## 🤝 Contributing

Contributions are welcome! If you have ideas for new features (like image support or sharing recipes), feel free to fork the repo and submit a pull request.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

### ❤️ Built with Java & Caffeine

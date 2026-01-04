# 🌳 Arbor UI

**Explore knowledge visually. A free, open-source, and community-driven platform for decentralized learning.**

Arbor is a dynamic knowledge explorer that visualizes learning paths as interactive, growing trees. It's built to be decentralized, allowing anyone to create, share, and merge different knowledge trees.

## ✨ Features

*   **Visual Exploration:** Navigate complex subjects as an intuitive, interactive mind map.
*   **Decentralized Content:** Load knowledge trees from any URL. No central server, no censorship.
*   **Community-Driven:** Anyone can create and share a knowledge tree. See `HOW_TO_WRITE_CONTENT.md`.
*   **Progress Tracking:** Save your learning progress locally or sync it with Google Drive.
*   **Certificates of Completion:** Earn certificates for completing modules and build your open-source learning profile.
*   **Open Source:** Licensed under GPL-3.0 to guarantee it remains free and open forever.

## 🚀 Running Locally

This project is designed to run in a web-based development environment that handles dependencies automatically.

1.  **Google Drive Sync (Optional):** To enable progress synchronization, you need to create Google API credentials:
    *   Go to the [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
    *   Create a new project.
    *   Create an **API Key** and an **OAuth 2.0 Client ID** (for a Web Application).
    *   In `src/services/google-drive-sync.service.ts`, replace `YOUR_CLIENT_ID.apps.googleusercontent.com` with your OAuth Client ID.
    *   The `API_KEY` is expected to be provided as an environment variable (`process.env.API_KEY`). You will need to configure this in your local environment.

2.  **Run the application:** Use the standard commands provided by your development environment, typically `npm install` followed by `npm run dev`.

## 🤝 Contributing

Contributions are welcome! This project is for the community. Whether it's improving the code, fixing bugs, or suggesting new features, your help is appreciated.

Please read `HOW_TO_WRITE_CONTENT.md` to learn how to create your own knowledge trees.

## 📄 License

Arbor is licensed under the **GNU General Public License v3.0**. You are free to use, study, share, and modify this software. Any modifications you distribute must also be licensed under the GPL-3.0.

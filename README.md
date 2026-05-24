# PiecePool

PiecePool is a lightweight local-first desktop workspace for collecting study fragments, turning them into wiki pages, planning study work, and exploring connections.

## Run The Desktop App

Install dependencies once:

```bash
npm install
python3 -m pip install -r requirements.txt
```

Tauri requires Rust/Cargo on the machine. If they are not installed yet:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
```

Start the local desktop app:

```bash
npm run dev
```

This starts the FastAPI local engine and opens PiecePool in a Tauri desktop window. You do not need to open a browser URL.

## Useful Commands

```bash
npm run desktop:dev
npm run backend:dev
npm run build
npm run desktop:build
```

`npm run web:dev` is only a frontend developer fallback. The default app flow is the Tauri desktop shell.

## Current MVP Scope

- Local workspace UI with Inbox, Wiki, Plan, Projects, Graph, Reminder, and AI Engine.
- FastAPI local engine with local JSON persistence, mock workspace data, and mock LLM-Wiki actions.
- Local LLM selected by default.
- GPT and Gemini shown as locked Pro cloud options.
- No login, cloud sync, billing, real AI API calls, or real file parsing yet.

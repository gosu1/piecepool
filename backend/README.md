# PiecePool Local Engine

FastAPI backend for the PiecePool local-first desktop MVP. The user-facing app starts through Tauri; this backend is the local engine behind the desktop workspace.

## Run

Use the root desktop command for normal development:

```bash
npm run dev
```

Run only the local engine when debugging backend endpoints:

```bash
python3 -m pip install -r requirements.txt
python3 -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

## Key endpoints

- `GET /health`
- `GET /fragments`
- `GET /wiki`
- `GET /tasks/today`
- `GET /projects`
- `GET /graph`
- `GET /reminders`
- `GET /settings/llm-providers`
- `POST /settings/llm-provider`
- `POST /llm/wiki/ingest`
- `POST /llm/wiki/lint`
- `POST /llm/wiki/suggest-connections`

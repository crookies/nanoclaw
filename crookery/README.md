# Crookery

Real-time monitoring dashboard for [NanoClaw](../).

Observe agents, sessions, messages, and logs without touching the NanoClaw process. All reads are read-only against the SQLite databases.

## Stack

- **Backend**: FastAPI + WebSocket, reads `data/v2.db` and per-session DBs
- **Frontend**: React 18, Vite, TanStack Query, Zustand, Tailwind v4, Recharts

## Getting started

```bash
# Backend (port 8000)
cd crookery/backend
python -m venv .venv && .venv/bin/pip install -r requirements.txt
PYTHONPATH=. .venv/bin/uvicorn main:app --reload --port 8000

# Frontend (port 5173, proxied to :8000)
cd crookery/frontend
npm install
npm run dev
```

In production, a single FastAPI process serves the Vite build on `:4123`:

```bash
cd crookery/frontend && npm run build
cd crookery/backend && PYTHONPATH=. .venv/bin/uvicorn main:app --host 127.0.0.1 --port 4123
```

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design doc.

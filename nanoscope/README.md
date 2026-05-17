# NanoScope

Real-time monitoring dashboard for [NanoClaw](../).

Observe agents, sessions, messages, and logs without touching the NanoClaw process. All reads are read-only against the SQLite databases.

## Stack

- **Backend**: FastAPI + WebSocket, reads `data/v2.db` and per-session DBs
- **Frontend**: React 18, Vite, TanStack Query, Zustand, Tailwind v4, Recharts

## Getting started

```bash
# Backend (port 8000, dev mode)
cd nanoscope/backend
uv venv .venv && uv pip install -r requirements.txt --python .venv/bin/python
PYTHONPATH=. .venv/bin/uvicorn main:app --reload --port 8000

# Frontend (port 5173, proxied to :8000)
cd nanoscope/frontend
npm install
npm run dev
```

Or via Makefile (from the `nanoscope/` directory):

```bash
make backend    # uvicorn on :8000 with --reload
make frontend   # Vite on :5173
```

## Authentication

NanoScope ships with optional single-user password authentication. If `NANOSCOPE_PASSWORD_HASH` is not set, auth is disabled (useful for local dev).

**Set a password:**

```bash
cd nanoscope && make set-password
# → interactive prompt, writes NANOSCOPE_PASSWORD_HASH to backend/.env
```

The password hash (bcrypt) is stored in `nanoscope/backend/.env`. Restart NanoScope to apply.

## Production

```bash
# 1. Build frontend (once per code change)
cd nanoscope && make build

# 2. Create backend/.env if it doesn't exist
cp backend/.env.example backend/.env
# Edit NANOSCOPE_HOST, NANOSCOPE_PORT, NANOSCOPE_PASSWORD_HASH as needed

# 3. Run (single FastAPI process serving the Vite build)
make prod
```

`NANOSCOPE_HOST` defaults to `0.0.0.0` — accessible from the local network. Set it to `127.0.0.1` to restrict to localhost.

## Systemd service (Linux)

```bash
cd nanoscope

# First-time setup (order matters)
make build           # compile frontend → frontend/dist/
make set-password    # write password hash to backend/.env
make install-service # write unit file + enable
systemctl --user start nanoscope
systemctl --user status nanoscope

# After a code update
make build
systemctl --user restart nanoscope

# Remove
make uninstall-service
```

The unit file is written to `~/.config/systemd/user/nanoscope.service` and reads host/port/password from `backend/.env`.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design doc.

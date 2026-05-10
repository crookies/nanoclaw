# Crookery — Architecture

Real-time monitoring dashboard for NanoClaw. React SPA consuming a FastAPI backend that reads NanoClaw's SQLite databases read-only.

---

## Dev startup

```bash
# Backend (port 8000)
cd crookery/backend
PYTHONPATH=. .venv/bin/uvicorn main:app --reload --port 8000

# Frontend (port 5173, proxy → :8000)
cd crookery/frontend
npm run dev
```

`npm run build` is for production only. In production, a single FastAPI process on `:4123` serves both the API and the Vite build.

```bash
# Production (single process, from crookery/)
make build
make prod   # reads CROOKERY_HOST / CROOKERY_PORT from environment or backend/.env
```

---

## Structure

```
crookery/
├── Makefile                      # backend, frontend, dev, build, prod, set-password, install-service
├── crookery.service.template     # systemd user unit template (paths filled by make install-service)
├── scripts/
│   └── set_password.py           # interactive bcrypt hash writer → backend/.env
├── backend/
│   ├── main.py               # FastAPI app, auth middleware, WebSocket /ws, spa_fallback
│   ├── config.py             # Settings (pydantic-settings): nanoclaw_root, host, port, password_hash
│   ├── auth.py               # In-memory session store: create_session, is_valid_session, verify_password
│   ├── db.py                 # central_db(), session_db(), iter_session_db_paths()
│   ├── routers/
│   │   ├── auth.py           # POST /auth/login  POST /auth/logout  GET /auth/me
│   │   ├── metrics.py        # GET /api/metrics
│   │   ├── agents.py         # GET /api/agents
│   │   ├── messages.py       # GET /api/messages  GET /api/messages/{id}
│   │   └── sessions.py       # GET /api/agents/{ag}/sessions[/{sess}[/queue|delivery|conversation|logs]]
│   └── services/
│       ├── metrics_service.py     # uptime (systemctl), status, total messages
│       ├── agent_service.py       # agents + JOIN sessions + message counts
│       ├── message_service.py     # scan session DBs, merge in/out, pagination, search
│       ├── session_service.py     # session list + detail (heartbeat, container_state, claims)
│       ├── queue_service.py       # messages_in + blockers (pending_approvals/questions)
│       ├── delivery_service.py    # messages_out JOIN delivered (inbound.db)
│       ├── conversation_service.py  # JSONL SDK parsing → typed entries
│       └── logs_service.py        # tail nanoclaw.log, filter by sessionId + level
└── frontend/
    ├── index.html             # inline script: reads localStorage('crookery-theme') before render
    ├── vite.config.ts         # proxy /api, /auth, and /ws → :8000 in dev
    └── src/
        ├── App.tsx            # BrowserRouter + Routes: /login (public) + /* (ProtectedRoute)
        ├── index.css          # oklch CSS vars + Tailwind v4
        ├── store/dashboard.ts # Zustand: metrics, agents, wsConnected, activeAgent
        ├── lib/
        │   ├── utils.ts       # cn()
        │   └── time.ts        # formatRelative, formatDate, formatDateTime
        ├── hooks/
        │   ├── useApi.ts      # TanStack Query: useMetrics, useAgents, useMessages (poll 10s)
        │   │                  #   + useSessions, useSessionDetail, useSessionQueue,
        │   │                  #     useSessionDelivery, useSessionConversation, useSessionLogs
        │   └── useWebSocket.ts # WS connect + exponential reconnect
        ├── components/
        │   ├── ui/            # shadcn-style: Card, Badge, Button, Input, Select, Sheet
        │   ├── ProtectedRoute # calls GET /auth/me on mount + every 5min; redirects to /login on 401
        │   ├── StatusBadge    # colored dot: running/idle/inactive/online/offline
        │   ├── KpiCard        # Card + large value + label
        │   ├── AgentCard      # clickable → navigate /agents/:id  (+ session count badge)
        │   ├── MessageTable   # sortable table + filters + pagination
        │   ├── MessageDetailSheet  # slide-in Sheet with JSON content
        │   ├── LiveStatusStrip     # heartbeat age / tool in flight / processing claims
        │   └── tabs/
        │       ├── ConversationTab  # JSONL feed: tabbed headers, XML parsing, channel icons, ✓/✗
        │       ├── QueueTab         # messages_in + blocker drill-down
        │       ├── TasksTab         # kind=task grouped Upcoming/Active/Failed
        │       ├── DeliveryTab      # messages_out + delivered status
        │       └── LogsTab          # nanoclaw.log stream, filtered by level+search
        └── pages/
            ├── Login.tsx           # password form → POST /auth/login → redirect /
            ├── Dashboard.tsx       # KPI row + agent grid
            ├── Messages.tsx        # MessageTable + Sheet
            ├── AgentSessions.tsx   # session list for an agent group
            └── SessionDetail.tsx   # session detail: fixed header + internal scroll tabs
```

---

## Authentication

### Overview

Single-user password authentication backed by a bcrypt hash. Disabled when `CROOKERY_PASSWORD_HASH` is not set (suitable for local dev).

### Password storage

The bcrypt hash is stored in `backend/.env` under `CROOKERY_PASSWORD_HASH`. Generate it interactively:

```bash
cd crookery && make set-password
```

`scripts/set_password.py` prompts for a password, hashes it with `bcrypt.gensalt()`, and writes (or updates) the `CROOKERY_PASSWORD_HASH` line in `backend/.env`. The server reads this via pydantic-settings at startup.

### Session flow

1. Browser submits password to `POST /auth/login`.
2. Server verifies with `bcrypt.checkpw`; on success, generates a `secrets.token_urlsafe(32)` token and stores it in an in-memory dict.
3. Response sets a `crookery_session` cookie (`HttpOnly`, `SameSite=strict`).
4. All subsequent `/api/*` requests are gated by `_AuthMiddleware` in `main.py`:
   - reads `crookery_session` cookie
   - returns `401` if token not in the session store
5. WebSocket `/ws` checks the cookie before `accept()`; closes with code `4401` if invalid.
6. `POST /auth/logout` removes the token from the store and clears the cookie.

### Session store

In-memory dict (`auth.py:_active_sessions`) — sessions are lost on restart. This is intentional: no persistence complexity, and the user just logs in again.

### Frontend auth guard

`ProtectedRoute` wraps all routes except `/login`. On mount it calls `GET /auth/me` via TanStack Query (`staleTime: 60s`, `refetchInterval: 5min`). A `401` response redirects to `/login`. A logout button in the sidebar calls `POST /auth/logout` and navigates to `/login`.

---

## NanoClaw data access

### Paths (from `config.py`)

| Variable | Resolved value |
|----------|----------------|
| `settings.nanoclaw_root` | `/home/crooks/nanoclaw` (auto-detected: parent of `crookery/`) |
| `settings.central_db_path` | `data/v2.db` |
| `settings.sessions_dir` | `data/v2-sessions/` |
| `settings.logs_dir` | `logs/` |

### SQLite open (always read-only)

```python
conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
conn.execute("PRAGMA busy_timeout = 2000")
```

`nolock=1` does not work on Linux — do not use it. `mode=ro` alone is sufficient.

### Session DB structure

```
data/v2-sessions/
  ag-<id>/
    .claude-shared/
      projects/-workspace-agent/
        <sdk_session_id>.jsonl   # SDK transcript (one per Claude conversation)
    sess-<id>/
      inbound.db     # messages_in, delivered (host writes, container reads)
      outbound.db    # messages_out, processing_ack, container_state, session_state
      .heartbeat     # touched by the container every ~30s
```

`iter_session_db_paths()` in `db.py` yields `(ag_id, sess_id, inbound_path, outbound_path)`.

### SDK session ID

The JSONL filename is the SDK session ID. It is stored in `outbound.db:session_state` under key `continuation:claude` (legacy: `sdk_session_id`). If `outbound.db` does not exist yet, there is no transcript.

### Key tables

**Central DB (`v2.db`)**
- `agent_groups`: `id, name, folder, agent_provider, created_at`
- `sessions`: `id, agent_group_id, messaging_group_id, status, container_status, last_active`
- `messaging_groups`: `id, channel_type, platform_id, name`
- `messaging_group_agents`: `messaging_group_id, agent_group_id, session_mode, ...`
- `pending_approvals`: actions blocked pending human approval
- `pending_questions`: questions asked by the agent awaiting a reply

**Inbound DB (`messages_in`)**
- `id, seq (EVEN), kind, timestamp, status, platform_id, channel_type, thread_id, content (JSON), tries, series_id, process_after, recurrence`
- `status`: `pending | processing | completed | failed`
- `delivered`: `message_out_id, platform_message_id, status, delivered_at` (host-side delivery tracking)

**Outbound DB (`messages_out`)**
- `id, seq (ODD), in_reply_to, timestamp, kind, platform_id, channel_type, thread_id, content (JSON)`
- `processing_ack`: `message_id, status, status_changed` (active processing claims)
- `container_state`: singleton — `current_tool, tool_declared_timeout_ms, tool_started_at`
- `session_state`: KV store — key `continuation:claude` = current SDK session ID

---

## Backend API

| Endpoint | Source | Notes |
|----------|--------|-------|
| `POST /auth/login` | `auth.py` | body: `{password}`, sets `crookery_session` cookie |
| `POST /auth/logout` | `auth.py` | revokes session, clears cookie |
| `GET /auth/me` | `auth.py` | 200 if authenticated (or auth disabled), 401 otherwise |
| `GET /api/metrics` | systemctl + v2.db + scan inbound DBs | status: online/warning/offline |
| `GET /api/agents` | v2.db JOIN sessions + scan session DBs | messages_in + messages_out per agent |
| `GET /api/messages` | scan all session DBs | params: agent, direction (in/out/all), search, page, limit |
| `GET /api/messages/{id}` | scan session DBs by id | returns parsed JSON content |
| `WS /ws` | metrics every 10s | payload: `{type: "metrics", data: {...}}`; closes 4401 if not authenticated |
| `GET /api/agents/{ag}/sessions` | v2.db JOIN messaging_groups + scan inbound DBs | queue counts + blockers per session |
| `GET /api/agents/{ag}/sessions/{sess}` | v2.db + .heartbeat + outbound.db | header + liveness (heartbeat, container_state, processing_ack) |
| `GET /api/agents/{ag}/sessions/{sess}/queue` | inbound.db + v2.db | messages_in + blockers (approvals, questions) |
| `GET /api/agents/{ag}/sessions/{sess}/delivery` | outbound.db + inbound.db:delivered | messages_out enriched with delivery status |
| `GET /api/agents/{ag}/sessions/{sess}/conversation` | outbound.db:session_state + .jsonl | parsed transcript: user/assistant/tool_use/tool_result |
| `GET /api/agents/{ag}/sessions/{sess}/logs` | logs/nanoclaw.log | tail + grep sessionId + level/search filter |

---

## Frontend routing

```
/login                          → Login (password form — public, no auth required)
/                               → Dashboard (KPIs + agent cards)
/messages                       → Communications (MessageTable + Sheet)
/agents/:agentId                → AgentSessions (session list)
/agents/:agentId/sessions/:sessionId → SessionDetail (header + live strip + 5 tabs)
```

All routes except `/login` are wrapped in `ProtectedRoute`. Clicking an AgentCard navigates to `/agents/:agentId`.

---

## Frontend state

### Zustand (`store/dashboard.ts`)

```ts
{ metrics, agents, wsConnected, activeAgent }
```

- `activeAgent`: kept for manual filtering in the Messages page
- `metrics` / `agents`: updated by WS (every 10s) AND by TanStack Query (30s / 15s)

### Data flow

```
WS /ws ──→ useWebSocket ──→ store.setMetrics
REST    ──→ TanStack Query ──→ store.setAgents / return data
AgentCard click ──→ navigate("/agents/:id")
AgentSessions ──→ useSessions(agentId) ──→ GET /api/agents/{ag}/sessions  (poll 10s)
SessionDetail ──→ useSessionDetail      ──→ GET /api/agents/{ag}/sessions/{sess}  (poll 5s if active)
              ──→ useSessionConversation ──→ /conversation   (poll 5s if active)
              ──→ useSessionQueue        ──→ /queue          (poll 5s if active)
              ──→ useSessionDelivery     ──→ /delivery       (poll 5s if active)
              ──→ useSessionLogs         ──→ /logs           (poll 5s if active)
```

Inactive polling (container stopped): `refetchInterval: false` — data loaded once when the tab opens.

### JSONL parsing (`conversation_service.py`)

SDK entries included:
- `type: "user"` → human message (string) or tool_results (array of `type: "tool_result"` blocks)
- `type: "assistant"` → content blocks `text` and `tool_use` (`thinking` blocks are ignored)

`tool_result` entries are indexed by `tool_use_id` and attached to their corresponding `tool_use` before sending to the frontend. The frontend receives `assistant` entries with `tool_uses[].result` already populated.

---

## Design / colors

Tailwind v4 with oklch CSS variables defined in `src/index.css`.
Dark mode by default, Sun/Moon toggle in the sidebar; preference persisted in `localStorage('crookery-theme')` and applied by an inline script in `index.html` before React renders (prevents flash).

Semantic color mapping:
- `--secondary` (cyan) → active / online / tool name
- `--accent` (orange) → outbound messages / warning
- `--destructive` (red) → error / offline / failed
- `--muted-foreground` → inactive / secondary text
- `text-yellow-400` → warnings (stale heartbeat, old claims, blockers)
- `text-green-400` → success (delivered, completed)

`ui/` components are hand-written (no shadcn CLI install), compatible with Tailwind v4.

---

## ConversationTab — entry format

All entry types have a **pipe-separated tabbed header** (`| type | time | … |`).

**XML messages** (type `"user"` with `<message>` wrapping):
```
| Msg | 14:14 Brussels | #6 | ✈ telegram ← Crookies |
```
- Parsed by regex from `<context timezone>` + `<message id from from-channel from-type sender time>`
- Channel icon derived from the `from-channel` attribute (added by the container's `formatter.ts`)
  or by heuristic on the `from` value (fallback for sessions created before this attribute was added)
- Timezone shown in `text-[9px] opacity-40` (very subtle)

**Icon mapping**: `telegram→✈`, `discord→#`, `slack→◈`, `gmail/email→✉`, `agent→(none)`

**Other entry types**:
| Condition | Label |
|-----------|-------|
| `user` + XML `<message>` | `Msg` |
| `user` + plain text | `User` |
| `assistant` + text (with or without tools) | `Reply` |
| `assistant` + tools only | `Tool` |

Tool calls: `✓`/`✗`/`…` badge immediately after the tool name (green/red/gray).

---

## SessionDetail — scroll layout

`SessionDetail` uses `flex flex-col h-full` to fill exactly the visible area of `<main>`:
- **Fixed header** (`shrink-0`): breadcrumb + inactive banner + session card + heartbeat strip
- **Tab bar** (`shrink-0`): always visible, no need for `sticky`
- **Content** (`flex-1 overflow-y-auto min-h-0`): internal scroll only

Other pages (Dashboard, Messages, AgentSessions) continue scrolling via `<main overflow-y-auto>`.

---

## Production serving (SPA fallback)

`main.py` uses an explicit catch-all route rather than `StaticFiles(html=True)` (unreliable for SPA paths):

```python
@app.get("/{full_path:path}")
async def spa_fallback(full_path: str):
    candidate = _frontend_dist / full_path
    if candidate.is_file():
        return FileResponse(str(candidate))
    return FileResponse(str(_frontend_dist / "index.html"))
```

Vite assets (`/assets/*.js`, `favicon.ico`, etc.) are served directly if the file exists; otherwise `index.html` (SPA routing). The auth middleware intentionally does not gate static assets — the frontend handles the redirect to `/login`.

---

## Systemd service

The `crookery.service.template` is a user-unit template with two placeholders (`CROOKERY_BACKEND_DIR`, `CROOKERY_UVICORN`) filled at install time by `make install-service`:

```bash
make install-service   # writes ~/.config/systemd/user/crookery.service, enables unit
systemctl --user start crookery
make uninstall-service # disables and removes the unit
```

`EnvironmentFile=-CROOKERY_BACKEND_DIR/.env` means the file is optional — if absent, uvicorn uses the defaults from `config.py` (`host: 127.0.0.1`, `port: 4123`). Set `CROOKERY_HOST=0.0.0.0` in `.env` to bind on all interfaces for LAN/VPN access.

---

## Container — XML enrichment (`formatter.ts`)

The agent-runner's `formatter.ts` adds two optional attributes to `<message>` tags:
- `from-channel`: channel type (`"telegram"`, `"discord"`, `"slack"`, …) — present when the origin is a channel
- `from-type`: `"channel"` or `"agent"` — always present when `from` is resolved

This lets the dashboard display channel icons without extra API requests. Sessions created before this addition lack these attributes; the frontend uses a `from`-based heuristic as fallback.

---

## Phase 2 — planned features (not yet implemented)

- Token monitoring: Recharts graphs (AreaChart) from `.claude-shared/projects/*.jsonl`
- Live logs: SSE or WS stream from `logs/nanoclaw.log`
- System control: restart agent
- Agent config: CLAUDE.md editing via form

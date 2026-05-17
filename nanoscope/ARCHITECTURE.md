# NanoScope — Architecture

Real-time monitoring dashboard for NanoClaw. React SPA consuming a FastAPI backend that reads NanoClaw's SQLite databases read-only.

---

## Dev startup

```bash
# Backend (port 8000)
cd nanoscope/backend
PYTHONPATH=. .venv/bin/uvicorn main:app --reload --port 8000

# Frontend (port 5173, proxy → :8000)
cd nanoscope/frontend
npm run dev
```

`npm run build` is for production only. In production, a single FastAPI process on `:4123` serves both the API and the Vite build.

```bash
# Production (single process, from nanoscope/)
make build
make prod   # reads NANOSCOPE_HOST / NANOSCOPE_PORT from environment or backend/.env
```

---

## Structure

```
nanoscope/
├── Makefile                      # backend, frontend, dev, build, prod, set-password, install-service
├── nanoscope.service.template     # systemd user unit template (paths filled by make install-service)
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
│       ├── logs_service.py        # tail nanoclaw.log, filter by sessionId + level
│       └── session_watcher.py     # get_session_file_mtimes: ag-*/sess-*/{inbound,outbound}.db + .heartbeat → "invalidate" WS events
│                                  # get_jsonl_mtimes: ag-*/.claude-shared/**/*.jsonl → "invalidate-conversation" WS events
└── frontend/
    ├── index.html             # inline script: reads localStorage('nanoscope-theme') before render
    ├── vite.config.ts         # proxy /api, /auth, and /ws → :8000 in dev
    └── src/
        ├── App.tsx            # BrowserRouter + Routes: /login (public) + /* (ProtectedRoute)
        ├── index.css          # oklch CSS vars + Tailwind v4
        ├── store/dashboard.ts # Zustand: metrics, agents, wsConnected, activeAgent
        ├── lib/
        │   ├── utils.ts       # cn()
        │   └── time.ts        # formatRelative, formatDate, formatDateTime
        ├── hooks/
        │   ├── useApi.ts      # TanStack Query hooks; WS invalidations are primary update path,
        │   │                  #   polling is fallback (60 s global / 30 s session, foreground only)
        │   └── useWebSocket.ts # WS connect + exponential reconnect; handles "metrics",
        │                       #   "invalidate", "invalidate-conversation"; calls queryClient.invalidateQueries
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
                                    #   safety net: refetches conversation+delivery when isActive true→false
```

---

## Authentication

### Overview

Single-user password authentication backed by a bcrypt hash. Disabled when `NANOSCOPE_PASSWORD_HASH` is not set (suitable for local dev).

### Password storage

The bcrypt hash is stored in `backend/.env` under `NANOSCOPE_PASSWORD_HASH`. Generate it interactively:

```bash
cd nanoscope && make set-password
```

`scripts/set_password.py` prompts for a password, hashes it with `bcrypt.gensalt()`, and writes (or updates) the `NANOSCOPE_PASSWORD_HASH` line in `backend/.env`. The server reads this via pydantic-settings at startup.

### Session flow

1. Browser submits password to `POST /auth/login`.
2. Server verifies with `bcrypt.checkpw`; on success, generates a signed HMAC token (`user:<ts>:<sha256-sig>`).
3. Response sets a `nanoscope_session` cookie (`HttpOnly`, `SameSite=strict`).
4. All subsequent `/api/*` requests are gated by `_AuthMiddleware` in `main.py`:
   - reads `nanoscope_session` cookie
   - validates HMAC signature and 30-day expiry; returns `401` on failure
5. WebSocket `/ws` checks the cookie before `accept()`; closes with code `4401` if invalid.
6. `POST /auth/logout` clears the cookie client-side (token is stateless — no server-side revocation needed).

### Session tokens

Stateless HMAC tokens (`auth.py`). Format: `user:<unix_ts>:<hmac-sha256>`.

- **Secret**: SHA-256 of `NANOSCOPE_PASSWORD_HASH` — stable across restarts, automatically invalidated if the password changes.
- **Expiry**: 30 days, verified on every request.
- **Logout**: clears the cookie client-side; no server store to update.
- **No persistence needed**: tokens survive service restarts without any storage.

### Frontend auth guard

`ProtectedRoute` wraps all routes except `/login`. On mount it calls `GET /auth/me` via TanStack Query (`staleTime: 60s`, `refetchInterval: 5min`). A `401` response redirects to `/login`. A logout button in the sidebar calls `POST /auth/logout` and navigates to `/login`.

---

## NanoClaw data access

### Paths (from `config.py`)

| Variable | Resolved value |
|----------|----------------|
| `settings.nanoclaw_root` | `/home/crooks/nanoclaw` (auto-detected: parent of `nanoscope/`) |
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
| `POST /auth/login` | `auth.py` | body: `{password}`, sets `nanoscope_session` cookie |
| `POST /auth/logout` | `auth.py` | revokes session, clears cookie |
| `GET /auth/me` | `auth.py` | 200 if authenticated (or auth disabled), 401 otherwise |
| `GET /api/metrics` | systemctl + v2.db + scan inbound DBs | status: online/warning/offline |
| `GET /api/agents` | v2.db JOIN sessions + scan session DBs | messages_in + messages_out per agent |
| `GET /api/messages` | scan all session DBs | params: agent, direction (in/out/all), search, page, limit |
| `GET /api/messages/{id}` | scan session DBs by id | returns parsed JSON content |
| `WS /ws` | metrics + session invalidations | tick 2 s: emits `{type: "invalidate", agentId, sessionId}` on `inbound/outbound.db`+`.heartbeat` mtime change; emits `{type: "invalidate-conversation", agentId}` on `.jsonl` mtime change; tick 10 s: emits `{type: "metrics", data: {...}}`; closes 4401 if not authenticated |
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
- `metrics` / `agents`: `metrics` updated by WS push (every 10 s); `agents` invalidated by WS on session file change

### Data flow

```
WS /ws ──→ useWebSocket ──┬─→ store.setMetrics                   (type: "metrics", every 10 s)
                          ├─→ queryClient.invalidate              (type: "invalidate", on DB/heartbeat mtime change)
                          │    ├─ ["agents"]
                          │    ├─ ["messages"]
                          │    ├─ ["sessions", agentId]
                          │    ├─ ["session-detail", agentId, sessionId]
                          │    ├─ ["session-queue", agentId, sessionId]
                          │    ├─ ["session-delivery", agentId, sessionId]
                          │    ├─ ["session-conversation", agentId, sessionId]
                          │    └─ ["session-logs", agentId, sessionId]
                          └─→ queryClient.invalidate              (type: "invalidate-conversation", on .jsonl mtime change)
                               └─ ["session-conversation", agentId]  ← partial key, all sessions of this agent

REST (fallback polling — WS down or background tab suppressed):
  useMetrics        ──→ GET /api/metrics                   (60 s, foreground only)
  useAgents         ──→ GET /api/agents                    (60 s, foreground only)
  useMessages       ──→ GET /api/messages                  (60 s, foreground only)
  useSessions       ──→ GET /api/agents/{ag}/sessions      (60 s, foreground only)
  useSessionDetail  ──→ GET /api/agents/{ag}/sessions/{s}  (30 s if active, foreground only)
  + 4 session tabs  ──→ /queue /delivery /conversation /logs (30 s if active, foreground only)
```

All polling hooks use `refetchIntervalInBackground: false` — polling stops when the browser tab is hidden. Inactive sessions (`isActive = false`): `refetchInterval: false` — data loaded once on tab open. When `isActive` transitions `true → false` (container just stopped), `SessionDetail` triggers a final forced refetch of conversation + delivery as a safety net.

### JSONL parsing (`conversation_service.py`)

SDK entries included:
- `type: "user"` → human message (string) or tool_results (array of `type: "tool_result"` blocks)
- `type: "assistant"` → content blocks `text` and `tool_use` (`thinking` blocks are ignored)

`tool_result` entries are indexed by `tool_use_id` and attached to their corresponding `tool_use` before sending to the frontend. The frontend receives `assistant` entries with `tool_uses[].result` already populated.

---

## Design / colors

Tailwind v4 with oklch CSS variables defined in `src/index.css`.
Dark mode by default, Sun/Moon toggle in the sidebar; preference persisted in `localStorage('nanoscope-theme')` and applied by an inline script in `index.html` before React renders (prevents flash).

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

The `nanoscope.service.template` is a user-unit template with two placeholders (`NANOSCOPE_BACKEND_DIR`, `NANOSCOPE_UVICORN`) filled at install time by `make install-service`:

```bash
make install-service   # writes ~/.config/systemd/user/nanoscope.service, enables unit
systemctl --user start nanoscope
make uninstall-service # disables and removes the unit
```

`EnvironmentFile=-NANOSCOPE_BACKEND_DIR/.env` means the file is optional — if absent, uvicorn uses the defaults from `config.py` (`host: 127.0.0.1`, `port: 4123`). Set `NANOSCOPE_HOST=0.0.0.0` in `.env` to bind on all interfaces for LAN/VPN access.

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

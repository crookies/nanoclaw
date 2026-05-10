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

`npm run build` is for production only. In production, FastAPI serves the Vite build on `:4123`.

```bash
# Production (single process)
cd crookery/backend
PYTHONPATH=. .venv/bin/uvicorn main:app --host 127.0.0.1 --port 4123
```

---

## Structure

```
crookery/
├── backend/
│   ├── main.py               # FastAPI app, WebSocket /ws, spa_fallback catch-all for prod
│   ├── config.py             # Settings (pydantic-settings): nanoclaw_root auto-detected
│   ├── db.py                 # central_db(), session_db(), iter_session_db_paths()
│   ├── routers/
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
    ├── vite.config.ts         # proxy /api and /ws → :8000 in dev
    └── src/
        ├── App.tsx            # BrowserRouter + sidebar layout + Routes + dark/light toggle
        ├── index.css          # oklch CSS vars (from spec/index.css) + Tailwind v4
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
        │   ├── StatusBadge    # colored dot: running/idle/inactive/online/offline
        │   ├── KpiCard        # Card + large value + label
        │   ├── AgentCard      # clickable → navigate /agents/:id  (+ session count badge)
        │   ├── MessageTable   # sortable table + filters + pagination
        │   ├── MessageDetailSheet  # slide-in Sheet with JSON content
        │   ├── LiveStatusStrip     # heartbeat age / tool in flight / processing claims
        │   └── tabs/
        │       ├── ConversationTab  # JSONL feed: tabbed headers for all entry types,
        │       │                    #   XML <message> parsing, channel icons, ✓/✗ tool calls
        │       ├── QueueTab         # messages_in + blocker drill-down
        │       ├── TasksTab         # kind=task grouped Upcoming/Active/Failed
        │       ├── DeliveryTab      # messages_out + delivered status
        │       └── LogsTab          # nanoclaw.log stream, filtered by level+search
        └── pages/
            ├── Dashboard.tsx       # KPI row + agent grid
            ├── Messages.tsx        # MessageTable + Sheet
            ├── AgentSessions.tsx   # session list for an agent group
            └── SessionDetail.tsx   # session detail: fixed header + internal scroll tabs
```

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
| `GET /api/metrics` | systemctl + v2.db + scan inbound DBs | status: online/warning/offline |
| `GET /api/agents` | v2.db JOIN sessions + scan session DBs | messages_in + messages_out per agent |
| `GET /api/messages` | scan all session DBs | params: agent, direction (in/out/all), search, page, limit |
| `GET /api/messages/{id}` | scan session DBs by id | returns parsed JSON content |
| `WS /ws` | metrics every 10s | payload: `{type: "metrics", data: {...}}` |
| `GET /api/agents/{ag}/sessions` | v2.db JOIN messaging_groups + scan inbound DBs | queue counts + blockers per session |
| `GET /api/agents/{ag}/sessions/{sess}` | v2.db + .heartbeat + outbound.db | header + liveness (heartbeat, container_state, processing_ack) |
| `GET /api/agents/{ag}/sessions/{sess}/queue` | inbound.db + v2.db | messages_in + blockers (approvals, questions) |
| `GET /api/agents/{ag}/sessions/{sess}/delivery` | outbound.db + inbound.db:delivered | messages_out enriched with delivery status |
| `GET /api/agents/{ag}/sessions/{sess}/conversation` | outbound.db:session_state + .jsonl | parsed transcript: user/assistant/tool_use/tool_result |
| `GET /api/agents/{ag}/sessions/{sess}/logs` | logs/nanoclaw.log | tail + grep sessionId + level/search filter, params: level, search, limit |

---

## Frontend routing

```
/                               → Dashboard (KPIs + agent cards)
/messages                       → Communications (MessageTable + Sheet)
/agents/:agentId                → AgentSessions (session list)
/agents/:agentId/sessions/:sessionId → SessionDetail (header + live strip + 5 tabs)
```

Clicking an AgentCard navigates to `/agents/:agentId`.

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

Tailwind v4 with oklch CSS variables defined in `src/index.css` (copied from `spec/index.css`).
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

`main.py` no longer uses `StaticFiles(html=True)` mounted at `/` (unreliable behavior for SPA paths). Instead, an explicit catch-all route:

```python
@app.get("/{full_path:path}")
async def spa_fallback(full_path: str):
    candidate = _frontend_dist / full_path
    if candidate.is_file():
        return FileResponse(str(candidate))
    return FileResponse(str(_frontend_dist / "index.html"))
```

Vite assets (`/assets/*.js`, `favicon.ico`, etc.) are served directly if the file exists; otherwise `index.html` (SPA routing).

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
- System control: restart agent (requires auth)
- Agent config: CLAUDE.md editing via form

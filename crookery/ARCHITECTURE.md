# Crookery — Architecture

Dashboard de monitoring pour NanoClaw. SPA React consommant une API FastAPI qui lit directement les SQLite de NanoClaw en lecture seule.

---

## Démarrage dev

```bash
# Backend (port 8000)
cd crookery/backend
PYTHONPATH=. .venv/bin/uvicorn main:app --reload --port 8000

# Frontend (port 5173, proxy → :8000)
cd crookery/frontend
npm run dev
```

`npm run build` seulement pour la prod. En prod, FastAPI sert le build Vite sur `:4123`.

```bash
# Prod (un seul processus)
cd crookery/backend
PYTHONPATH=. .venv/bin/uvicorn main:app --host 127.0.0.1 --port 4123
```

---

## Structure

```
crookery/
├── backend/
│   ├── main.py               # app FastAPI, WebSocket /ws, spa_fallback catch-all prod
│   ├── config.py             # Settings (pydantic-settings) : nanoclaw_root auto-détecté
│   ├── db.py                 # central_db(), session_db(), iter_session_db_paths()
│   ├── routers/
│   │   ├── metrics.py        # GET /api/metrics
│   │   ├── agents.py         # GET /api/agents
│   │   ├── messages.py       # GET /api/messages  GET /api/messages/{id}
│   │   └── sessions.py       # GET /api/agents/{ag}/sessions[/{sess}[/queue|delivery|conversation|logs]]
│   └── services/
│       ├── metrics_service.py     # uptime (systemctl), statut, total messages
│       ├── agent_service.py       # agents + JOIN sessions + compteurs messages
│       ├── message_service.py     # scan session DBs, merge in/out, pagination, search
│       ├── session_service.py     # liste sessions + détail (heartbeat, container_state, claims)
│       ├── queue_service.py       # messages_in + blockages (pending_approvals/questions)
│       ├── delivery_service.py    # messages_out JOIN delivered (inbound.db)
│       ├── conversation_service.py  # parsing JSONL SDK → entries typées
│       └── logs_service.py        # tail nanoclaw.log, filtre par sessionId + level
└── frontend/
    ├── index.html             # script inline : lit localStorage('crookery-theme') avant rendu
    ├── vite.config.ts         # proxy /api et /ws → :8000 en dev
    └── src/
        ├── App.tsx            # BrowserRouter + sidebar layout + Routes + toggle dark/light
        ├── index.css          # CSS vars oklch (depuis spec/index.css) + Tailwind v4
        ├── store/dashboard.ts # Zustand : metrics, agents, wsConnected, activeAgent
        ├── lib/
        │   ├── utils.ts       # cn()
        │   └── time.ts        # formatRelative, formatDate, formatDateTime
        ├── hooks/
        │   ├── useApi.ts      # TanStack Query : useMetrics, useAgents, useMessages (poll 10s)
        │   │                  #   + useSessions, useSessionDetail, useSessionQueue,
        │   │                  #     useSessionDelivery, useSessionConversation, useSessionLogs
        │   └── useWebSocket.ts # WS connect + reconnect exponentiel
        ├── components/
        │   ├── ui/            # shadcn-style : Card, Badge, Button, Input, Select, Sheet
        │   ├── StatusBadge    # dot coloré : running/idle/inactive/online/offline
        │   ├── KpiCard        # Card + grande valeur + label
        │   ├── AgentCard      # cliquable → navigate /agents/:id  (+ session count badge)
        │   ├── MessageTable   # table triable + filtres + pagination
        │   ├── MessageDetailSheet  # Sheet slide-in avec JSON content
        │   ├── LiveStatusStrip     # heartbeat age / tool in flight / processing claims
        │   └── tabs/
        │       ├── ConversationTab  # feed JSONL : headers tabulés pour tous les types,
        │       │                    #   parsing XML <message>, icônes canal, ✓/✗ tool calls
        │       ├── QueueTab         # messages_in + blockages drill-down
        │       ├── TasksTab         # kind=task groupés Upcoming/Active/Failed
        │       ├── DeliveryTab      # messages_out + delivered status
        │       └── LogsTab          # stream nanoclaw.log filtré, filtre level+search
        └── pages/
            ├── Dashboard.tsx       # KPI row + grille agents
            ├── Messages.tsx        # MessageTable + Sheet
            ├── AgentSessions.tsx   # liste des sessions d'un agent group
            └── SessionDetail.tsx   # détail session : header fixe + scroll interne tabs
```

---

## Accès aux données NanoClaw

### Chemins (depuis `config.py`)

| Variable | Valeur résolue |
|----------|---------------|
| `settings.nanoclaw_root` | `/home/crooks/nanoclaw` (auto-détecté : parent de `crookery/`) |
| `settings.central_db_path` | `data/v2.db` |
| `settings.sessions_dir` | `data/v2-sessions/` |
| `settings.logs_dir` | `logs/` |

### Ouverture SQLite (toujours readonly)

```python
conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
conn.execute("PRAGMA busy_timeout = 2000")
```

`nolock=1` ne fonctionne pas sur Linux — ne pas l'utiliser. `mode=ro` seul suffit.

### Structure session DBs

```
data/v2-sessions/
  ag-<id>/
    .claude-shared/
      projects/-workspace-agent/
        <sdk_session_id>.jsonl   # transcript SDK (un par conversation Claude)
    sess-<id>/
      inbound.db     # messages_in, delivered (host écrit, container lit)
      outbound.db    # messages_out, processing_ack, container_state, session_state
      .heartbeat     # touché par le container toutes les ~30s
```

`iter_session_db_paths()` dans `db.py` yield `(ag_id, sess_id, inbound_path, outbound_path)`.

### SDK session ID

Le filename du JSONL est l'ID de session SDK. Il est stocké dans `outbound.db:session_state` sous la clé `continuation:claude` (legacy : `sdk_session_id`). Si `outbound.db` n'existe pas encore, pas de transcript.

### Tables clés

**Central DB (`v2.db`)**
- `agent_groups` : `id, name, folder, agent_provider, created_at`
- `sessions` : `id, agent_group_id, messaging_group_id, status, container_status, last_active`
- `messaging_groups` : `id, channel_type, platform_id, name`
- `messaging_group_agents` : `messaging_group_id, agent_group_id, session_mode, ...`
- `pending_approvals` : blockages d'actions nécessitant approbation humaine
- `pending_questions` : questions posées par l'agent en attente de réponse

**Inbound DB (`messages_in`)**
- `id, seq (PAIR), kind, timestamp, status, platform_id, channel_type, thread_id, content (JSON), tries, series_id, process_after, recurrence`
- `status` : `pending | processing | completed | failed`
- `delivered` : `message_out_id, platform_message_id, status, delivered_at` (delivery tracking host-side)

**Outbound DB (`messages_out`)**
- `id, seq (IMPAIR), in_reply_to, timestamp, kind, platform_id, channel_type, thread_id, content (JSON)`
- `processing_ack` : `message_id, status, status_changed` (claims de traitement actif)
- `container_state` : singleton — `current_tool, tool_declared_timeout_ms, tool_started_at`
- `session_state` : KV store — clé `continuation:claude` = SDK session ID courant

---

## API backend

| Endpoint | Source | Notes |
|----------|--------|-------|
| `GET /api/metrics` | systemctl + v2.db + scan inbound DBs | status: online/warning/offline |
| `GET /api/agents` | v2.db JOIN sessions + scan session DBs | messages_in + messages_out par agent |
| `GET /api/messages` | scan tous les session DBs | params: agent, direction (in/out/all), search, page, limit |
| `GET /api/messages/{id}` | scan session DBs par id | retourne content JSON parsé |
| `WS /ws` | metrics toutes les 10s | payload: `{type: "metrics", data: {...}}` |
| `GET /api/agents/{ag}/sessions` | v2.db JOIN messaging_groups + scan inbound DBs | queue counts + blockages par session |
| `GET /api/agents/{ag}/sessions/{sess}` | v2.db + .heartbeat + outbound.db | header + liveness (heartbeat, container_state, processing_ack) |
| `GET /api/agents/{ag}/sessions/{sess}/queue` | inbound.db + v2.db | messages_in + blockages (approvals, questions) |
| `GET /api/agents/{ag}/sessions/{sess}/delivery` | outbound.db + inbound.db:delivered | messages_out enrichis du statut de livraison |
| `GET /api/agents/{ag}/sessions/{sess}/conversation` | outbound.db:session_state + .jsonl | transcript parsé : user/assistant/tool_use/tool_result |
| `GET /api/agents/{ag}/sessions/{sess}/logs` | logs/nanoclaw.log | tail + grep sessionId + filtre level/search, params: level, search, limit |

---

## Routing frontend

```
/                               → Dashboard (KPI + agent cards)
/messages                       → Communications (MessageTable + Sheet)
/agents/:agentId                → AgentSessions (liste des sessions)
/agents/:agentId/sessions/:sessionId → SessionDetail (header + live strip + 5 tabs)
```

Clic sur AgentCard → `/agents/:agentId`.

---

## État frontend

### Zustand (`store/dashboard.ts`)

```ts
{ metrics, agents, wsConnected, activeAgent }
```

- `activeAgent` : conservé pour filtrage manuel dans Messages page
- `metrics` / `agents` : mis à jour par WS (toutes les 10s) ET par TanStack Query (30s / 15s)

### Flux données

```
WS /ws ──→ useWebSocket ──→ store.setMetrics
REST    ──→ TanStack Query ──→ store.setAgents / return data
AgentCard clic ──→ navigate("/agents/:id")
AgentSessions ──→ useSessions(agentId) ──→ GET /api/agents/{ag}/sessions  (poll 10s)
SessionDetail ──→ useSessionDetail      ──→ GET /api/agents/{ag}/sessions/{sess}  (poll 5s si actif)
              ──→ useSessionConversation ──→ /conversation   (poll 5s si actif)
              ──→ useSessionQueue        ──→ /queue          (poll 5s si actif)
              ──→ useSessionDelivery     ──→ /delivery       (poll 5s si actif)
              ──→ useSessionLogs         ──→ /logs           (poll 5s si actif)
```

Polling inactif (container stopped) : `refetchInterval: false` — données chargées une seule fois à l'ouverture du tab.

### Parsing JSONL (conversation_service.py)

Entrées SDK retenues :
- `type: "user"` → message humain (string) ou tool_results (array de blocks `type: "tool_result"`)
- `type: "assistant"` → content blocks `text` et `tool_use` (les blocks `thinking` sont ignorés)

Les tool_results sont indexés par `tool_use_id` et rattachés à leur `tool_use` correspondant avant envoi au frontend. Le frontend reçoit donc des entrées `assistant` avec `tool_uses[].result` déjà peuplé.

---

## Design / couleurs

Tailwind v4 avec variables CSS oklch définies dans `src/index.css` (copié de `spec/index.css`).
Dark mode par défaut, toggle Sun/Moon dans la sidebar ; préférence persistée dans `localStorage('crookery-theme')` et appliquée par un script inline dans `index.html` avant le rendu React (évite le flash).

Mapping sémantique :
- `--secondary` (cyan) → actif / en ligne / tool name
- `--accent` (orange) → messages sortants / avertissement
- `--destructive` (rouge) → erreur / hors ligne / failed
- `--muted-foreground` → inactif / texte secondaire
- `text-yellow-400` → warnings (heartbeat stale, claims âgés, blockages)
- `text-green-400` → succès (delivered, completed)

Composants `ui/` écrits à la main (pas d'install shadcn CLI), compatibles Tailwind v4.

---

## ConversationTab — format des entrées

Tous les types d'entrées ont un **header tabulé** pipe-séparé (`| type | heure | … |`).

**Messages XML** (type `"user"` avec encapsulation `<message>`) :
```
| Msg | 14:14 Brussels | #6 | ✈ telegram ← Crookies |
```
- Parsing par regex de `<context timezone>` + `<message id from from-channel from-type sender time>`
- Icône de canal déduite de l'attribut `from-channel` (ajouté par le container `formatter.ts`)
  ou par heuristique sur la valeur de `from` (fallback pour les sessions existantes)
- Timezone affichée en `text-[9px] opacity-40` (très discrète)

**Mapping icônes** : `telegram→✈`, `discord→#`, `slack→◈`, `gmail/email→✉`, `agent→(aucune)`

**Autres types** :
| Condition | Label |
|-----------|-------|
| `user` + XML `<message>` | `Msg` |
| `user` + texte brut | `User` |
| `assistant` + texte (avec ou sans tools) | `Reply` |
| `assistant` + tools seulement | `Tool` |

Tool calls : badge `✓`/`✗`/`…` immédiatement après le nom du tool (vert/rouge/gris).

---

## SessionDetail — layout scroll

`SessionDetail` utilise `flex flex-col h-full` pour occuper exactement la zone visible de `<main>` :
- **Header fixe** (`shrink-0`) : breadcrumb + bannière inactive + carte session + heartbeat strip
- **Barre d'onglets** (`shrink-0`) : toujours visible, plus besoin de `sticky`
- **Contenu** (`flex-1 overflow-y-auto min-h-0`) : scroll interne uniquement

Les autres pages (Dashboard, Messages, AgentSessions) continuent de scroller via `<main overflow-y-auto>`.

---

## Serving prod (SPA fallback)

`main.py` n'utilise plus `StaticFiles(html=True)` monté à `/` (comportement instable pour les chemins SPA). À la place, une route catch-all explicite :

```python
@app.get("/{full_path:path}")
async def spa_fallback(full_path: str):
    candidate = _frontend_dist / full_path
    if candidate.is_file():
        return FileResponse(str(candidate))
    return FileResponse(str(_frontend_dist / "index.html"))
```

Les assets Vite (`/assets/*.js`, `favicon.ico`, etc.) sont servis directement si le fichier existe ; sinon `index.html` (SPA routing).

---

## Container — enrichissement XML (`formatter.ts`)

Le `formatter.ts` de l'agent-runner ajoute deux attributs optionnels aux balises `<message>` :
- `from-channel` : type de canal (`"telegram"`, `"discord"`, `"slack"`, …) — présent si la destination est un canal
- `from-type` : `"channel"` ou `"agent"` — toujours présent quand `from` est résolu

Permet au dashboard d'afficher des icônes de canal sans requête supplémentaire. Les sessions créées avant cet ajout n'ont pas ces attributs ; le frontend utilise une heuristique sur `from` en fallback.

---

## Phase 2 — fonctionnalités prévues (non implémentées)

- Monitoring tokens : graphiques Recharts (AreaChart) depuis `.claude-shared/projects/*.jsonl`
- Logs live : SSE ou WS vers `logs/nanoclaw.log`
- Contrôle système : restart agent (nécessite auth)
- Config agents : édition CLAUDE.md via formulaire

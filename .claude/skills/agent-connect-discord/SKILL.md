---
name: agent-connect-discord
description: Wire an existing NanoClaw agent to a Discord channel. Use when the user creates a new Discord channel and wants an agent to receive messages from it. Requires the agent to already exist (via /init-agent or /init-first-agent) and Discord to be installed (/add-discord).
---

# Agent Connect Discord

Wire an existing agent group to a Discord channel.

## 1. Install the script (idempotent)

```bash
cp "${CLAUDE_SKILL_DIR}/scripts/agent-connect-discord.ts" scripts/agent-connect-discord.ts
```

## 2. Gather information

Ask the user for (use AskUserQuestion):

- **Agent name** — the folder name of the existing agent (e.g. `tom`). List available agents if unsure:
  ```bash
  pnpm exec tsx scripts/q.ts data/v2.db "SELECT folder, name FROM agent_groups ORDER BY name"
  ```
- **Discord Server ID** and **Channel ID** — from the channel URL or Discord developer mode (right-click → Copy ID).
- **Channel display name** — e.g. `#tom`. Default: `#<agent>`.
- **Trigger pattern** — default `.` (catch-all: every message in the channel goes to the agent). Use a mention pattern like `@tom` if the channel is shared with other agents.

## 3. Run the script

```bash
pnpm exec tsx scripts/agent-connect-discord.ts \
  --agent "<folder>" \
  --server-id "<server-id>" \
  --channel-id "<channel-id>" \
  [--name "#name"] \
  [--pattern "."]
```

Show the output to the user.

## 4. Confirm

No service restart needed — the host picks up new messaging groups on the next inbound message. Tell the user:

> Send a message in the Discord channel to verify the agent responds.

## Troubleshooting

**"Agent group not found"** — the folder name doesn't match. Run the query in step 2 to list valid names.

**No response after sending a message** — check `logs/nanoclaw.log` for `unknown_sender` drops or adapter errors. The Discord adapter must be running (`src/channels/index.ts` must import `discord.js`).

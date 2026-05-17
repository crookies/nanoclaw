---
name: init-agent-crookies
description: Create a new Crookies NanoClaw agent with Discord channel and A2A wiring to buzz. Crookies fork of /init-agent — use this instead of /init-agent for new specialist agents in this install.
---

# Init Agent (Crookies)

Bootstrap a new routed specialist agent with Discord channel and A2A bidirectional wiring to buzz.

## What this creates

- `agent_groups` row in `data/v2.db`
- `groups/<name>/` filesystem (CLAUDE.local.md, container.json, skills/, .claude-fragments/)
- `messaging_groups` row for the Discord channel
- `messaging_group_agents` wiring (Discord → agent, engage_pattern=`.`)
- `agent_destinations` rows:
  - `<name>` → channel (Discord #<name>) — auto-created by `createMessagingGroupAgent`
  - `buzz` → agent `<name>` (A2A buzz→agent)
  - `<name>` → `parent` = buzz (A2A agent→buzz)

## 1. Gather information

Ask the user:

- **Agent name** — short, lowercase, no spaces (`doc`, `cal`, `fin`…). Becomes the folder and `@name` trigger.
- **Description** — one sentence, first person (e.g. `"agent de gestion des archives de Pierre"`).
- **Discord channel** — the Discord channel already created for this agent. Ask for `guildId:channelId` (format: two numeric IDs separated by `:`).
- **Telegram wiring** — wire to Telegram groups? Default: **no** for specialist agents (accessed via buzz). Say yes only if the agent needs a direct Telegram trigger.

## 2. Run the script

```bash
pnpm exec tsx scripts/init-agent-crookies.ts \
  --name "<name>" \
  --description "<description>" \
  --discord "<guildId>:<channelId>" \
  --no-telegram
```

Additional flags:
- `--pattern "@<name>"` — override the Telegram trigger (default: `@<name>`)
- `--a2a-parent <folder>` — A2A parent agent folder (default: `dm-with-buzz`)
- `--no-a2a` — skip A2A setup entirely

Show the script output to the user.

## 3. Restart the A2A parent container

The parent agent's running container has its destinations frozen at spawn time. Without a restart it won't see the new A2A destination and won't be able to route to `<name>`.

```bash
/home/crooks/nanoclaw/bin/ncl groups restart \
  --id <parent-agent-group-id> \
  --message "Mise à jour des destinations : @<name> est maintenant disponible."
```

To find the parent's agent_group_id:

```bash
pnpm exec tsx scripts/q.ts data/v2.db "SELECT id FROM agent_groups WHERE folder='dm-with-buzz'"
```

Verify the new destination appeared in the respawned session:

```bash
SESS=$(ls data/v2-sessions/<parent-ag-id>/ | head -1)
pnpm exec tsx scripts/q.ts "data/v2-sessions/<parent-ag-id>/$SESS/inbound.db" "SELECT * FROM destinations"
```

Confirm `<name>` appears in the output before continuing.

## 4. Edit CLAUDE.local.md

Open `groups/<name>/CLAUDE.local.md` and refine:
- Domain-specific instructions (what the agent manages, rules, constraints)
- Context about Pierre if relevant (profile, preferences)
- MCP tool guidance if MCPs will be added later

Show the generated content and ask the user if anything needs to be added.

## 5. Update buzz's CLAUDE.local.md

Open `groups/dm-with-buzz/CLAUDE.local.md`, find the `## Agents dans le même canal` section, and add:

```markdown
- **<name>** : <description>. Déléguer via @<name> tout ce qui concerne <domain>.
```

## 6. Tell the user what's next

- The Discord channel is immediately active — any message in `#<name>` wakes the agent (~60s cold start first time).
- On Telegram, buzz can delegate via `@<name>` (A2A).
- To add MCP tools: edit `groups/<name>/container.json` or use `/add-*-tool`.
- To add mounts: edit `groups/<name>/container.json` → `additionalMounts`.

## How to find Discord IDs

- **Guild ID**: right-click the server icon → "Copy Server ID" (Developer Mode must be on in Discord settings)
- **Channel ID**: right-click the channel → "Copy Channel ID"

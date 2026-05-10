---
name: init-agent
description: Create a new routed NanoClaw agent (non-DM, pattern-triggered). Use when the user wants to add a new specialist agent (e.g. an email agent, a calendar agent) that other agents or the user can invoke via @name on an existing channel. For DM-channel agents use /init-first-agent instead.
---

# Init Agent

Bootstrap a new routed agent and wire it to existing channels via a trigger pattern.

## 1. Install the script (idempotent)

If `scripts/init-agent.ts` doesn't exist yet, copy it in:

```bash
cp "${CLAUDE_SKILL_DIR}/scripts/init-agent.ts" scripts/init-agent.ts
```

## 2. Gather information

Ask the user (use AskUserQuestion):

- **Agent name** — short, lowercase, no spaces (e.g. `tom`, `alice`). This becomes the folder name and the `@name` trigger.
- **Description** — what the agent does in one sentence, in first person from the agent's perspective (e.g. "agent de gestion des emails de Pierre"). Used to seed `CLAUDE.local.md`.
- **Telegram wiring** — wire to all existing Telegram groups? (default: yes). Answer no if the agent should only be reachable from other channels.

Optional (only ask if the user seems to need it):
- **Custom trigger pattern** — default is `@<name>`. Override only if the user asks.

## 3. Run the script

```bash
pnpm exec tsx scripts/init-agent.ts \
  --name "<name>" \
  --description "<description>" \
  [--pattern "<pattern>"] \
  [--no-telegram]
```

Show the script output to the user.

## 4. Edit CLAUDE.local.md

The script seeds a minimal `groups/<name>/CLAUDE.local.md`. Open it and refine it:
- Add domain-specific instructions relevant to the agent's role
- Add context about the user (Pierre's profile, preferences, etc.) if relevant
- Add MCP tool guidance if MCPs will be added later

Show the generated file content to the user and ask if they want to add anything before finishing.

## 5. Tell the user what's next

- The agent is immediately active — the next message matching the trigger pattern on Telegram will wake it.
- To add MCP tools (e.g. Gmail, Calendar): edit `groups/<name>/container.json` or use the relevant `/add-*-tool` skill.
- To wire to Discord: create a dedicated Discord channel with `/add-discord` (if not installed) then use `/manage-channels`.
- To update buzz's `CLAUDE.local.md` so it knows about `@<name>`, offer to do it now.

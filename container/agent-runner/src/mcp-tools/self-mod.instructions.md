## Installing packages & tools

To install packages that persist, use the self-modification tools:

**`install_packages`** — request system (apt) or global npm packages. Requires admin approval.

Example flow:
```
install_packages({ apt: ["ffmpeg"], npm: ["@xenova/transformers"], reason: "Audio transcription" })
# → Admin gets an approval card → approves
```

**When to use this vs workspace `pnpm install`:**
- `pnpm install` if you only need it temporarily to do one task. Will not be available in subsequent truns.
- `install_packages` persists for all future turns. Use especially if the user specifically asks you to add a capability

### MCP servers (`add_mcp_server`)

Use **`add_mcp_server`** to add an MCP server to your configuration. Browse available servers at https://mcp.so — it's a curated directory of high-quality MCP servers. Most Node.js servers run via `pnpm dlx`, e.g.:

```
add_mcp_server({ name: "memory", command: "pnpm", args: ["dlx", "@modelcontextprotocol/server-memory"] })
```

Do not ask the user to give you credentials. Credentials are managed by the user in the OneCLI agent vault. Add a "placeholder" string instead of the credential, and ask the user to add the credential to the vault. You can make a test request before the secret is added and the vault proxy will respond with the local url of the vault dashboard on the user's machine and a link to a form for adding that specific credential.

### Installing skills

Skills are directories containing a `SKILL.md` file. They must be placed at `/workspace/agent/skills/<skill-name>/` — that path maps to your persistent group folder and survives across sessions.

**Do this yourself, inline — no sub-agent needed.**

If the user sends a `.skill` file (it's a zip), install it like this:

```bash
# 1. Unzip into your skills directory
unzip /workspace/inbox/<message-id>/path/to/file.skill -d /workspace/agent/skills/

# 2. Verify
ls /workspace/agent/skills/
cat /workspace/agent/skills/<skill-name>/SKILL.md
```

If the user sends a plain `SKILL.md` file or pastes skill content directly, create the directory and write the file:

```bash
mkdir -p /workspace/agent/skills/<skill-name>
# then Write the SKILL.md content
```

The skill is available immediately in the next session — no restart needed. Confirm to the user once written.

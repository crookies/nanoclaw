/**
 * Bootstrap a new NanoClaw routed agent (non-DM, pattern-triggered).
 *
 * Creates the agent_groups row, initialises the group filesystem, and wires
 * the agent to every Telegram messaging group using @<name> as trigger pattern.
 * For DM-channel agents use scripts/init-first-agent.ts instead.
 *
 * Idempotent: re-running is safe — existing rows are skipped, not overwritten.
 *
 * Usage:
 *   pnpm exec tsx scripts/init-agent.ts \
 *     --name tom \
 *     --description "agent de gestion des emails de Pierre" \
 *     [--pattern "@tom"]          # default: @<name>
 *     [--instructions "..."]      # multiline CLAUDE.local.md body (overrides --description)
 *     [--no-telegram]             # skip Telegram wiring
 */
import path from 'path';

import { DATA_DIR } from '../src/config.js';
import { createAgentGroup, getAgentGroupByFolder } from '../src/db/agent-groups.js';
import { initDb } from '../src/db/connection.js';
import {
  createMessagingGroupAgent,
  getMessagingGroupAgentByPair,
  getMessagingGroupsByChannel,
} from '../src/db/messaging-groups.js';
import { runMigrations } from '../src/db/migrations/index.js';
import { initGroupFilesystem } from '../src/group-init.js';
import type { AgentGroup } from '../src/types.js';

interface Args {
  name: string;
  description: string;
  pattern: string;
  instructions: string | null;
  telegram: boolean;
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseArgs(argv: string[]): Args {
  const out: Partial<Args> & { telegram?: boolean } = { telegram: true };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const val = argv[i + 1];
    switch (key) {
      case '--name':
        out.name = val?.toLowerCase();
        i++;
        break;
      case '--description':
        out.description = val;
        i++;
        break;
      case '--pattern':
        out.pattern = val;
        i++;
        break;
      case '--instructions':
        out.instructions = val;
        i++;
        break;
      case '--no-telegram':
        out.telegram = false;
        break;
    }
  }

  if (!out.name) {
    console.error('Missing required arg: --name');
    console.error('Usage: pnpm exec tsx scripts/init-agent.ts --name <name> --description "<what the agent does>"');
    process.exit(2);
  }
  if (!out.description && !out.instructions) {
    console.error('Missing required arg: --description (or --instructions)');
    process.exit(2);
  }

  return {
    name: out.name,
    description: out.description ?? '',
    pattern: out.pattern ?? `@${out.name}`,
    instructions: out.instructions ?? null,
    telegram: out.telegram ?? true,
  };
}

function buildInstructions(name: string, description: string): string {
  const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
  return [
    `# ${capitalized}`,
    '',
    `Tu es ${capitalized}, ${description}.`,
    `Tu reçois des tâches de buzz (l'agent principal) ou directement de Pierre via @${name}.`,
    '',
    '## Communication',
    '',
    `- Tu réponds à buzz ou directement à Pierre selon qui t'a interpellé`,
    '- Langue : **français**, concis',
    '- Pour les traitements longs, envoie un accusé de réception puis le résultat',
  ].join('\n');
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  const db = initDb(path.join(DATA_DIR, 'v2.db'));
  runMigrations(db);

  const now = new Date().toISOString();
  const { name: agentName, pattern } = args;
  const folder = agentName;

  // 1. Agent group
  let ag: AgentGroup | undefined = getAgentGroupByFolder(folder);
  if (!ag) {
    const agId = generateId('ag');
    createAgentGroup({ id: agId, name: agentName, folder, agent_provider: null, created_at: now });
    ag = getAgentGroupByFolder(folder)!;
    console.log(`Created agent group: ${ag.id} (${folder})`);
  } else {
    console.log(`Agent group already exists: ${ag.id} (${folder})`);
  }

  // 2. Filesystem scaffold + container_configs DB row (via ensureContainerConfig)
  const instructions = args.instructions ?? buildInstructions(agentName, args.description);
  initGroupFilesystem(ag, { instructions });

  // 3. Wire to Telegram
  if (args.telegram) {
    const telegramGroups = getMessagingGroupsByChannel('telegram');
    if (telegramGroups.length === 0) {
      console.warn('No Telegram messaging group found — skipping Telegram wiring.');
    } else {
      for (const mg of telegramGroups) {
        const existing = getMessagingGroupAgentByPair(mg.id, ag.id);
        if (existing) {
          console.log(`Telegram wiring already exists: ${existing.id} (${mg.name ?? mg.platform_id})`);
        } else {
          createMessagingGroupAgent({
            id: generateId('mga'),
            messaging_group_id: mg.id,
            agent_group_id: ag.id,
            engage_mode: 'pattern',
            engage_pattern: pattern,
            sender_scope: 'all',
            ignored_message_policy: 'drop',
            session_mode: 'shared',
            priority: 0,
            created_at: now,
          });
          console.log(`Wired Telegram (${mg.name ?? mg.platform_id}) -> ${agentName} with pattern ${pattern}`);
        }
      }
    }
  }

  console.log('');
  console.log('Init complete.');
  console.log(`  agent:   ${ag.name} [${ag.id}] @ groups/${folder}`);
  console.log(`  pattern: ${pattern}`);
  console.log('');
  console.log('Next steps:');
  console.log(`  - Edit groups/${folder}/CLAUDE.local.md to refine the persona`);
  console.log(`  - Add MCP servers or mounts via groups/${folder}/container.json`);
  console.log(`  - Wire to Discord: update buzz's CLAUDE.local.md to mention @${agentName}`);
}

main();

/**
 * Bootstrap a new Crookies NanoClaw agent (non-DM, pattern-triggered).
 *
 * Fork of scripts/init-agent.ts with Crookies-specific additions:
 *   - --discord <guildId>:<channelId>  Wire to a specific Discord channel
 *   - --a2a-parent <folder>            Wire A2A bidirectional with a parent agent (default: dm-with-buzz)
 *
 * Creates the agent_groups row, initialises the group filesystem, optionally
 * wires to Telegram and/or Discord, and sets up A2A destinations.
 *
 * Idempotent: re-running is safe — existing rows are skipped, not overwritten.
 *
 * Usage:
 *   pnpm exec tsx scripts/init-agent-crookies.ts \
 *     --name doc \
 *     --description "agent de gestion des archives de Pierre" \
 *     [--pattern "@doc"]              # default: @<name>
 *     [--instructions "..."]          # multiline CLAUDE.local.md body (overrides --description)
 *     [--no-telegram]                 # skip Telegram wiring
 *     [--discord <guildId>:<channelId>]  # wire to a Discord channel
 *     [--a2a-parent <folder>]         # A2A bidirectional with this agent group (default: dm-with-buzz)
 *     [--no-a2a]                      # skip A2A setup entirely
 */
import path from 'path';

import { DATA_DIR } from '../src/config.js';
import { createAgentGroup, getAgentGroupByFolder } from '../src/db/agent-groups.js';
import { initDb } from '../src/db/connection.js';
import { updateContainerConfigJson } from '../src/db/container-configs.js';
import {
  createMessagingGroup,
  createMessagingGroupAgent,
  getMessagingGroup,
  getMessagingGroupAgentByPair,
  getMessagingGroupsByChannel,
} from '../src/db/messaging-groups.js';
import { runMigrations } from '../src/db/migrations/index.js';
import { initGroupFilesystem } from '../src/group-init.js';
import {
  createDestination,
  getDestinationByName,
  getDestinationByTarget,
} from '../src/modules/agent-to-agent/db/agent-destinations.js';
import type { AgentGroup } from '../src/types.js';

interface Args {
  name: string;
  description: string;
  pattern: string;
  instructions: string | null;
  telegram: boolean;
  discord: { guildId: string; channelId: string } | null;
  a2aParent: string | null;
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseArgs(argv: string[]): Args {
  const out: Partial<Args> & { telegram?: boolean; noA2a?: boolean } = {
    telegram: true,
    noA2a: false,
    a2aParent: 'dm-with-buzz',
  };
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
      case '--discord': {
        const parts = val?.split(':');
        if (!parts || parts.length !== 2) {
          console.error('--discord expects <guildId>:<channelId>');
          process.exit(2);
        }
        out.discord = { guildId: parts[0], channelId: parts[1] };
        i++;
        break;
      }
      case '--a2a-parent':
        out.a2aParent = val;
        i++;
        break;
      case '--no-a2a':
        out.noA2a = true;
        out.a2aParent = null;
        break;
    }
  }

  if (!out.name) {
    console.error('Missing required arg: --name');
    console.error(
      'Usage: pnpm exec tsx scripts/init-agent-crookies.ts --name <name> --description "<desc>" [--discord <guildId>:<channelId>] [--no-telegram] [--no-a2a]',
    );
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
    discord: out.discord ?? null,
    a2aParent: out.noA2a ? null : (out.a2aParent ?? 'dm-with-buzz'),
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

  // 2. Filesystem scaffold + container_configs DB row
  const instructions = args.instructions ?? buildInstructions(agentName, args.description);
  initGroupFilesystem(ag, { instructions });

  // Add default DriveScratchpad mount to every new agent
  updateContainerConfigJson(ag.id, 'additional_mounts', [
    {
      hostPath: '/home/crooks/nanoclaw/data/shared/drive_scratchpad',
      containerPath: 'drive_scratchpad',
    },
  ]);

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

  // 4. Wire to Discord
  if (args.discord) {
    const { guildId, channelId } = args.discord;
    const platformId = `discord:${guildId}:${channelId}`;

    // Create messaging_group if it doesn't exist
    const discordGroups = getMessagingGroupsByChannel('discord');
    let discordMg = discordGroups.find((mg) => mg.platform_id === platformId);
    if (!discordMg) {
      const mgId = generateId('mg');
      createMessagingGroup({
        id: mgId,
        channel_type: 'discord',
        platform_id: platformId,
        name: `#${agentName}`,
        is_group: 1,
        unknown_sender_policy: 'public',
        created_at: now,
      });
      discordMg = getMessagingGroup(mgId)!;
      console.log(`Created Discord messaging_group: ${discordMg.id} (${platformId})`);
    } else {
      console.log(`Discord messaging_group already exists: ${discordMg.id}`);
    }

    // Wire messaging_group -> agent_group (also auto-creates channel destination)
    const existing = getMessagingGroupAgentByPair(discordMg.id, ag.id);
    if (existing) {
      console.log(`Discord wiring already exists: ${existing.id}`);
    } else {
      createMessagingGroupAgent({
        id: generateId('mga'),
        messaging_group_id: discordMg.id,
        agent_group_id: ag.id,
        engage_mode: 'pattern',
        engage_pattern: '.',
        sender_scope: 'all',
        ignored_message_policy: 'drop',
        session_mode: 'shared',
        priority: 0,
        created_at: now,
      });
      console.log(`Wired Discord ${platformId} -> ${agentName} (channel destination auto-created)`);
    }
  }

  // 5. A2A bidirectional with parent agent
  if (args.a2aParent) {
    const parentAg = getAgentGroupByFolder(args.a2aParent);
    if (!parentAg) {
      console.warn(`A2A parent agent group not found: ${args.a2aParent} — skipping A2A setup.`);
    } else {
      // parent -> new agent
      if (!getDestinationByTarget(parentAg.id, 'agent', ag.id)) {
        createDestination({
          agent_group_id: parentAg.id,
          local_name: agentName,
          target_type: 'agent',
          target_id: ag.id,
          created_at: now,
        });
        console.log(`A2A: ${args.a2aParent} -> ${agentName}`);
      } else {
        console.log(`A2A destination already exists: ${args.a2aParent} -> ${agentName}`);
      }

      // new agent -> parent (as "parent")
      const parentLocalName = getDestinationByName(ag.id, 'parent') ? 'buzz' : 'parent';
      if (!getDestinationByTarget(ag.id, 'agent', parentAg.id)) {
        createDestination({
          agent_group_id: ag.id,
          local_name: parentLocalName,
          target_type: 'agent',
          target_id: parentAg.id,
          created_at: now,
        });
        console.log(`A2A: ${agentName} -> ${parentLocalName} (${args.a2aParent})`);
      } else {
        console.log(`A2A destination already exists: ${agentName} -> ${args.a2aParent}`);
      }
    }
  }

  console.log('');
  console.log('Init complete.');
  console.log(`  agent:   ${ag.name} [${ag.id}] @ groups/${folder}`);
  console.log(`  pattern: ${pattern}`);
  if (args.discord) console.log(`  discord: discord:${args.discord.guildId}:${args.discord.channelId}`);
  if (args.a2aParent) console.log(`  a2a:     ${args.a2aParent} <-> ${agentName}`);
  console.log('');
  console.log('Next steps:');
  console.log(`  - Edit groups/${folder}/CLAUDE.local.md to refine the persona`);
  console.log(`  - Update ${args.a2aParent ?? 'buzz'}'s CLAUDE.local.md to mention @${agentName}`);
}

main();

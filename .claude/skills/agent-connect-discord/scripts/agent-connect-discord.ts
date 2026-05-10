/**
 * Wire an existing agent group to a Discord channel.
 *
 * Creates the messaging_groups row for the Discord channel and wires it to
 * the specified agent group. Idempotent — re-running is safe.
 *
 * Usage:
 *   pnpm exec tsx scripts/agent-connect-discord.ts \
 *     --agent <folder>          \  # e.g. tom
 *     --server-id <server-id>   \  # Discord guild ID
 *     --channel-id <channel-id> \  # Discord channel ID
 *     [--name "#tom"]           \  # display name (default: #<agent>)
 *     [--pattern "."]              # engage pattern (default: . = catch-all)
 */
import path from 'path';

import { DATA_DIR } from '../src/config.js';
import { getAgentGroupByFolder } from '../src/db/agent-groups.js';
import { initDb } from '../src/db/connection.js';
import {
  createMessagingGroup,
  createMessagingGroupAgent,
  getMessagingGroupAgentByPair,
  getMessagingGroupByPlatform,
} from '../src/db/messaging-groups.js';
import { runMigrations } from '../src/db/migrations/index.js';

interface Args {
  agent: string;
  serverId: string;
  channelId: string;
  name: string | null;
  pattern: string;
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseArgs(argv: string[]): Args {
  const out: Partial<Args> = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const val = argv[i + 1];
    switch (key) {
      case '--agent':       out.agent = val;     i++; break;
      case '--server-id':   out.serverId = val;  i++; break;
      case '--channel-id':  out.channelId = val; i++; break;
      case '--name':        out.name = val;      i++; break;
      case '--pattern':     out.pattern = val;   i++; break;
    }
  }

  const missing = (['agent', 'serverId', 'channelId'] as const).filter((k) => !out[k]);
  if (missing.length) {
    const flags = missing.map((k) => `--${k.replace(/([A-Z])/g, '-$1').toLowerCase()}`);
    console.error(`Missing required args: ${flags.join(', ')}`);
    process.exit(2);
  }

  return {
    agent: out.agent!,
    serverId: out.serverId!,
    channelId: out.channelId!,
    name: out.name ?? null,
    pattern: out.pattern ?? '.',
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  const db = initDb(path.join(DATA_DIR, 'v2.db'));
  runMigrations(db);

  const now = new Date().toISOString();

  // Resolve agent group
  const ag = getAgentGroupByFolder(args.agent);
  if (!ag) {
    console.error(`Agent group not found: ${args.agent}`);
    console.error('Run: pnpm exec tsx scripts/q.ts data/v2.db "SELECT folder FROM agent_groups"');
    process.exit(1);
  }

  const platformId = `discord:${args.serverId}:${args.channelId}`;
  const displayName = args.name ?? `#${args.agent}`;

  // Create messaging group
  let mg = getMessagingGroupByPlatform('discord', platformId);
  if (!mg) {
    createMessagingGroup({
      id: generateId('mg'),
      channel_type: 'discord',
      platform_id: platformId,
      name: displayName,
      is_group: 1,
      unknown_sender_policy: 'public',
      created_at: now,
    });
    mg = getMessagingGroupByPlatform('discord', platformId)!;
    console.log(`Created messaging group: ${mg.id} (${displayName})`);
  } else {
    console.log(`Messaging group already exists: ${mg.id} (${mg.name})`);
  }

  // Wire to agent
  const existing = getMessagingGroupAgentByPair(mg.id, ag.id);
  if (existing) {
    console.log(`Wiring already exists: ${existing.id}`);
  } else {
    createMessagingGroupAgent({
      id: generateId('mga'),
      messaging_group_id: mg.id,
      agent_group_id: ag.id,
      engage_mode: 'pattern',
      engage_pattern: args.pattern,
      sender_scope: 'all',
      ignored_message_policy: 'drop',
      session_mode: 'shared',
      priority: 0,
      created_at: now,
    });
    console.log(`Wired ${displayName} -> ${ag.name} (pattern: ${args.pattern})`);
  }

  console.log('');
  console.log('Done.');
  console.log(`  agent:   ${ag.name} [${ag.id}]`);
  console.log(`  channel: ${displayName} ${platformId}`);
  console.log(`  pattern: ${args.pattern}`);
}

main();

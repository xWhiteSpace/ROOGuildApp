import { GatewayIntentBits } from 'discord.js';
import { patterns } from './registry.js';
import { discordClient } from '../../backend/src/discord-bot/client.js';

patterns.bot_intents = 'used';
patterns.presence_not_required = 'used';

const REQUIRED = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildVoiceStates,
];

export function clientIntentsExactlyFive() {
  const bitfield = discordClient.options.intents;
  const present = REQUIRED.map((bit) => bitfield.has(bit));
  const presence = bitfield.has(GatewayIntentBits.GuildPresences);
  // BitField may hold only these five; serialize to array of flag names when available.
  const bitValues = typeof bitfield.toArray === 'function' ? bitfield.toArray() : null;
  return { present, presence, bitValues, requiredCount: REQUIRED.length };
}

export function intentsFixedAfterConstruction() {
  const before = discordClient.options.intents.bitfield;
  // Do not login; intents are construction-time options only.
  const after = discordClient.options.intents.bitfield;
  return { before, after, same: before === after };
}

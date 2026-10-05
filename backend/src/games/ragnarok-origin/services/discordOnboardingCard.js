/**
 * Public Onboarding hub plus private ephemeral topic cards (Auction, GvG,
 * General Chat, Website) with purpose text and a jump to the mapped location.
 */
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';
import { getTenantStore } from '../../../db/database.js';
import { currentDiscordChannels, discordChannel } from '../../../db/channels.js';
import { enqueueDiscordCall, isDiscordCircuitOpen } from '../../../utils/discordRateLimit.js';
import { valhallaEnv } from '../../../config/valhallaEnv.js';

const EMBED_COLOR = '#9333ea';
const CARD_PATH = 'attendance/onboarding_card';
const UNMAPPED_SENTENCE = 'This channel is not mapped yet. Ask an officer to paste the ID in Settings.';

const HUB_TITLE = 'Onboarding';
const HUB_BODY = 'Welcome, Adventurer! This card shows where guild tools live. Pick a topic for a private explanation and a jump link.';

const TOPICS = {
  auction: {
    title: 'Auction',
    purpose:
      'Request weekly auction items and claim vacant loot slots. Use **Open Request** and **Open Live Dashboard** on the Request Card.',
    channelField: 'aucreqChannelId',
  },
  gvg: {
    title: 'GvG',
    purpose:
      'War-announce is the GvG board: mark Available / Unavailable, change in-game name or job, and view your party.',
    channelField: 'warAnnounceChannelId',
  },
  general: {
    title: 'General Chat',
    purpose: 'Guild-wide pings live here: loot allocation, raid-ready notices, RSVP lines.',
    channelField: 'genroomId',
  },
  website: {
    title: 'Website',
    purpose: 'VALHALLA is the full dashboard (requests, raid compose, live raid, history). Sign in with Discord.',
    channelField: null,
  },
};

const TOPIC_CUSTOM_IDS = {
  'onboard:auction': 'auction',
  'onboard:gvg': 'gvg',
  'onboard:general': 'general',
  'onboard:website': 'website',
};

function isEphemeralInteraction(interaction) {
  if (interaction?.ephemeral === true) return true;
  try {
    return Boolean(interaction?.message?.flags?.has(MessageFlags.Ephemeral));
  } catch {
    return false;
  }
}

export function buildHubPayload() {
  const embed = new EmbedBuilder()
    .setTitle(HUB_TITLE)
    .setColor(EMBED_COLOR)
    .setDescription(HUB_BODY);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('onboard:auction').setLabel('Auction').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('onboard:gvg').setLabel('GvG').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('onboard:general').setLabel('General Chat').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('onboard:website').setLabel('Website').setStyle(ButtonStyle.Primary),
  );

  return { embeds: [embed], components: [row] };
}

function backRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('onboard:back').setLabel('Back').setStyle(ButtonStyle.Secondary),
  );
}

function mappedLocationRow(guildId, channelId) {
  const row = new ActionRowBuilder();
  if (guildId && channelId) {
    row.addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('Jump to channel')
        .setURL(`https://discord.com/channels/${guildId}/${channelId}`),
    );
  }
  row.addComponents(
    new ButtonBuilder().setCustomId('onboard:back').setLabel('Back').setStyle(ButtonStyle.Secondary),
  );
  return row;
}

export function buildTopicPayload(topic, channels = {}, { guildId = '', frontendUrl = '' } = {}) {
  const spec = TOPICS[topic];
  if (!spec) {
    return { embeds: [], components: [] };
  }

  const embed = new EmbedBuilder().setTitle(spec.title).setColor(EMBED_COLOR);
  const components = [];

  if (topic === 'website') {
    const origin = String(frontendUrl || '').replace(/\/$/, '');
    const lines = [spec.purpose];
    embed.setDescription(lines.join('\n\n'));
    const row = new ActionRowBuilder();
    if (origin) {
      row.addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Open VALHALLA').setURL(origin),
      );
    }
    row.addComponents(
      new ButtonBuilder().setCustomId('onboard:back').setLabel('Back').setStyle(ButtonStyle.Secondary),
    );
    components.push(row);
    return { embeds: [embed], components };
  }

  const channelId = String(channels?.[spec.channelField] || '');
  const resolvedGuild = String(guildId || channels?.guildId || '');
  if (channelId) {
    embed.setDescription(`${spec.purpose}\n\nGo here: <#${channelId}>`);
    components.push(mappedLocationRow(resolvedGuild, channelId));
  } else {
    embed.setDescription(`${spec.purpose}\n\n${UNMAPPED_SENTENCE}`);
    components.push(backRow());
  }
  return { embeds: [embed], components };
}

export function classifyOnboardingAck(interaction) {
  const customId = String(interaction?.customId || '');
  if (!customId.startsWith('onboard:')) {
    return { ack: 'noop', view: 'none' };
  }
  if (customId === 'onboard:back') {
    return { ack: 'deferUpdate', view: 'hub' };
  }
  const topic = TOPIC_CUSTOM_IDS[customId];
  if (!topic) {
    return { ack: 'noop', view: 'none' };
  }
  if (isEphemeralInteraction(interaction)) {
    return { ack: 'deferUpdate', view: 'topic', topic };
  }
  return { ack: 'deferReply', view: 'topic', topic };
}

export function evaluateDeployOnboardingGate({
  isOfficer = false,
  channelId = '',
  botReady = false,
  circuitOpen = false,
  channelFound = false,
} = {}) {
  if (!isOfficer) return { status: 403, post: false, reason: 'not_officer' };
  if (!channelId) return { status: 400, post: false, reason: 'unmapped' };
  if (!botReady || circuitOpen) return { status: 503, post: false, reason: 'bot_unavailable' };
  if (!channelFound) return { status: 404, post: false, reason: 'locate_miss' };
  return { status: 200, post: true, reason: 'ok' };
}

async function requireReadyClient() {
  const { discordClient } = await import('../../../discord-bot/client.js');
  const { getDiscordRateLimitStatus } = await import('../../../utils/discordRateLimit.js');
  if (!discordClient || !discordClient.isReady()) {
    throw new Error(
      'Discord bot gateway is not connected on this backend. ' +
      'Website Sign-in can still work because OAuth is offloaded to Vercel — that does not mean the bot is online. ' +
      'Check Render for "successfully deployed as" or GET /api/debug/discord-ratelimit (botReady).',
    );
  }
  if (isDiscordCircuitOpen()) {
    const status = getDiscordRateLimitStatus();
    const when = status.circuitUntilHuman || status.untilHuman || status.circuitRemainingHuman || status.remainingHuman;
    throw new Error(`Discord is temporarily blocking this server IP. Try again after ${when}.`);
  }
  return discordClient;
}

async function persistCardPointer(channelId, messageId) {
  const db = getTenantStore();
  await db.ref(CARD_PATH).set({ channelId, messageId, updatedAt: Date.now() });
}

export async function sendPublicOnboardingCard(channel) {
  const payload = buildHubPayload();
  const channelId = String(channel.id);
  const db = getTenantStore();
  const storedSnap = await db.ref(CARD_PATH).once('value');
  const stored = storedSnap.exists() ? storedSnap.val() : null;
  if (stored?.messageId && stored.channelId === channelId) {
    try {
      const existing = await enqueueDiscordCall(() => channel.messages.fetch(stored.messageId));
      await enqueueDiscordCall(() => existing.edit(payload));
      await persistCardPointer(channelId, stored.messageId);
      return { posted: false, edited: true, messageId: stored.messageId };
    } catch {
      /* replace */
    }
  }
  const sent = await enqueueDiscordCall(() => channel.send(payload));
  await persistCardPointer(channelId, sent.id);
  return { posted: true, edited: false, messageId: sent.id };
}

export function onboardingDeployHttpStatus(err) {
  const msg = err?.message || '';
  if (/not configured/i.test(msg)) return 400;
  if (/offline|rate-limited|temporarily blocking|not connected/i.test(msg)) return 503;
  if (/locate the onboarding/i.test(msg)) return 404;
  return 500;
}

export async function deployPublicOnboardingCard() {
  const channelId = discordChannel('DISCORD_ONBOARDING_CHANNEL_ID');
  if (!channelId) {
    throw new Error('DISCORD_ONBOARDING_CHANNEL_ID is not configured.');
  }
  const discordClient = await requireReadyClient();
  const targetChannel = await enqueueDiscordCall(() => discordClient.channels.fetch(channelId));
  if (!targetChannel) {
    throw new Error('Discord gateway client failed to locate the onboarding channel.');
  }
  return sendPublicOnboardingCard(targetChannel);
}

function topicReplyPayload(topic) {
  const channels = currentDiscordChannels();
  const { frontendUrl } = valhallaEnv();
  return buildTopicPayload(topic, channels, {
    guildId: channels.guildId || '',
    frontendUrl,
  });
}

export async function handleOnboardingCardInteraction(interaction) {
  const decision = classifyOnboardingAck(interaction);
  if (!interaction.deferred && !interaction.replied) {
    if (decision.ack === 'deferReply') {
      await interaction.deferReply({ ephemeral: true });
    } else if (decision.ack === 'deferUpdate') {
      await interaction.deferUpdate();
    }
  }
  if (decision.view === 'hub') {
    return interaction.editReply(buildHubPayload());
  }
  if (decision.view === 'topic') {
    return interaction.editReply(topicReplyPayload(decision.topic));
  }
}

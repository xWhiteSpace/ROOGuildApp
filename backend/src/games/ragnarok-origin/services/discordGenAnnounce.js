/**
 * Officer GEN Room text pings (Attendance open / Party ready).
 * War-announce launchers stay separate; this only posts channel text.
 */
import { enqueueDiscordCall, isDiscordCircuitOpen } from '../../../utils/discordRateLimit.js';
import { discordChannel } from '../../../db/channels.js';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function warAnnounceMention() {
  const warId = (discordChannel('DISCORD_WARANNOUNCE_CHANNEL_ID') || '').trim();
  return warId ? `<#${warId}>` : 'war-announce';
}

function warAnnounceCta() {
  const warId = (discordChannel('DISCORD_WARANNOUNCE_CHANNEL_ID') || '').trim();
  return warId ? ` Confirm yours at <#${warId}>.` : '';
}

/** Readiness-board date style: Sep 23, 2026 */
export function formatAnnounceDate(dateStr) {
  if (!dateStr) return '—';
  const [year, month, day] = String(dateStr).split('-').map(Number);
  const mon = MONTHS_SHORT[(month || 1) - 1] || '—';
  const dd = Number.isFinite(day) ? String(day).padStart(2, '0') : '—';
  return Number.isFinite(year) ? `${mon} ${dd}, ${year}` : String(dateStr);
}

export function buildAttendanceRaidAnnounce({ eventDate }) {
  const date = formatAnnounceDate(eventDate);
  return `Get ready for the next GVG on **${date}**. Please Update your Job, or IGN on our System if you have change in-game. Thank you.`;
}

export function buildRsvpAnnounceLine({ displayName, available, eventTitle, eventDate }) {
  const name = displayName || 'A raider';
  const event = eventTitle || 'the raid';
  const when = formatAnnounceDate(eventDate);
  const cta = warAnnounceCta();
  if (!available) {
    return `🕊️ **${name}** is **Unavailable** for **${event}** this coming **${when}.** Rest well — the guild has you covered.${cta}`;
  }
  return `⚔️ **${name}** will be **Available** for **${event}** this coming **${when}.** Locked in — see you there.${cta}`;
}

export function buildPartyReadyAnnounce({ eventTitle, eventDate }) {
  const title = eventTitle || 'Raid';
  const date = eventDate || '—';
  return `Party is ready for **${title}** (${date}). See your party in ${warAnnounceMention()}.`;
}

export async function sendGenRoomMessage(content) {
  const genRoomId = (discordChannel('DISCORD_GENROOM_ID_1') || '').trim();
  if (!genRoomId) {
    throw new Error('DISCORD_GENROOM_ID_1 is not configured.');
  }
  if (isDiscordCircuitOpen()) {
    throw new Error('Discord is rate-limited. Try again shortly.');
  }

  const { discordClient } = await import('../../../discord-bot/client.js');
  if (!discordClient?.isReady()) {
    throw new Error(
      'Discord bot gateway is not connected on this backend. ' +
      'Check that the bot is online before announcing to GEN Room.'
    );
  }

  await enqueueDiscordCall(async () => {
    if (isDiscordCircuitOpen() || !discordClient.isReady()) {
      throw new Error('Discord is rate-limited. Try again shortly.');
    }
    let channel = discordClient.channels.cache.get(genRoomId);
    if (!channel) {
      channel = await discordClient.channels.fetch(genRoomId);
    }
    if (!channel) {
      throw new Error('GEN Room channel not found.');
    }
    await channel.send({ content });
  });

  return { posted: true };
}

export function buildRaidPhaseAnnounce(phaseTag, { eventTitle, eventDate, timeStart }) {
  const title = eventTitle || 'Raid';
  const date = eventDate || '—';
  const time = timeStart || '—';
  if (phaseTag === 'p2') {
    return `**${title}** — Party Adjustments are open for **${date}**. Officers can still update the raid party.`;
  }
  if (phaseTag === 'p3') {
    return `**${title}** War is live (**${date} ${time}**). Report to voice war rooms.`;
  }
  return `**${title}** raid created for **${date} ${time}**. Confirm attendance in ${warAnnounceMention()}.`;
}

export async function sendWarAnnounceMessage(content) {
  const warAnnounceId = (discordChannel('DISCORD_WARANNOUNCE_CHANNEL_ID') || '').trim();
  if (!warAnnounceId) {
    throw new Error('DISCORD_WARANNOUNCE_CHANNEL_ID is not configured.');
  }
  if (isDiscordCircuitOpen()) {
    throw new Error('Discord is rate-limited. Try again shortly.');
  }

  const { discordClient } = await import('../../../discord-bot/client.js');
  if (!discordClient?.isReady()) {
    throw new Error(
      'Discord bot gateway is not connected on this backend. ' +
      'Check that the bot is online before announcing to war-announce.'
    );
  }

  await enqueueDiscordCall(async () => {
    if (isDiscordCircuitOpen() || !discordClient.isReady()) {
      throw new Error('Discord is rate-limited. Try again shortly.');
    }
    let channel = discordClient.channels.cache.get(warAnnounceId);
    if (!channel) {
      channel = await discordClient.channels.fetch(warAnnounceId);
    }
    if (!channel) {
      throw new Error('War-announce channel not found.');
    }
    await channel.send({ content });
  });

  return { posted: true };
}

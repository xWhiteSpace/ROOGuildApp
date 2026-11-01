import { readLeaveMarkSlice, readReadinessCardPointer, setLeaveCreditRemaining } from '../../../db/database.js';
import {
  getCachedChannels,
  getCachedConfig,
  getCachedOnboardedTenants,
  hasCachedChannels,
  hasCachedConfig,
  runWithTenant,
} from '../../../db/tenantContext.js';
import { rolesGrantOfficer, roleTokensFromMember } from '../../../auth/officer.js';
import { enqueueDiscordCall } from '../../../utils/discordRateLimit.js';
import { buildCompositeKey } from '../../../utils/guildTime.js';
import { getDefaultLeaveCredits, getEventDeadlineMs } from './attendanceDecision.js';
import { buildChainActionRow, buildRsvpAnnounceLine, sendGenRoomMessage } from './discordGenAnnounce.js';
import { getRaidCycleStatus } from '../raidTimeWindow.js';
import { writeCommitment } from './scheduleService.js';

const DOVE = '\u{1F54A}';
const SALUTE = '\u{1FAE1}';
const leaveLocks = new Map();

function emojiToken(emoji) {
  return String(emoji?.name || emoji?.identifier || '')
    .replace(/\uFE0F/g, '')
    .trim()
    .toLowerCase();
}

export function isDoveReaction(emoji) {
  const token = emojiToken(emoji);
  if (!token) return false;
  return token === DOVE || token === 'dove' || token.includes('1f54a');
}

export function reactionTargetsLeaveNotice(channelId, cachedChannels) {
  const mapped = String(cachedChannels?.leaveNoticeChannelId || '').trim();
  if (!mapped) return false;
  return String(channelId || '') === mapped;
}

export function reactorIsOfficer({ userId, roleTokens, adminRoles, ownerDiscordId }) {
  if (ownerDiscordId && String(ownerDiscordId) === String(userId)) return true;
  return rolesGrantOfficer(roleTokens, adminRoles);
}

export function cycleNamesWar(cycle) {
  return Boolean(
    cycle
    && cycle.needsSetup !== true
    && cycle.isForceLocked !== true
    && cycle.warDate
    && cycle.activeEventId
    && cycle.warStartTime
  );
}

export function decideLeaveWrite({ status, memberFound, credits, defaultCredits, deadlineMs, nowMs }) {
  if (!memberFound) return { write: false, reason: 'not_member' };
  if (status === 'Leave') return { write: false, reason: 'already_leave' };
  if (Number.isFinite(deadlineMs) && nowMs > deadlineMs) return { write: false, reason: 'deadline' };
  const current = Number.isInteger(credits) ? credits : defaultCredits;
  if (!Number.isInteger(current) || current <= 0) return { write: false, reason: 'no_credits' };
  return { write: true, nextCredits: current - 1 };
}

export function leaveFooterAfterMark(text, previousStatus) {
  const match = String(text || '').match(/^(\d+) confirmed · (\d+) leave · (\d+) unanswered(.*)$/);
  if (!match) return null;
  let confirmed = Number(match[1]);
  let leave = Number(match[2]);
  let unanswered = Number(match[3]);
  const rest = match[4] || '';
  if (previousStatus === 'Confirmed' || previousStatus === 'Confirm') {
    confirmed = Math.max(0, confirmed - 1);
  } else {
    unanswered = Math.max(0, unanswered - 1);
  }
  leave += 1;
  return `${confirmed} confirmed · ${leave} leave · ${unanswered} unanswered${rest}`;
}

function ownerFromCache(tenants, guildId) {
  const rows = Array.isArray(tenants) ? tenants : [];
  const row = rows.find((tenant) => String(tenant?.id) === String(guildId));
  return row?.owner_discord_id || '';
}

function authorLabel(message) {
  return message.member?.displayName
    || message.author?.globalName
    || message.author?.username
    || 'A raider';
}

function withLeaveLock(key, fn) {
  const prev = leaveLocks.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  leaveLocks.set(key, next);
  return next.finally(() => {
    if (leaveLocks.get(key) === next) leaveLocks.delete(key);
  });
}

async function reactorMember(message, user, discordClient) {
  const guild = message.guild || discordClient?.guilds?.cache?.get(message.guildId);
  if (!guild?.members) return null;
  const cached = guild.members.cache?.get?.(user.id);
  if (cached) return cached;
  if (typeof guild.members.fetch !== 'function') return null;
  return guild.members.fetch(user.id).catch(() => null);
}

async function editLeaveCount(previousStatus, io) {
  const client = io.discordClient;
  if (!client?.isReady?.()) return;
  const pointer = await io.readReadinessCardPointer();
  if (!pointer?.messageId || !pointer.channelId) return;
  await io.enqueueDiscordCall(async () => {
    let channel = client.channels.cache.get(pointer.channelId);
    if (!channel) channel = await client.channels.fetch(pointer.channelId);
    if (!channel) return;
    const card = await channel.messages.fetch(pointer.messageId);
    const embed = card.embeds?.[0];
    if (!embed) return;
    const current = typeof embed.toJSON === 'function' ? embed.toJSON() : (embed.data || embed);
    const nextText = leaveFooterAfterMark(current?.footer?.text, previousStatus);
    if (!nextText) return;
    await card.edit({ embeds: [{ ...current, footer: { ...(current.footer || {}), text: nextText } }] });
  });
}

async function markLeave(message, author, io) {
  const cycle = io.getRaidCycleStatus();
  if (!cycleNamesWar(cycle)) return { acted: false, reason: 'no_war' };
  const nowMs = io.nowMs();
  const deadlineMs = io.getEventDeadlineMs(
    { date: cycle.warDate, timeStart: cycle.warStartTime },
    cycle.timezone,
  );
  if (Number.isFinite(deadlineMs) && nowMs > deadlineMs) return { acted: false, reason: 'deadline' };

  const compositeKey = buildCompositeKey(cycle.warDate, cycle.activeEventId);
  return withLeaveLock(`${author.id}:${compositeKey}`, async () => {
    const slice = await io.readLeaveMarkSlice(compositeKey, author.id);
    const config = io.getCachedConfig() || {};
    const decision = decideLeaveWrite({
      status: slice.status,
      memberFound: slice.memberFound,
      credits: slice.credits,
      defaultCredits: getDefaultLeaveCredits(config),
      deadlineMs,
      nowMs,
    });
    if (!decision.write) return { acted: false, reason: decision.reason };

    const displayName = authorLabel(message);
    await io.writeCommitment({
      userId: author.id,
      displayName,
      dateStr: cycle.warDate,
      eventId: cycle.activeEventId,
      status: 'Leave',
    });
    await io.setLeaveCreditRemaining(author.id, decision.nextCredits);

    const line = buildRsvpAnnounceLine({
      displayName,
      available: false,
      eventTitle: cycle.activeEventTitle,
      eventDate: cycle.warDate,
    });
    const components = [io.buildChainActionRow(compositeKey)];
    try {
      await io.sendGenRoomMessage(line, { components });
    } catch (err) {
      console.error('[leave-notice] GEN announce skipped:', err.message);
    }
    try {
      await io.editLeaveCount(slice.status, io);
    } catch (err) {
      console.error('[leave-notice] readiness count skipped:', err.message);
    }
    try {
      await io.reactSalute(message);
    } catch (err) {
      console.error('[leave-notice] salute skipped:', err.message);
    }
    return { acted: true, reason: 'leave', compositeKey, displayName };
  });
}

function ioFrom(deps) {
  return {
    hasCachedChannels,
    getCachedChannels,
    hasCachedConfig,
    getCachedConfig,
    getCachedOnboardedTenants,
    readLeaveMarkSlice,
    setLeaveCreditRemaining,
    readReadinessCardPointer,
    writeCommitment,
    getRaidCycleStatus,
    getEventDeadlineMs,
    sendGenRoomMessage,
    buildChainActionRow,
    enqueueDiscordCall,
    reactSalute: async (message) => {
      if (typeof message?.react !== 'function') return;
      await enqueueDiscordCall(() => message.react(SALUTE));
    },
    runWithTenant,
    nowMs: () => Date.now(),
    editLeaveCount,
    discordClient: null,
    ...deps,
  };
}

export async function handleLeaveNoticeReaction(reaction, user, deps = {}) {
  if (!user || user.bot) return { acted: false, reason: 'bot' };
  const io = ioFrom(deps);
  if (!reaction?.partial && !isDoveReaction(reaction?.emoji)) return { acted: false, reason: 'emoji' };

  let live = reaction;
  if (live?.partial) {
    try {
      live = await live.fetch();
    } catch {
      return { acted: false, reason: 'fetch' };
    }
  }
  if (!isDoveReaction(live?.emoji)) return { acted: false, reason: 'emoji' };

  const message = live.message;
  const guildId = message?.guildId;
  if (!guildId || !io.hasCachedChannels(guildId)) return { acted: false, reason: 'cold_cache' };
  if (!reactionTargetsLeaveNotice(message.channelId, io.getCachedChannels(guildId))) {
    return { acted: false, reason: 'channel' };
  }
  if (!io.hasCachedConfig(guildId)) return { acted: false, reason: 'cold_cache' };

  if (message.partial) {
    try {
      await message.fetch();
    } catch {
      console.warn(`[leave-notice] skipped: fetch channel=${message.channelId}`);
      return { acted: false, reason: 'fetch' };
    }
  }

  const config = io.getCachedConfig(guildId) || {};
  const ownerDiscordId = ownerFromCache(io.getCachedOnboardedTenants(), guildId);
  const member = await reactorMember(message, user, io.discordClient);
  const roleTokens = roleTokensFromMember(member);
  if (!reactorIsOfficer({
    userId: user.id,
    roleTokens,
    adminRoles: config.adminRoles,
    ownerDiscordId,
  })) {
    console.warn(`[leave-notice] skipped: officer user=${user.id} channel=${message.channelId}`);
    return { acted: false, reason: 'officer' };
  }

  const author = message.author;
  if (!author?.id || author.bot) {
    console.warn(`[leave-notice] skipped: author channel=${message.channelId}`);
    return { acted: false, reason: 'author' };
  }
  const marked = await io.runWithTenant(guildId, () => markLeave(message, author, io));
  if (!marked?.acted) {
    console.warn(`[leave-notice] skipped: ${marked?.reason || 'unknown'} author=${author.id} channel=${message.channelId}`);
  }
  return marked;
}

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { patterns } from './registry.js';
import {
  LEAVE_MARK_CREDIT_SQL,
  LEAVE_MARK_CREDIT_UPDATE_SQL,
  LEAVE_MARK_STATUS_SQL,
  READINESS_CARD_POINTER_SQL,
} from '../../backend/src/db/database.js';
import { discordChannel } from '../../backend/src/db/channels.js';
import { mergeChannelFallback } from '../../backend/src/db/tenants.js';
import {
  clearTenantCaches,
  runWithTenant,
  setCachedChannels,
} from '../../backend/src/db/tenantContext.js';
import {
  decideLeaveWrite,
  handleLeaveNoticeReaction,
  leaveFooterAfterMark,
} from '../../backend/src/games/ragnarok-origin/services/leaveNoticeReaction.js';

patterns.leave_notice_dove = 'used';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT = 'leave-notice-tenant';

const WAR = {
  needsSetup: false,
  isForceLocked: false,
  warDate: '2099-06-15',
  warStartTime: '20:00',
  activeEventId: 'gvg',
  activeEventTitle: 'Siege',
  timezone: 'Asia/Manila',
};

function selectsWholeDocument(sql) {
  return /select\s+(?:\*|data)\s+from/i.test(sql);
}

export function leaveMarkSqlStaysProjected() {
  const statements = [
    LEAVE_MARK_STATUS_SQL,
    LEAVE_MARK_CREDIT_SQL,
    LEAVE_MARK_CREDIT_UPDATE_SQL,
    READINESS_CARD_POINTER_SQL,
  ];
  return {
    projected: statements.every((sql) => !selectsWholeDocument(sql)),
    statusField: LEAVE_MARK_STATUS_SQL.includes("data->>'status'"),
    creditField: LEAVE_MARK_CREDIT_SQL.includes("data->>'leaveCreditsRemaining'"),
    oneMember: LEAVE_MARK_CREDIT_SQL.includes('discord_id = $3'),
    oneCommitment: LEAVE_MARK_STATUS_SQL.includes('member_id = $4'),
    noReturning: !/returning/i.test(LEAVE_MARK_CREDIT_UPDATE_SQL),
    creditUpdate: LEAVE_MARK_CREDIT_UPDATE_SQL.includes('jsonb_set'),
  };
}

export function handlerDoesNotLoadRosterOrConfig() {
  const source = fs.readFileSync(
    path.join(root, 'backend/src/games/ragnarok-origin/services/leaveNoticeReaction.js'),
    'utf8',
  );
  const client = fs.readFileSync(path.join(root, 'backend/src/discord-bot/client.js'), 'utf8');
  const listenerAt = client.indexOf("discordClient.on('messageReactionAdd'");
  const listener = client.slice(listenerAt, listenerAt + 280);
  return {
    noRoster: !/loadRosterMembers|refreshGvgReadinessBoard|applyAttendanceDecision|listUpcomingInstances|loadTenantSettings/.test(source),
    listenerSkipsTenantLoad: listener.includes('handleLeaveNoticeReaction') && !listener.includes('withGuildTenant'),
    watchesReactions: client.includes('GuildMessageReactions') && client.includes('Partials.Reaction'),
  };
}

export function leaveChannelResolvesFromCache() {
  clearTenantCaches(TENANT);
  setCachedChannels(TENANT, { leaveNoticeChannelId: 'leave-1' });
  const mapped = runWithTenant(TENANT, () => discordChannel('DISCORD_LEAVE_NOTICE_CHANNEL_ID'));
  const stored = mergeChannelFallback({ leaveNoticeChannelId: 'leave-1' }).leaveNoticeChannelId;
  const blank = mergeChannelFallback({}).leaveNoticeChannelId;
  clearTenantCaches(TENANT);
  return { mapped, stored, blank };
}

export function footerCounts() {
  const base = '1 confirmed · 0 leave · 2 unanswered · Master List button to view names';
  return {
    fromUnanswered: leaveFooterAfterMark(base, null),
    fromConfirmed: leaveFooterAfterMark(base, 'Confirmed'),
    untouched: leaveFooterAfterMark('custom footer', null),
  };
}

export function creditAndDeadlineRules() {
  return {
    alreadyLeave: decideLeaveWrite({
      status: 'Leave', memberFound: true, credits: 2, defaultCredits: 3, deadlineMs: 100, nowMs: 50,
    }),
    noCredits: decideLeaveWrite({
      status: null, memberFound: true, credits: 0, defaultCredits: 3, deadlineMs: 100, nowMs: 50,
    }),
    closed: decideLeaveWrite({
      status: null, memberFound: true, credits: 2, defaultCredits: 3, deadlineMs: 10, nowMs: 50,
    }),
    missingMember: decideLeaveWrite({
      status: null, memberFound: false, credits: null, defaultCredits: 3, deadlineMs: 100, nowMs: 50,
    }),
    spend: decideLeaveWrite({
      status: 'Confirmed', memberFound: true, credits: 3, defaultCredits: 3, deadlineMs: 100, nowMs: 50,
    }),
  };
}

function officerMember() {
  return {
    roles: {
      cache: new Map([
        ['role-1', { id: 'role-1', name: 'Officer' }],
      ]),
    },
  };
}

function reactionFor({
  emoji = '🕊️',
  channelId = 'leave-1',
  guildId = 'guild-1',
  authorId = 'member-1',
  officer = true,
  partial = false,
  fetchedEmoji = emoji,
} = {}) {
  const message = {
    partial: false,
    guildId,
    channelId,
    guild: {
      members: {
        cache: new Map(officer ? [['officer-1', officerMember()]] : []),
      },
    },
    author: { id: authorId, username: 'Rae', bot: false },
    member: null,
  };
  const reaction = {
    partial,
    emoji: { name: emoji },
    message,
    async fetch() {
      this.partial = false;
      this.emoji = { name: fetchedEmoji };
      return this;
    },
  };
  return { reaction, user: { id: 'officer-1', bot: false }, message };
}

function harness(overrides = {}) {
  const calls = {
    read: [],
    write: [],
    credit: [],
    announce: [],
    edited: [],
  };
  const card = {
    embeds: [{
      footer: { text: '1 confirmed · 0 leave · 2 unanswered · Master List button to view names' },
      toJSON() { return { title: 'GvG Readiness', footer: { ...this.footer } }; },
    }],
    async edit(payload) { calls.edited.push(payload); },
  };
  const io = {
    hasCachedChannels: () => true,
    getCachedChannels: () => ({ leaveNoticeChannelId: 'leave-1' }),
    hasCachedConfig: () => true,
    getCachedConfig: () => ({ adminRoles: ['Officer'], defaultLeaveCredits: 3, timezone: 'Asia/Manila' }),
    getCachedOnboardedTenants: () => [],
    getRaidCycleStatus: () => WAR,
    readLeaveMarkSlice: async (eventKey, memberId) => {
      calls.read.push({ eventKey, memberId });
      return { status: null, memberFound: true, credits: 3 };
    },
    writeCommitment: async (row) => { calls.write.push(row); },
    setLeaveCreditRemaining: async (memberId, credits) => { calls.credit.push({ memberId, credits }); },
    readReadinessCardPointer: async () => ({ messageId: 'card-1', channelId: 'war-1' }),
    sendGenRoomMessage: async (content) => { calls.announce.push(content); },
    buildChainActionRow: () => ({ type: 1 }),
    enqueueDiscordCall: (fn) => fn(),
    runWithTenant: (_id, fn) => fn(),
    discordClient: {
      isReady: () => true,
      channels: {
        cache: new Map([['war-1', { messages: { fetch: async () => card } }]]),
      },
    },
    ...overrides,
  };
  return { calls, io };
}

export async function ignorePaths() {
  const wrongEmoji = harness();
  const emoji = await handleLeaveNoticeReaction(
    reactionFor({ emoji: '👍' }).reaction,
    reactionFor().user,
    wrongEmoji.io,
  );

  const wrongChannel = harness();
  const channel = await handleLeaveNoticeReaction(
    reactionFor({ channelId: 'general' }).reaction,
    reactionFor().user,
    wrongChannel.io,
  );

  const member = harness();
  const notOfficer = await handleLeaveNoticeReaction(
    reactionFor({ officer: false }).reaction,
    reactionFor().user,
    member.io,
  );

  const cold = harness({ hasCachedChannels: () => false });
  const coldResult = await handleLeaveNoticeReaction(
    reactionFor().reaction,
    reactionFor().user,
    cold.io,
  );

  const noWar = harness({ getRaidCycleStatus: () => ({ needsSetup: true }) });
  const noWarResult = await handleLeaveNoticeReaction(
    reactionFor().reaction,
    reactionFor().user,
    noWar.io,
  );

  const closed = harness({ getEventDeadlineMs: () => 1, nowMs: () => 50 });
  const closedResult = await handleLeaveNoticeReaction(
    reactionFor().reaction,
    reactionFor().user,
    closed.io,
  );

  return {
    emoji: { result: emoji, reads: wrongEmoji.calls.read.length },
    channel: { result: channel, reads: wrongChannel.calls.read.length },
    officer: { result: notOfficer, reads: member.calls.read.length },
    cold: { result: coldResult, reads: cold.calls.read.length },
    noWar: { result: noWarResult, reads: noWar.calls.read.length },
    closed: { result: closedResult, reads: closed.calls.read.length },
  };
}

export async function doveWritesOneLeave() {
  const { calls, io } = harness();
  const { reaction, user } = reactionFor();
  const result = await handleLeaveNoticeReaction(reaction, user, io);
  return { result, calls };
}

export async function secondDoveDoesNotSpendAgain() {
  const { calls, io } = harness({
    readLeaveMarkSlice: async (eventKey, memberId) => {
      calls.read.push({ eventKey, memberId });
      return { status: 'Leave', memberFound: true, credits: 2 };
    },
  });
  const { reaction, user } = reactionFor();
  const result = await handleLeaveNoticeReaction(reaction, user, io);
  return { result, calls };
}

import { vi } from 'vitest';
import { patterns } from './registry.js';
import { createMemoryTenantStore } from '../support/memoryTenantStore.js';
import { runWithTenant, setCachedChannels, clearTenantCaches } from '../../backend/src/db/tenantContext.js';
import {
  buildRsvpAnnounceLine,
  formatAnnounceDate,
} from '../../backend/src/games/ragnarok-origin/services/discordGenAnnounce.js';

patterns.rsvp_announce = 'used';
patterns.announce_cooldown = 'used';
patterns.gen_fallbacks = 'used';

const storeHolder = vi.hoisted(() => ({ store: null }));
const cycleHolder = vi.hoisted(() => ({ status: null }));
const decision = vi.hoisted(() => ({
  impl: async () => ({ ok: true }),
}));
const genSend = vi.hoisted(() => ({ calls: [] }));
const keySeq = vi.hoisted(() => ({ n: 0 }));

vi.mock('../../backend/src/db/database.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getTenantStore: () => storeHolder.store };
});

vi.mock('../../backend/src/games/ragnarok-origin/raidTimeWindow.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getRaidCycleStatus: () => cycleHolder.status };
});

vi.mock('../../backend/src/games/ragnarok-origin/services/attendanceDecision.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    applyAttendanceDecision: (...args) => decision.impl(...args),
    resolveAttendanceTargetEvent: async () => ({
      event: {
        key: '2026-10-07_evt1',
        date: '2026-10-07',
        title: 'Weekly GvG',
        timeStart: '20:55',
        eventId: 'evt1',
      },
      timezone: 'Asia/Manila',
      deadlineMs: Date.now() + 86400000,
      missing: false,
    }),
  };
});

vi.mock('../../backend/src/games/ragnarok-origin/services/discordGenAnnounce.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    sendGenRoomMessage: async (content) => {
      genSend.calls.push(content);
      return { posted: true };
    },
  };
});

vi.mock('../../backend/src/utils/discordRateLimit.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, isDiscordCircuitOpen: () => false };
});

const { handleAttendanceCardInteraction } = await import(
  '../../backend/src/games/ragnarok-origin/services/discordAttendanceCards.js'
);

const TENANT = 'rsvp-announce-tenant';
const UID = '111111111111111111';

function nextKey() {
  keySeq.n += 1;
  // Unique composite key avoids module-level lastAnnounceAt cooldown across tests
  return `2026-10-07_evt${keySeq.n}`;
}

function seed() {
  clearTenantCaches(TENANT);
  setCachedChannels(TENANT, {});
  storeHolder.store = createMemoryTenantStore({
    auction: {
      members: {
        [UID]: { isRaidRoster: true, status: 'Active', displayName: 'Ada', leaveCreditsRemaining: 3 },
      },
    },
    attendance: { commitments: {} },
    settings: { configuration: { timezone: 'Asia/Manila', isForceLocked: false, defaultLeaveCredits: 3 } },
  });
  cycleHolder.status = {
    activeEventTitle: 'Cycle Title',
    warDate: '2026-10-07',
  };
  genSend.calls = [];
  decision.impl = async () => ({ ok: true });
}

function makeIx(customId) {
  return {
    user: { id: UID, username: 'Ada' },
    customId,
    deferred: false,
    replied: false,
    message: { flags: { has: () => false }, id: 'm1' },
    deferUpdate: vi.fn(async function deferUpdate() { this.deferred = true; }),
    deferReply: vi.fn(async () => {}),
    editReply: vi.fn(async () => {}),
    followUp: vi.fn(async () => {}),
    reply: vi.fn(async () => {}),
  };
}

async function press(action, { statusAlready = null, key = null } = {}) {
  seed();
  const compositeKey = key || nextKey();
  if (statusAlready) {
    await storeHolder.store.ref(`attendance/commitments/${compositeKey}/${UID}`).set({ status: statusAlready });
  }
  const ix = makeIx(`attcard:set:${compositeKey}:${action}`);
  await runWithTenant(TENANT, () => handleAttendanceCardInteraction(ix));
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  return { calls: [...genSend.calls], ix, key: compositeKey };
}

export async function confirmedAnnouncesAvailable() {
  const { calls } = await press('confirm');
  return { calls, line: calls[0] };
}

export async function leaveAnnouncesUnavailable() {
  const { calls } = await press('leave');
  return { calls, line: calls[0] };
}

export async function secondWithin60sNoAnnounce() {
  seed();
  const compositeKey = nextKey();
  const ix1 = makeIx(`attcard:set:${compositeKey}:confirm`);
  await runWithTenant(TENANT, () => handleAttendanceCardInteraction(ix1));
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  const afterFirst = genSend.calls.length;
  decision.impl = async () => ({ ok: true });
  await storeHolder.store.ref(`attendance/commitments/${compositeKey}/${UID}`).set({ status: 'Confirmed' });
  const ix2 = makeIx(`attcard:set:${compositeKey}:leave`);
  await runWithTenant(TENANT, () => handleAttendanceCardInteraction(ix2));
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  return { afterFirst, total: genSend.calls.length };
}

export async function noopPressNoAnnounce() {
  const { calls } = await press('confirm', { statusAlready: 'Confirmed' });
  return { calls };
}

export async function failedDecisionNoAnnounce() {
  seed();
  const compositeKey = nextKey();
  const { AttendanceDecisionError } = await import(
    '../../backend/src/games/ragnarok-origin/services/attendanceDecision.js'
  );
  decision.impl = async () => {
    throw new AttendanceDecisionError('no_credits', 'No leave credits remaining.');
  };
  const ix = makeIx(`attcard:set:${compositeKey}:leave`);
  await runWithTenant(TENANT, () => handleAttendanceCardInteraction(ix));
  await new Promise((r) => setImmediate(r));
  return { calls: [...genSend.calls] };
}

export function lineUsesCycleTitleAndWarDate() {
  const line = buildRsvpAnnounceLine({
    displayName: 'Ada',
    available: true,
    eventTitle: 'Cycle Title',
    eventDate: '2026-10-07',
  });
  return { line, date: formatAnnounceDate('2026-10-07') };
}

export function fallbacksForMissingFields() {
  const line = buildRsvpAnnounceLine({
    displayName: '',
    available: true,
    eventTitle: '',
    eventDate: 'bad',
  });
  return { line, emDashDate: formatAnnounceDate('') };
}

export function confirmYoursClause() {
  clearTenantCaches(TENANT);
  setCachedChannels(TENANT, {});
  const without = runWithTenant(TENANT, () => buildRsvpAnnounceLine({
    displayName: 'Ada',
    available: true,
    eventTitle: 'GvG',
    eventDate: '2026-10-07',
  }));
  setCachedChannels(TENANT, { warAnnounceChannelId: '999888777666555444' });
  const withCta = runWithTenant(TENANT, () => buildRsvpAnnounceLine({
    displayName: 'Ada',
    available: true,
    eventTitle: 'GvG',
    eventDate: '2026-10-07',
  }));
  return { without, withCta };
}

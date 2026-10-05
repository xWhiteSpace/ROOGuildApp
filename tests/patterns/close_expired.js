import { readFileSync } from 'node:fs';
import { vi } from 'vitest';
import { patterns } from './registry.js';
import { createMemoryTenantStore } from '../support/memoryTenantStore.js';
import { runWithTenant, setCachedConfig, clearTenantCaches } from '../../backend/src/db/tenantContext.js';
import { buildCompositeKey } from '../../backend/src/utils/guildTime.js';

patterns.close_expired = 'used';
patterns.no_confirm = 'used';
patterns.idempotent_marker = 'used';
patterns.not_on_ticker = 'used';

const storeHolder = vi.hoisted(() => ({ store: null }));
const instancesByWeek = vi.hoisted(() => ({ map: {} }));

vi.mock('../../backend/src/db/database.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTenantStore: () => storeHolder.store,
    loadInstancesForWeek: async (weekMonday) => instancesByWeek.map[weekMonday] || {},
  };
});

vi.mock('../../backend/src/games/ragnarok-origin/services/scheduleService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    resolveGuildTimezone: async () => 'Asia/Manila',
    loadRosterMembers: async () => {
      const snap = await storeHolder.store.ref('auction/members').once('value');
      return snap.exists() ? snap.val() : {};
    },
    ensureWeekInstances: async ({ weekMonday }) => ({
      weekMonday,
      instances: instancesByWeek.map[weekMonday] || {},
      timezone: 'Asia/Manila',
    }),
  };
});

const { closeExpiredDeadlines } = await import(
  '../../backend/src/games/ragnarok-origin/services/attendanceDecision.js'
);

const TZ = 'Asia/Manila';
const EVENT_ID = 'evt_close';
const TENANT = 'close-deadline-tenant';

function setup({ instances = {}, members = {}, closed = {}, commitments = {} } = {}) {
  clearTenantCaches(TENANT);
  setCachedConfig(TENANT, { timezone: TZ, events: {} });
  instancesByWeek.map = instances;
  storeHolder.store = createMemoryTenantStore({
    auction: { members },
    attendance: {
      deadline_closed: closed,
      commitments,
    },
    settings: { configuration: { timezone: TZ, events: {} } },
    scheduler: { instances: Object.assign({}, ...Object.values(instances)) },
  });
}

/** Build an instance that is past deadline but within 7 days of start. */
function dueInstance({ date, timeStart = '20:55', weekMonday }) {
  const key = buildCompositeKey(date, EVENT_ID);
  return {
    key,
    weekMonday,
    eventId: EVENT_ID,
    date,
    title: 'GvG',
    timeStart,
    timeEnd: '22:15',
    isCancelled: false,
  };
}

export async function pastDeadlineUnansweredBecomesNoConfirm() {
  // War Tue 2026-10-07 20:55 PHT; deadline = start - 24h = Mon 20:55.
  // now = Wed 2026-10-08 12:00 — past deadline, start within 7d.
  const weekMonday = '2026-10-05';
  const date = '2026-10-07';
  const inst = dueInstance({ date, weekMonday });
  const key = inst.key;
  setup({
    instances: {
      [weekMonday]: { [key]: inst },
      ['2026-09-28']: {},
      ['2026-10-12']: {},
    },
    members: {
      u1: { isRaidRoster: true, status: 'Active', displayName: 'Ada', noConfirmCount: 1 },
      ghost: { isRaidRoster: true, status: 'Ghost', noConfirmCount: 0 },
    },
  });
  const nowMs = new Date('2026-10-08T12:00:00+08:00').getTime();
  const result = await runWithTenant(TENANT, () => closeExpiredDeadlines({ nowMs }));
  const snap = storeHolder.store.snapshot();
  return {
    result,
    u1: snap.attendance.commitments?.[key]?.u1,
    u1Count: snap.auction.members.u1.noConfirmCount,
    marker: snap.attendance.deadline_closed?.[key],
  };
}

export async function futureDeadlineSkipped() {
  const weekMonday = '2026-10-05';
  const date = '2026-10-07';
  const inst = dueInstance({ date, weekMonday });
  const key = inst.key;
  setup({
    instances: { [weekMonday]: { [key]: inst }, ['2026-09-28']: {}, ['2026-10-12']: {} },
    members: { u1: { isRaidRoster: true, status: 'Active', noConfirmCount: 0 } },
  });
  // Before deadline (Sun before Mon deadline)
  const nowMs = new Date('2026-10-05T12:00:00+08:00').getTime();
  const result = await runWithTenant(TENANT, () => closeExpiredDeadlines({ nowMs }));
  const snap = storeHolder.store.snapshot();
  return {
    result,
    commitment: snap.attendance.commitments?.[key],
    marker: snap.attendance.deadline_closed?.[key],
  };
}

export async function startOlderThan7DaysSkipped() {
  const weekMonday = '2026-09-07';
  const date = '2026-09-08';
  const inst = dueInstance({ date, weekMonday });
  const key = inst.key;
  setup({
    instances: {
      [weekMonday]: { [key]: inst },
      ['2026-09-14']: {},
      ['2026-09-21']: {},
    },
    members: { u1: { isRaidRoster: true, status: 'Active', noConfirmCount: 0 } },
  });
  const nowMs = new Date('2026-10-01T12:00:00+08:00').getTime(); // >7d after start
  const result = await runWithTenant(TENANT, () => closeExpiredDeadlines({ nowMs }));
  const snap = storeHolder.store.snapshot();
  return {
    result,
    commitment: snap.attendance.commitments?.[key],
    marker: snap.attendance.deadline_closed?.[key],
  };
}

export async function existingMarkerSkips() {
  const weekMonday = '2026-10-05';
  const date = '2026-10-07';
  const inst = dueInstance({ date, weekMonday });
  const key = inst.key;
  setup({
    instances: { [weekMonday]: { [key]: inst }, ['2026-09-28']: {}, ['2026-10-12']: {} },
    members: { u1: { isRaidRoster: true, status: 'Active', noConfirmCount: 0 } },
    closed: { [key]: { closedAt: 1, count: 0 } },
  });
  const nowMs = new Date('2026-10-08T12:00:00+08:00').getTime();
  const result = await runWithTenant(TENANT, () => closeExpiredDeadlines({ nowMs }));
  const snap = storeHolder.store.snapshot();
  return {
    result,
    commitment: snap.attendance.commitments?.[key],
    marker: snap.attendance.deadline_closed[key],
  };
}

export async function alreadyAnsweredNotRewritten() {
  const weekMonday = '2026-10-05';
  const date = '2026-10-07';
  const inst = dueInstance({ date, weekMonday });
  const key = inst.key;
  setup({
    instances: { [weekMonday]: { [key]: inst }, ['2026-09-28']: {}, ['2026-10-12']: {} },
    members: {
      c: { isRaidRoster: true, status: 'Active', noConfirmCount: 0 },
      l: { isRaidRoster: true, status: 'Active', noConfirmCount: 0 },
      n: { isRaidRoster: true, status: 'Active', noConfirmCount: 2 },
      open: { isRaidRoster: true, status: 'Active', noConfirmCount: 0 },
    },
    commitments: {
      [key]: {
        c: { status: 'Confirmed' },
        l: { status: 'Leave' },
        n: { status: 'NoConfirm' },
      },
    },
  });
  const nowMs = new Date('2026-10-08T12:00:00+08:00').getTime();
  await runWithTenant(TENANT, () => closeExpiredDeadlines({ nowMs }));
  const commits = storeHolder.store.snapshot().attendance.commitments[key];
  return { commits };
}

export function clockDoesNotNameCloseExpired() {
  const src = readFileSync(
    '/Users/adriandelossantos/Documents/Github/DynastyGuild/backend/src/discord-bot/client.js',
    'utf8'
  );
  const intervalIdx = src.indexOf('setInterval(() => {');
  const slice = intervalIdx >= 0 ? src.slice(intervalIdx, intervalIdx + 1200) : '';
  return {
    namesCloseExpired: /closeExpiredDeadlines/.test(slice),
    namesRefreshLeave: /maybeRefreshMonthlyLeaveCredits/.test(slice),
    honesty: 'asserted by reading onGatewayReady setInterval body; ticker is private (not imported index.js)',
  };
}

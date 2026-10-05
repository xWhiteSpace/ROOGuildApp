import { vi } from 'vitest';
import { patterns } from './registry.js';
import { createMemoryTenantStore } from '../support/memoryTenantStore.js';
import { runWithTenant, setCachedChannels, clearTenantCaches } from '../../backend/src/db/tenantContext.js';
import { buildAttendanceRaidAnnounce, buildRaidPhaseAnnounce } from '../../backend/src/games/ragnarok-origin/services/discordGenAnnounce.js';

patterns.phase1_get_ready = 'used';
patterns.raid_announce_silence = 'used';

const storeHolder = vi.hoisted(() => ({ store: null }));
const sends = vi.hoisted(() => ({
  gen: vi.fn(async () => ({ posted: true })),
  war: vi.fn(async () => ({ posted: true })),
}));
const cycle = vi.hoisted(() => ({ status: null }));

vi.mock('../../backend/src/db/database.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTenantStore: () => storeHolder.store,
  };
});

vi.mock('../../backend/src/utils/discordRateLimit.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    isDiscordCircuitOpen: () => false,
  };
});

vi.mock('../../backend/src/games/ragnarok-origin/timeWindow.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    readTenantConfiguration: async () => ({ isForceLocked: false }),
  };
});

vi.mock('../../backend/src/games/ragnarok-origin/raidTimeWindow.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRaidCycleStatus: () => cycle.status,
  };
});

vi.mock('../../backend/src/utils/guildTime.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getGuildWeekMinute: () => ({ absMinute: 500, dateStr: '2026-10-04' }),
  };
});

vi.mock('../../backend/src/games/ragnarok-origin/services/discordGenAnnounce.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    sendGenRoomMessage: (...args) => sends.gen(...args),
    sendWarAnnounceMessage: (...args) => sends.war(...args),
  };
});

const { maybeAnnounceRaidEvents } = await import('../../backend/src/discord-bot/raidEventAnnounce.js');

function baseStatus(overrides = {}) {
  return {
    needsSetup: false,
    isForceLocked: false,
    eventId: 'raid-evt-1',
    activeEventTitle: 'GvG Night',
    warDate: '2026-10-06',
    warStartTime: '21:00',
    timezone: 'Asia/Manila',
    announcementMinutes: { phase1: [500], phase2: null, phase3: null },
    ...overrides,
  };
}

async function runAnnounce(status, { channels = {} } = {}) {
  storeHolder.store = createMemoryTenantStore({});
  sends.gen.mockClear();
  sends.war.mockClear();
  cycle.status = status;
  const tenant = 'raid-announce-tenant';
  clearTenantCaches(tenant);
  setCachedChannels(tenant, channels);
  await runWithTenant(tenant, () => maybeAnnounceRaidEvents());
  return {
    genCalls: sends.gen.mock.calls.map((c) => c[0]),
    warCalls: sends.war.mock.calls.map((c) => c[0]),
  };
}

export async function duePhase1PostsGetReadyToGen() {
  const tenant = 'raid-announce-tenant';
  clearTenantCaches(tenant);
  setCachedChannels(tenant, {});
  const expected = runWithTenant(tenant, () => buildAttendanceRaidAnnounce({ eventDate: '2026-10-06' }));
  const { genCalls, warCalls } = await runAnnounce(baseStatus());
  return {
    expected,
    genCalls,
    warCalls,
    exactMatch: genCalls.length === 1 && genCalls[0] === expected,
    hasTitle: /GvG Night/.test(genCalls[0] || ''),
    hasWarStart: /21:00/.test(genCalls[0] || ''),
    hasJump: /Jump in at/.test(genCalls[0] || ''),
  };
}

const MAPPED_WAR = '123456789012345678';

export async function duePhase1MappedJumpIncludesWarAnnounce() {
  const tenant = 'raid-announce-tenant';
  clearTenantCaches(tenant);
  setCachedChannels(tenant, { warAnnounceChannelId: MAPPED_WAR });
  const expected = runWithTenant(tenant, () => buildAttendanceRaidAnnounce({ eventDate: '2026-10-06' }));
  const { genCalls, warCalls } = await runAnnounce(baseStatus(), {
    channels: { warAnnounceChannelId: MAPPED_WAR },
  });
  return {
    expected,
    genCalls,
    warCalls,
    exactMatch: genCalls.length === 1 && genCalls[0] === expected,
    hasJump: (genCalls[0] || '').includes(`Jump in at <#${MAPPED_WAR}>.`),
  };
}

export async function noScheduledPhasesSendsNothing() {
  const { genCalls, warCalls } = await runAnnounce(baseStatus({
    announcementMinutes: { phase1: [], phase2: null, phase3: null },
  }));
  return { genCalls, warCalls, silent: genCalls.length === 0 && warCalls.length === 0 };
}

export async function phase2Or3UsesWarAnnounceNotGetReady() {
  const expectedReady = buildAttendanceRaidAnnounce({ eventDate: '2026-10-06' });
  const expectedP2 = buildRaidPhaseAnnounce('p2', {
    eventTitle: 'GvG Night',
    eventDate: '2026-10-06',
    timeStart: '21:00',
  });
  const { genCalls, warCalls } = await runAnnounce(baseStatus({
    announcementMinutes: { phase1: [], phase2: 500, phase3: null },
  }));
  return {
    expectedReady,
    expectedP2,
    genCalls,
    warCalls,
    usedWar: warCalls.length === 1 && warCalls[0] === expectedP2,
    usedGetReady: genCalls.some((m) => m === expectedReady),
  };
}

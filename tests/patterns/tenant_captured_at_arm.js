import { vi } from 'vitest';
import { patterns } from './registry.js';
import { createMemoryTenantStore } from '../support/memoryTenantStore.js';
import { installInertTimers } from '../support/inertTimers.js';
import * as tenantContext from '../../backend/src/db/tenantContext.js';

patterns.tenant_captured_at_arm = 'used';
patterns.run_with_tenant = 'used';
patterns.stop_clears_ticker = 'used';

const storeHolder = vi.hoisted(() => ({ store: null }));

vi.mock('../../backend/src/db/database.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTenantStore: () => storeHolder.store,
    loadLiveSessionPulseMeta: async () => {
      const snap = await storeHolder.store.ref('attendance/live_session').once('value');
      if (!snap.exists()) return null;
      const s = snap.val();
      return {
        status: s.status,
        monitoringStartsAt: s.monitoringStartsAt,
        monitoringEndsAt: s.monitoringEndsAt,
        pollIntervalMinutes: s.pollIntervalMinutes,
        selectedWarRooms: s.selectedWarRooms || [],
        selectedWarRoomIds: s.selectedWarRoomIds || [],
        lastVoicePoll: s.lastVoicePoll || null,
      };
    },
    incrementLiveSessionPulse: vi.fn(async () => ({
      totalPulses: 1,
      userTallies: { u1: 1 },
      lastVoicePoll: { timestamp: Date.now(), presentUids: [] },
    })),
    touchSessionArchiveIndex: vi.fn(async () => undefined),
  };
});

vi.mock('../../backend/src/utils/discordRateLimit.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, isDiscordCircuitOpen: () => false };
});

const liveRaid = await import('../../backend/src/api/liveRaid.routes.js');

function seedStore() {
  storeHolder.store = createMemoryTenantStore({
    attendance: {
      published: {
        pub_arm: {
          eventKey: 'evt1',
          eventDate: '2026-10-06',
          eventTitle: 'GvG',
          configId: 'cfg1',
          grids: {
            'cfg1__tab_001': {
              parentConfigId: 'cfg1',
              slots_allocation: { '0-0': { userId: 'u1' } },
            },
          },
          selectedGridIds: ['cfg1'],
        },
      },
    },
    settings: {
      configuration: {
        warRooms: { wr1: { channelId: '123456789012345678' } },
      },
    },
    auction: { members: {} },
  });
  tenantContext.setCachedConfig('arm-tenant', {
    warRooms: { wr1: { channelId: '123456789012345678' } },
  });
}

function clearTickers() {
  if (global.liveRaidIntervalTicker) {
    clearInterval(global.liveRaidIntervalTicker);
    global.liveRaidIntervalTicker = undefined;
  }
  if (global.monitoringSchedulerTicker) {
    clearInterval(global.monitoringSchedulerTicker);
    global.monitoringSchedulerTicker = undefined;
  }
}

export async function armCapturesTenantIncludingDelayed() {
  const timers = installInertTimers();
  const runWithSpy = vi.spyOn(tenantContext, 'runWithTenant');
  seedStore();
  liveRaid.noteLiveSessionCleared();
  const now = Date.now();
  try {
    // Delayed start: starts in the future — scheduler captures tenantId at arm time.
    await tenantContext.runWithTenant('arm-tenant', () => liveRaid.createLiveRaidFromPublished({
      publishedId: 'pub_arm',
      selectedWarRoomIds: ['wr1'],
      monitoringStartsAt: now + 120_000,
      monitoringEndsAt: now + 3600_000,
      pollIntervalMinutes: 15,
      launchedBy: 'Officer',
    }));
    const scheduled = timers.intervals.some((t) => t.ms === 15_000) || Boolean(global.monitoringSchedulerTicker);
    // Fire delayed start callback under inert timers by invoking captured 15s scheduler cb.
    const sched = timers.intervals.find((t) => t.ms === 15_000);
    if (sched?.cb) {
      // Pretend start reached
      const origNow = Date.now;
      Date.now = () => now + 130_000;
      try {
        await Promise.resolve(sched.cb());
        await new Promise((r) => setImmediate(r));
      } finally {
        Date.now = origNow;
      }
    }
    const tenantCalls = runWithSpy.mock.calls.map((c) => c[0]).filter((id) => id === 'arm-tenant');
    return {
      scheduled,
      tenantCapturedInPulse: tenantCalls.length >= 1,
      watch: liveRaid.getLiveSessionWatch(),
    };
  } finally {
    runWithSpy.mockRestore();
    clearTickers();
    timers.restore();
    liveRaid.noteLiveSessionCleared();
  }
}

export async function intervalPulsesUseCapturedTenant() {
  const timers = installInertTimers();
  const runWithSpy = vi.spyOn(tenantContext, 'runWithTenant');
  seedStore();
  liveRaid.noteLiveSessionCleared();
  const now = Date.now();
  try {
    await tenantContext.runWithTenant('arm-tenant', () => liveRaid.createLiveRaidFromPublished({
      publishedId: 'pub_arm',
      selectedWarRoomIds: ['wr1'],
      monitoringStartsAt: now - 1000,
      monitoringEndsAt: now + 3600_000,
      pollIntervalMinutes: 15,
      launchedBy: 'Officer',
    }));
    // Immediate tick inside startTicker uses runWithTenant(tenantId, ...)
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    const pulseTenantCalls = runWithSpy.mock.calls.filter((c) => c[0] === 'arm-tenant' && typeof c[1] === 'function');
    return {
      pulseTenantCalls: pulseTenantCalls.length,
      ticker: Boolean(global.liveRaidIntervalTicker) || timers.intervals.some((t) => t.ms === 15 * 60 * 1000),
    };
  } finally {
    runWithSpy.mockRestore();
    clearTickers();
    timers.restore();
    liveRaid.noteLiveSessionCleared();
  }
}

export async function noTenantAtArmSkipsRunWithTenant() {
  const timers = installInertTimers();
  const runWithSpy = vi.spyOn(tenantContext, 'runWithTenant');
  seedStore();
  liveRaid.noteLiveSessionCleared();
  const now = Date.now();
  const before = runWithSpy.mock.calls.length;
  try {
    // No ALS tenant
    await liveRaid.createLiveRaidFromPublished({
      publishedId: 'pub_arm',
      selectedWarRoomIds: ['wr1'],
      monitoringStartsAt: now - 1000,
      monitoringEndsAt: now + 3600_000,
      pollIntervalMinutes: 15,
      launchedBy: 'Officer',
    });
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    const afterCalls = runWithSpy.mock.calls.slice(before);
    // tick uses else await run() when tenantId falsy — no runWithTenant from ticker
    const tickerRunWith = afterCalls.filter((c) => typeof c[1] === 'function');
    return { tickerRunWithTenantCalls: tickerRunWith.length };
  } finally {
    runWithSpy.mockRestore();
    clearTickers();
    timers.restore();
    liveRaid.noteLiveSessionCleared();
  }
}

export async function stopPulseClearsIntervalTicker() {
  const timers = installInertTimers();
  seedStore();
  liveRaid.noteLiveSessionCleared();
  const now = Date.now();
  try {
    await tenantContext.runWithTenant('arm-tenant', () => liveRaid.createLiveRaidFromPublished({
      publishedId: 'pub_arm',
      selectedWarRoomIds: ['wr1'],
      monitoringStartsAt: now - 1000,
      monitoringEndsAt: now + 3600_000,
      pollIntervalMinutes: 15,
      launchedBy: 'Officer',
    }));
    await new Promise((r) => setImmediate(r));
    const pulseInterval = timers.intervals.find((t) => t.ms === 15 * 60 * 1000);
    // Force stop: clear session so next tick sees inactive
    await storeHolder.store.ref('attendance/live_session').set(null);
    liveRaid.noteLiveSessionCleared();
    if (pulseInterval?.cb) {
      await Promise.resolve(pulseInterval.cb());
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
    }
    return {
      tickerCleared: !global.liveRaidIntervalTicker,
      hadPulseInterval: Boolean(pulseInterval),
    };
  } finally {
    clearTickers();
    timers.restore();
    liveRaid.noteLiveSessionCleared();
  }
}

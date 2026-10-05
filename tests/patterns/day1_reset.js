import { vi } from 'vitest';
import { patterns } from './registry.js';
import { createMemoryTenantStore } from '../support/memoryTenantStore.js';
import { runWithTenant, setCachedConfig, clearTenantCaches } from '../../backend/src/db/tenantContext.js';

patterns.day1_reset = 'used';
patterns.marker_once = 'used';
patterns.skip_ineligible = 'used';

const storeHolder = vi.hoisted(() => ({ store: null }));

vi.mock('../../backend/src/db/database.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTenantStore: () => storeHolder.store,
  };
});

vi.mock('../../backend/src/games/ragnarok-origin/services/scheduleService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    resolveGuildTimezone: async () => 'Asia/Manila',
  };
});

const { maybeRefreshMonthlyLeaveCredits } = await import(
  '../../backend/src/games/ragnarok-origin/services/attendanceDecision.js'
);

function setup(members, { markerYm = null, config = { defaultLeaveCredits: 4 } } = {}) {
  clearTenantCaches('leave-refresh');
  setCachedConfig('leave-refresh', config);
  const attendance = {};
  if (markerYm) {
    attendance.leave_credit_refresh = {
      [markerYm]: { ranAt: 1, defaultCredits: 4, count: 1 },
    };
  }
  storeHolder.store = createMemoryTenantStore({
    auction: { members },
    settings: { configuration: config },
    attendance,
  });
}

/** Guild day 1 in Asia/Manila: 2026-10-01 12:00 PHT */
const DAY1 = new Date('2026-10-01T12:00:00+08:00');
/** Not day 1: 2026-10-04 */
const DAY4 = new Date('2026-10-04T12:00:00+08:00');

export async function day1ResetsEligible() {
  setup({
    u1: { isRaidRoster: true, status: 'Active', leaveCreditsRemaining: 1 },
    ghost: { isRaidRoster: true, status: 'Ghost', leaveCreditsRemaining: 1 },
    casual: { isRaidRoster: false, status: 'Active', leaveCreditsRemaining: 1 },
  });
  const result = await runWithTenant('leave-refresh', () => maybeRefreshMonthlyLeaveCredits({ now: DAY1 }));
  const snap = storeHolder.store.snapshot();
  return {
    result,
    u1: snap.auction.members.u1.leaveCreditsRemaining,
    ghost: snap.auction.members.ghost.leaveCreditsRemaining,
    casual: snap.auction.members.casual.leaveCreditsRemaining,
    marker: snap.attendance?.leave_credit_refresh?.['2026-10'],
  };
}

export async function notDay1Skipped() {
  setup({
    u1: { isRaidRoster: true, status: 'Active', leaveCreditsRemaining: 1 },
  });
  const result = await runWithTenant('leave-refresh', () => maybeRefreshMonthlyLeaveCredits({ now: DAY4 }));
  const snap = storeHolder.store.snapshot();
  return {
    result,
    u1: snap.auction.members.u1.leaveCreditsRemaining,
    markers: snap.attendance?.leave_credit_refresh || null,
  };
}

export async function existingMarkerSkipped() {
  setup({
    u1: { isRaidRoster: true, status: 'Active', leaveCreditsRemaining: 1 },
  }, { markerYm: '2026-10' });
  const result = await runWithTenant('leave-refresh', () => maybeRefreshMonthlyLeaveCredits({ now: DAY1 }));
  const snap = storeHolder.store.snapshot();
  return {
    result,
    u1: snap.auction.members.u1.leaveCreditsRemaining,
    marker: snap.attendance.leave_credit_refresh['2026-10'],
  };
}

export async function runStoresYmMarker() {
  setup({
    u1: { isRaidRoster: true, status: 'Active', leaveCreditsRemaining: 0 },
    u2: { isRaidRoster: true, status: 'Active', leaveCreditsRemaining: 0 },
  }, { config: { defaultLeaveCredits: 4 } });
  const result = await runWithTenant('leave-refresh', () => maybeRefreshMonthlyLeaveCredits({ now: DAY1 }));
  const marker = storeHolder.store.snapshot().attendance.leave_credit_refresh['2026-10'];
  return { result, marker };
}

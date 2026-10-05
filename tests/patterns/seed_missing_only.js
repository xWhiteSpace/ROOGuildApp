import { vi } from 'vitest';
import { patterns } from './registry.js';
import { createMemoryTenantStore } from '../support/memoryTenantStore.js';
import { runWithTenant, setCachedConfig, clearTenantCaches } from '../../backend/src/db/tenantContext.js';

patterns.seed_missing_only = 'used';
patterns.skip_ghost = 'used';
patterns.seeded_count = 'used';

const storeHolder = vi.hoisted(() => ({ store: null }));
const missingHolder = vi.hoisted(() => ({ missing: true }));

vi.mock('../../backend/src/db/database.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTenantStore: () => storeHolder.store,
    raidRosterMissingLeaveCredits: async () => missingHolder.missing,
  };
});

const { seedMissingLeaveCredits, DEFAULT_LEAVE_CREDITS } = await import(
  '../../backend/src/games/ragnarok-origin/services/attendanceDecision.js'
);

function seedMembers(members, config = {}) {
  clearTenantCaches('seed-tenant');
  setCachedConfig('seed-tenant', config);
  storeHolder.store = createMemoryTenantStore({
    auction: { members },
    settings: { configuration: config },
  });
}

export async function eligibleNonIntegerSeeded() {
  missingHolder.missing = true;
  seedMembers({
    u1: { isRaidRoster: true, status: 'Active', leaveCreditsRemaining: 'x', noConfirmCount: 'bad' },
  }, { defaultLeaveCredits: 5 });
  const result = await runWithTenant('seed-tenant', () => seedMissingLeaveCredits());
  const m = storeHolder.store.snapshot().auction.members.u1;
  return { result, member: m, defaultCredits: 5 };
}

export async function missingDefaultStoresThree() {
  missingHolder.missing = true;
  seedMembers({
    u1: { isRaidRoster: true, status: 'Active' },
  }, {});
  const result = await runWithTenant('seed-tenant', () => seedMissingLeaveCredits());
  const m = storeHolder.store.snapshot().auction.members.u1;
  return { result, member: m, fallback: DEFAULT_LEAVE_CREDITS };
}

export async function existingIntegerNotOverwritten() {
  missingHolder.missing = true;
  seedMembers({
    u1: { isRaidRoster: true, status: 'Active', leaveCreditsRemaining: 7, noConfirmCount: 2 },
    u2: { isRaidRoster: true, status: 'Active', leaveCreditsRemaining: null },
  }, { defaultLeaveCredits: 3 });
  await runWithTenant('seed-tenant', () => seedMissingLeaveCredits());
  const snap = storeHolder.store.snapshot().auction.members;
  return { u1: snap.u1, u2: snap.u2 };
}

export async function existingNoConfirmNotReset() {
  missingHolder.missing = true;
  seedMembers({
    u1: {
      isRaidRoster: true,
      status: 'Active',
      leaveCreditsRemaining: undefined,
      noConfirmCount: 4,
    },
  }, { defaultLeaveCredits: 3 });
  await runWithTenant('seed-tenant', () => seedMissingLeaveCredits());
  return { member: storeHolder.store.snapshot().auction.members.u1 };
}

export async function ghostAndNonRaidNotSeeded() {
  missingHolder.missing = true;
  seedMembers({
    ghost: { isRaidRoster: true, status: 'Ghost' },
    casual: { isRaidRoster: false, status: 'Active', leaveCreditsRemaining: 'x' },
  }, { defaultLeaveCredits: 3 });
  await runWithTenant('seed-tenant', () => seedMissingLeaveCredits());
  return { members: storeHolder.store.snapshot().auction.members };
}

export async function nonOnboardedHonesty() {
  // Honesty: seedMissingLeaveCredits has no onboarded check; boot gates via forEachOnboardedTenant in index.js.
  missingHolder.missing = true;
  seedMembers({
    u1: { isRaidRoster: true, status: 'Active' },
  }, { defaultLeaveCredits: 3 });
  const result = await runWithTenant('not-onboarded-tenant', () => seedMissingLeaveCredits());
  return {
    result,
    seededAnyway: result.seeded > 0,
    honesty: 'onboarded gate is forEachOnboardedTenant at boot (index.js), not inside seedMissingLeaveCredits',
  };
}

export async function resultSeededCount() {
  missingHolder.missing = true;
  seedMembers({
    u1: { isRaidRoster: true, status: 'Active' },
    u2: { isRaidRoster: true, status: 'Active', leaveCreditsRemaining: 'na' },
  }, { defaultLeaveCredits: 3 });
  const result = await runWithTenant('seed-tenant', () => seedMissingLeaveCredits());
  // Honesty: seeded is Object.keys(updates).length (field writes), not distinct member count.
  return { result, honesty: 'seeded counts update keys (leaveCreditsRemaining and maybe noConfirmCount), not members' };
}

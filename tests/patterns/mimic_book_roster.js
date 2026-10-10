import { vi } from 'vitest';
import { patterns } from './registry.js';
import { patchChangedAllocations, rosterNamesFromMembers } from '@guildname/shared/mimicBookRoster';
import { RAID_ROSTER_SQL } from '../../backend/src/db/database.js';
import { dispatch } from '../support/dispatch.js';

patterns.mimic_book_roster = 'used';

const captured = vi.hoisted(() => ({ calls: [] }));

vi.mock('../../backend/src/db/database.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadMembersProjected: async (view, _tenantId, options = {}) => {
      captured.calls.push({ view, raidRosterOnly: options.raidRosterOnly === true });
      if (options.raidRosterOnly) {
        return { u1: { uid: 'u1', displayName: 'Ada', jobCode: 'KN', isRaidRoster: true } };
      }
      return {
        u1: { uid: 'u1', displayName: 'Ada', jobCode: 'KN', isRaidRoster: true },
        u2: { uid: 'u2', displayName: 'Ben', jobCode: 'WI', isRaidRoster: false },
      };
    },
  };
});

const attendanceRoutes = (await import('../../backend/src/api/attendance.routes.js')).default;

function session() {
  return {
    user: {
      id: 'u1',
      username: 'Ada',
      displayName: 'Ada',
      currentTenantId: 'mimic-roster-tenant',
      isOfficer: true,
      roles: ['Officer'],
    },
    currentTenantId: 'mimic-roster-tenant',
  };
}

export function raidRosterSqlPredicate() {
  return RAID_ROSTER_SQL;
}

export function sortedRaidNamesSkipEmpty() {
  return rosterNamesFromMembers({
    z: { displayName: 'Zed', isRaidRoster: true },
    a: { displayName: 'Ada', isRaidRoster: true },
    blank: { displayName: '   ', isRaidRoster: true },
    pool: { displayName: 'Ben', isRaidRoster: false },
    missing: { displayName: 'Cara' },
  });
}

export function oneSlotPatchKeepsOtherItems() {
  const prev = {
    puppet: { selected: ['', ''] },
    card: { selected: ['111'] },
  };
  const next = {
    puppet: { selected: ['222', ''] },
    card: { selected: ['111'] },
  };
  const patched = patchChangedAllocations(prev, next);
  return { prev, patched, sameCardRef: patched.card === prev.card };
}

export function unchangedAllocationsKeepPrevRef() {
  const prev = { puppet: { selected: ['111'] } };
  const patched = patchChangedAllocations(prev, { puppet: { selected: ['111'] } });
  return { prev, patched };
}

export function newItemAllocationIsAdded() {
  const prev = { puppet: { selected: [''] } };
  const patched = patchChangedAllocations(prev, {
    puppet: { selected: [''] },
    card: { selected: { 0: '333' } },
  });
  return patched;
}

async function getMembers(path) {
  captured.calls = [];
  return dispatch(attendanceRoutes, {
    method: 'GET',
    path,
    session: session(),
  });
}

export async function cardRosterRaidReturnsRaidOnly() {
  const res = await getMembers('/members?view=card&roster=raid');
  return { res, calls: captured.calls.slice() };
}

export async function unfilteredCardStillReturnsAll() {
  const res = await getMembers('/members?view=card');
  return { res, calls: captured.calls.slice() };
}

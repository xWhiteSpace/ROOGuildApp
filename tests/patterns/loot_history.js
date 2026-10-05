import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { runWithTenant } from '../../backend/src/db/tenantContext.js';
import { dispatch } from '../support/dispatch.js';

patterns.loot_history = 'used';
patterns.newest_first = 'used';

const TENANT_ID = 'loot-tenant-1';
const listMock = vi.hoisted(() => ({
  forDate: vi.fn(async () => []),
}));

vi.mock('../../backend/src/db/database.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTenantStore: () => ({
      ref: () => ({
        once: async () => ({ exists: () => false, val: () => null }),
      }),
    }),
    listLootHistoryForDate: (...a) => listMock.forDate(...a),
    listLootHistoryDates: async () => [],
  };
});

const requestRoutes = (await import('../../backend/src/api/request.routes.js')).default;

function session() {
  return {
    user: { id: '111', username: 'Ada', displayName: 'Ada', currentTenantId: TENANT_ID },
    currentTenantId: TENANT_ID,
  };
}

export async function newestFirstLootRows() {
  return withEnv({}, async () => {
    listMock.forDate.mockResolvedValueOnce([
      { id: '2', date: '10/03/2026', event: 'Weekly', item: 'Puppet', quantity: 2 },
      { id: '1', date: '10/01/2026', event: 'Weekly', item: 'Card', quantity: 1 },
    ]);
    return runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'GET',
      path: '/loot-history?date=2026-10-03',
      session: session(),
    }));
  });
}

export async function emptyLootHistory() {
  return withEnv({}, async () => {
    listMock.forDate.mockResolvedValueOnce([]);
    return runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'GET',
      path: '/loot-history?date=2026-10-03',
      session: session(),
    }));
  });
}

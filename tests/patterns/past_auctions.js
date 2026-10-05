import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { runWithTenant } from '../../backend/src/db/tenantContext.js';
import { dispatch } from '../support/dispatch.js';

patterns.past_auctions = 'used';
patterns.members_map = 'used';

const TENANT_ID = 'past-tenant-1';
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
    listPastAuctionsForDate: (...a) => listMock.forDate(...a),
    listPastAuctionDates: async () => [],
  };
});

const requestRoutes = (await import('../../backend/src/api/request.routes.js')).default;

function session() {
  return {
    user: { id: '111', username: 'Ada', displayName: 'Ada', currentTenantId: TENANT_ID },
    currentTenantId: TENANT_ID,
  };
}

export async function awardsNewestFirst() {
  return withEnv({}, async () => {
    listMock.forDate.mockResolvedValueOnce([
      { id: '2', date: '10/03/2026', item: 'Puppet', userId: '111', quantity: 1 },
      { id: '1', date: '10/01/2026', item: 'Card', userId: '222', quantity: 2 },
    ]);
    return runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'GET',
      path: '/past-auctions?date=2026-10-03',
      session: session(),
    }));
  });
}

export async function emptyAwardsStillOk() {
  return withEnv({}, async () => {
    listMock.forDate.mockResolvedValueOnce([]);
    return runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'GET',
      path: '/past-auctions?date=2026-10-03',
      session: session(),
    }));
  });
}

import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { runWithTenant } from '../../backend/src/db/tenantContext.js';
import { dispatch } from '../support/dispatch.js';

patterns.request_history = 'used';
patterns.newest_first = 'used';

const TENANT_ID = 'hist-tenant-1';
const listMock = vi.hoisted(() => ({
  impl: vi.fn(async () => ({ history: [], total: 0, page: 1, limit: 60 })),
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
    listAuctionHistory: (...a) => listMock.impl(...a),
  };
});

const requestRoutes = (await import('../../backend/src/api/request.routes.js')).default;

function session() {
  return {
    user: { id: '111', username: 'Ada', displayName: 'Ada', currentTenantId: TENANT_ID },
    currentTenantId: TENANT_ID,
  };
}

export async function newestFirstHistory() {
  return withEnv({}, async () => {
    listMock.impl.mockResolvedValueOnce({
      history: [
        { id: 'b', date: '10/03/2026', member: 'Ada', item: 'Puppet' },
        { id: 'a', date: '10/01/2026', member: 'Ada', item: 'Card' },
      ],
      total: 2,
      page: 1,
      limit: 60,
    });
    return runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'GET',
      path: '/request-history',
      session: session(),
    }));
  });
}

export async function emptyHistoryArray() {
  return withEnv({}, async () => {
    listMock.impl.mockResolvedValueOnce({ history: [], total: 0, page: 1, limit: 60 });
    return runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'GET',
      path: '/request-history',
      session: session(),
    }));
  });
}

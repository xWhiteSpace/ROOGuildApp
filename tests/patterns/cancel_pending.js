import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { createMemoryTenantStore, auctionRequestsFromStore } from '../support/memoryTenantStore.js';
import { runWithTenant } from '../../backend/src/db/tenantContext.js';

patterns.cancel_pending = 'used';
patterns.phase3_423 = 'used';

const TENANT_ID = 'cancel-tenant-1';
const CONFIG = {
  timezone: 'Asia/Manila',
  items: [{ id: 'puppet', name: 'Puppet', colorTheme: 'slate', isHighValue: true }],
  events: { evt1: { title: 'Weekly', loots: { puppet: 2 } } },
};

const gate = vi.hoisted(() => ({
  current: {
    isGateOpen: true,
    currentSessionLabel: 'Open',
    nextStatusChangeMessage: 'later',
    currentPhase: 1,
    phaseIntervals: {},
    activeEventId: 'evt1',
    activeEventTitle: 'Weekly',
    helpEmbedUrl: '',
    announcementMinutes: { phase1: [], phase2: null, phase3: null },
    timezone: 'Asia/Manila',
  },
}));

const storeHolder = vi.hoisted(() => ({ store: null }));

vi.mock('../../backend/src/games/ragnarok-origin/timeWindow.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getGateStatusDetails: () => gate.current,
    readTenantConfiguration: async () => CONFIG,
  };
});

vi.mock('../../backend/src/db/database.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTenantStore: () => storeHolder.store,
    loadAuctionRequests: async (filters) => auctionRequestsFromStore(storeHolder.store, filters),
  };
});

const { cancelPending, RequestDeckError } = await import('../../backend/src/games/ragnarok-origin/services/requestDeck.js');
const requestRoutes = (await import('../../backend/src/api/request.routes.js')).default;
const { dispatch } = await import('../support/dispatch.js');

function seedPending() {
  storeHolder.store = createMemoryTenantStore({
    settings: { configuration: CONFIG },
    auction: {
      members: { '111': { displayName: 'Ada', status: 'Active' } },
      web_requests: {
        r1: {
          id: 'r1',
          userId: '111',
          itemId: 'puppet',
          item: 'Puppet',
          quantity: 2,
          applicationStatus: 'Requested',
          selectionStatus: 'Pending',
        },
      },
    },
  });
}

function canceledDeltas() {
  return Object.values(storeHolder.store.webRequests()).filter(
    (r) => r.applicationStatus === 'Canceled' && r.selectionStatus === 'Pending',
  );
}

export async function allowedPhaseCancelsFullPending() {
  return withEnv({}, async () => {
    seedPending();
    gate.current = { ...gate.current, currentPhase: 1 };
    const result = await runWithTenant(TENANT_ID, () => cancelPending('111', 'Ada', { itemId: 'puppet', itemName: 'Puppet' }));
    return { result, canceled: canceledDeltas(), all: storeHolder.store.webRequests() };
  });
}

export async function phase3DoesNotCancel() {
  return withEnv({}, async () => {
    seedPending();
    gate.current = { ...gate.current, currentPhase: 3 };
    const before = storeHolder.store.webRequests();
    let error = null;
    try {
      await runWithTenant(TENANT_ID, () => cancelPending('111', 'Ada', { itemId: 'puppet', itemName: 'Puppet' }));
    } catch (err) {
      error = err;
    }
    return { error, before, after: storeHolder.store.webRequests(), isDeckError: error instanceof RequestDeckError };
  });
}

export async function missingItemIdentityDoesNotCancel() {
  return withEnv({}, async () => {
    seedPending();
    gate.current = { ...gate.current, currentPhase: 1 };
    const beforeKeys = Object.keys(storeHolder.store.webRequests());
    // cancelPending no-ops when identity does not match pending rows (no 400 in unit seam).
    const result = await runWithTenant(TENANT_ID, () => cancelPending('111', 'Ada', {}));
    const http = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/cancel',
      session: {
        user: { id: '111', username: 'Ada', displayName: 'Ada', currentTenantId: TENANT_ID },
        currentTenantId: TENANT_ID,
      },
      body: {},
    }));
    return {
      result,
      http,
      beforeKeys,
      canceled: canceledDeltas(),
      afterKeys: Object.keys(storeHolder.store.webRequests()),
    };
  });
}

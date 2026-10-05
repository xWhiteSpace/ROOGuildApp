import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { createMemoryTenantStore, auctionRequestsFromStore } from '../support/memoryTenantStore.js';
import { setCachedConfig } from '../../backend/src/db/tenantContext.js';
import { runWithTenant } from '../../backend/src/db/tenantContext.js';

patterns.request_lobby = 'used';
patterns.shared_builder = 'used';
patterns.member_scope = 'used';

const TENANT_ID = 'lobby-tenant-1';
const CONFIG = {
  timezone: 'Asia/Manila',
  isForceLocked: false,
  items: [
    { id: 'puppet', name: 'Puppet', colorTheme: 'slate', isHighValue: true },
    { id: 'card', name: 'Card', colorTheme: 'blue', isHighValue: false },
  ],
  events: {
    evt1: { title: 'Weekly', loots: { puppet: 2, card: 3 } },
  },
  adminRoles: ['Officer'],
};

const gate = vi.hoisted(() => ({
  current: {
    isGateOpen: true,
    currentSessionLabel: 'Weekly Registration Open',
    nextStatusChangeMessage: 'Closes later',
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
    lobbyFingerprint: async () => 'unit-fp',
    loadMembersByIds: async (ids) => {
      const members = storeHolder.store.members();
      const out = {};
      for (const id of ids || []) if (members[id]) out[id] = members[id];
      return out;
    },
  };
});

const { buildRequestLobby } = await import('../../backend/src/games/ragnarok-origin/services/requestDeck.js');
const requestRoutes = (await import('../../backend/src/api/request.routes.js')).default;
const { dispatch } = await import('../support/dispatch.js');

function seedStore() {
  storeHolder.store = createMemoryTenantStore({
    settings: { configuration: CONFIG },
    auction: {
      members: {
        '111': { displayName: 'Ada', status: 'Active' },
        '222': { displayName: 'Ben', status: 'Active' },
      },
      web_requests: {
        ra: {
          id: 'ra',
          userId: '111',
          itemId: 'puppet',
          item: 'Puppet',
          quantity: 1,
          applicationStatus: 'Requested',
          selectionStatus: 'Pending',
        },
        rb: {
          id: 'rb',
          userId: '222',
          itemId: 'puppet',
          item: 'Puppet',
          quantity: 2,
          applicationStatus: 'Requested',
          selectionStatus: 'Pending',
        },
      },
    },
  });
  setCachedConfig(TENANT_ID, CONFIG);
}

export async function authenticatedLobbyForMember() {
  return withEnv({}, async () => {
    seedStore();
    gate.current = { ...gate.current, isGateOpen: true, currentPhase: 1, activeEventId: 'evt1' };
    return runWithTenant(TENANT_ID, () => buildRequestLobby('111', 'Ada'));
  });
}

export async function unauthenticatedInitRefused() {
  return withEnv({}, async () => {
    seedStore();
    return dispatch(requestRoutes, {
      method: 'GET',
      path: '/init',
      session: {},
    });
  });
}

export async function httpAndBuilderShareLobby() {
  return withEnv({}, async () => {
    seedStore();
    gate.current = { ...gate.current, isGateOpen: true, currentPhase: 1, activeEventId: 'evt1' };
    const built = await runWithTenant(TENANT_ID, () => buildRequestLobby('111', 'Ada'));
    const http = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'GET',
      path: '/init',
      session: {
        user: { id: '111', username: 'Ada', displayName: 'Ada', currentTenantId: TENANT_ID },
        currentTenantId: TENANT_ID,
      },
    }));
    return { built, http };
  });
}

export async function lobbyScopedToMemberA() {
  return withEnv({}, async () => {
    seedStore();
    gate.current = { ...gate.current, isGateOpen: true, currentPhase: 1, activeEventId: 'evt1' };
    const a = await runWithTenant(TENANT_ID, () => buildRequestLobby('111', 'Ada'));
    const b = await runWithTenant(TENANT_ID, () => buildRequestLobby('222', 'Ben'));
    return { a, b };
  });
}

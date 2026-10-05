import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { createMemoryTenantStore, auctionRequestsFromStore } from '../support/memoryTenantStore.js';
import { runWithTenant } from '../../backend/src/db/tenantContext.js';

patterns.submit_selections = 'used';
patterns.gate_423 = 'used';
patterns.pending_delta = 'used';

const TENANT_ID = 'submit-tenant-1';
const CONFIG = {
  timezone: 'Asia/Manila',
  isForceLocked: false,
  items: [
    { id: 'puppet', name: 'Puppet', colorTheme: 'slate', isHighValue: true },
  ],
  events: { evt1: { title: 'Weekly', loots: { puppet: 2 } } },
  adminRoles: ['Officer'],
};

const gate = vi.hoisted(() => ({
  current: {
    isGateOpen: true,
    currentSessionLabel: 'Open',
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
    loadMembersByIds: async () => ({}),
    lobbyFingerprint: async () => 'fp',
  };
});

const {
  submitSelections,
  RequestDeckError,
  buildRequestLobby,
} = await import('../../backend/src/games/ragnarok-origin/services/requestDeck.js');
const { handleRequestDeckInteraction } = await import('../../backend/src/games/ragnarok-origin/services/discordRequestDeck.js');
const requestRoutes = (await import('../../backend/src/api/request.routes.js')).default;
const { dispatch } = await import('../support/dispatch.js');

function seed(members = { '111': { displayName: 'Ada', status: 'Active' } }, web_requests = {}) {
  storeHolder.store = createMemoryTenantStore({
    settings: { configuration: CONFIG },
    auction: { members, web_requests },
  });
}

function pendingDeltas() {
  return Object.values(storeHolder.store.webRequests()).filter(
    (r) => r.selectionStatus === 'Pending'
      && (r.applicationStatus === 'Requested' || r.applicationStatus === 'Canceled'),
  );
}

export async function openGateWritesPendingDeltas() {
  return withEnv({}, async () => {
    seed();
    gate.current = { ...gate.current, isGateOpen: true, activeEventId: 'evt1' };
    const before = pendingDeltas().length;
    const result = await runWithTenant(TENANT_ID, () => submitSelections('111', 'Ada', { puppet: 1 }));
    const lobby = await runWithTenant(TENANT_ID, () => buildRequestLobby('111', 'Ada'));
    return { result, lobby, before, deltas: pendingDeltas(), store: storeHolder.store };
  });
}

export async function closedGateRefusesSelections() {
  return withEnv({}, async () => {
    seed();
    gate.current = { ...gate.current, isGateOpen: false };
    const before = storeHolder.store.webRequests();
    let error = null;
    try {
      await runWithTenant(TENANT_ID, () => submitSelections('111', 'Ada', { puppet: 1 }));
    } catch (err) {
      error = err;
    }
    return { error, before, after: storeHolder.store.webRequests(), isDeckError: error instanceof RequestDeckError };
  });
}

export async function emptySelectionsRefused() {
  return withEnv({}, async () => {
    seed();
    gate.current = { ...gate.current, isGateOpen: true };
    const before = Object.keys(storeHolder.store.webRequests()).length;
    let error = null;
    try {
      await runWithTenant(TENANT_ID, () => submitSelections('111', 'Ada', {}));
    } catch (err) {
      error = err;
    }
    return { error, before, after: Object.keys(storeHolder.store.webRequests()).length, isDeckError: error instanceof RequestDeckError };
  });
}

export async function overCapRejected() {
  return withEnv({}, async () => {
    seed();
    gate.current = { ...gate.current, isGateOpen: true, activeEventId: 'evt1' };
    const before = Object.keys(storeHolder.store.webRequests()).length;
    let error = null;
    try {
      await runWithTenant(TENANT_ID, () => submitSelections('111', 'Ada', { puppet: 99 }));
    } catch (err) {
      error = err;
    }
    return { error, before, after: Object.keys(storeHolder.store.webRequests()).length, isDeckError: error instanceof RequestDeckError };
  });
}

export async function missingMemberRefusedOnDiscordCard() {
  return withEnv({}, async () => {
    seed({}, {});
    gate.current = { ...gate.current, isGateOpen: true };
    const replies = [];
    const interaction = {
      user: { id: '999', username: 'Ghost' },
      customId: 'reqcard:submit',
      isStringSelectMenu: () => false,
      editReply: async (payload) => { replies.push(payload); return payload; },
    };
    await runWithTenant(TENANT_ID, () => handleRequestDeckInteraction(interaction));
    return { replies, webRequests: storeHolder.store.webRequests() };
  });
}

export async function httpAndDiscordShareSubmitWriter() {
  return withEnv({}, async () => {
    seed();
    gate.current = { ...gate.current, isGateOpen: true, activeEventId: 'evt1' };
    const http = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'POST',
      path: '/submit',
      session: {
        user: { id: '111', username: 'Ada', displayName: 'Ada', currentTenantId: TENANT_ID },
        currentTenantId: TENANT_ID,
      },
      body: { selections: { puppet: 1 } },
    }));
    const httpDeltas = pendingDeltas();
    // Discord path calls the same submitSelections export (source + runtime).
    const direct = await runWithTenant(TENANT_ID, () => submitSelections('111', 'Ada', { puppet: 2 }));
    return {
      http,
      direct,
      httpDeltas,
      afterDirect: pendingDeltas(),
      writerName: submitSelections.name,
    };
  });
}

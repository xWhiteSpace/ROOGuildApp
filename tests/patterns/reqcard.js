import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { createMemoryTenantStore, auctionRequestsFromStore } from '../support/memoryTenantStore.js';
import { runWithTenant } from '../../backend/src/db/tenantContext.js';

patterns.reqcard = 'used';
patterns.shared_deck = 'used';

const TENANT_ID = 'reqcard-tenant-1';
const CONFIG = {
  timezone: 'Asia/Manila',
  isForceLocked: false,
  items: [{ id: 'puppet', name: 'Puppet', colorTheme: 'slate', isHighValue: true }],
  events: { evt1: { title: 'Weekly', loots: { puppet: 2 } } },
  adminRoles: ['Officer'],
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
    loadMembersByIds: async () => ({}),
  };
});

const { handleRequestDeckInteraction } = await import('../../backend/src/games/ragnarok-origin/services/discordRequestDeck.js');
const { submitSelections, cancelPending } = await import('../../backend/src/games/ragnarok-origin/services/requestDeck.js');

function seed({ forceLocked = false, members = true, pending = false } = {}) {
  gate.current = { ...gate.current, isGateOpen: true, currentPhase: 1, activeEventId: 'evt1' };
  const configuration = { ...CONFIG, isForceLocked: forceLocked };
  storeHolder.store = createMemoryTenantStore({
    settings: { configuration },
    auction: {
      members: members
        ? { '111': { displayName: 'Ada', status: 'Active' } }
        : {},
      web_requests: pending
        ? {
            r1: {
              id: 'r1',
              userId: '111',
              itemId: 'puppet',
              item: 'Puppet',
              quantity: 1,
              applicationStatus: 'Requested',
              selectionStatus: 'Pending',
            },
          }
        : {},
    },
  });
}

function makeInteraction({ customId, values = [], isSelect = false, userId = '111' }) {
  const replies = [];
  const interaction = {
    user: { id: userId, username: 'Ada', globalName: 'Ada' },
    member: { nickname: 'Ada', displayName: 'Ada' },
    customId,
    values,
    isStringSelectMenu: () => isSelect,
    editReply: async (payload) => {
      replies.push(payload);
      return payload;
    },
  };
  return { interaction, replies };
}

export async function reqcardOpenBuildsPrivatePanel() {
  return withEnv({}, async () => {
    seed();
    const { interaction, replies } = makeInteraction({ customId: 'reqcard:open' });
    await runWithTenant(TENANT_ID, () => handleRequestDeckInteraction(interaction));
    return { replies, webRequests: storeHolder.store.webRequests() };
  });
}

export async function reqcardSubmitUsesSharedWriter() {
  return withEnv({}, async () => {
    seed();
    await runWithTenant(TENANT_ID, async () => {
      const open = makeInteraction({ customId: 'reqcard:open' });
      await handleRequestDeckInteraction(open.interaction);
      const plus = makeInteraction({ customId: 'reqcard:plus' });
      await handleRequestDeckInteraction(plus.interaction);
      const submit = makeInteraction({ customId: 'reqcard:submit' });
      await handleRequestDeckInteraction(submit.interaction);
      return submit.replies;
    });
    const deltas = Object.values(storeHolder.store.webRequests()).filter(
      (r) => r.selectionStatus === 'Pending' && r.applicationStatus === 'Requested',
    );
    return { deltas, writerName: submitSelections.name };
  });
}

export async function reqcardDropUsesCancelPending() {
  return withEnv({}, async () => {
    seed({ pending: true });
    await runWithTenant(TENANT_ID, async () => {
      await handleRequestDeckInteraction(makeInteraction({ customId: 'reqcard:open' }).interaction);
      await handleRequestDeckInteraction(makeInteraction({ customId: 'reqcard:cancel' }).interaction);
      await handleRequestDeckInteraction(makeInteraction({
        customId: 'reqcard:drop_item',
        isSelect: true,
        values: ['puppet'],
      }).interaction);
      await handleRequestDeckInteraction(makeInteraction({ customId: 'reqcard:drop_confirm' }).interaction);
    });
    const canceled = Object.values(storeHolder.store.webRequests()).filter(
      (r) => r.applicationStatus === 'Canceled' && r.selectionStatus === 'Pending',
    );
    return { canceled, writerName: cancelPending.name };
  });
}

export async function rosterDisconnectNoLedgerWrite() {
  return withEnv({}, async () => {
    seed({ members: false });
    const { interaction, replies } = makeInteraction({ customId: 'reqcard:submit' });
    await runWithTenant(TENANT_ID, () => handleRequestDeckInteraction(interaction));
    return { replies, webRequests: storeHolder.store.webRequests() };
  });
}

export async function gateLockdownNoSecondWrite() {
  return withEnv({}, async () => {
    seed({ forceLocked: true, pending: true });
    const before = storeHolder.store.webRequests();
    const { interaction, replies } = makeInteraction({ customId: 'reqcard:submit' });
    await runWithTenant(TENANT_ID, () => handleRequestDeckInteraction(interaction));
    return { replies, before, after: storeHolder.store.webRequests() };
  });
}

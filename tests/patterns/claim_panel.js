import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { createMemoryTenantStore } from '../support/memoryTenantStore.js';
import { runWithTenant } from '../../backend/src/db/tenantContext.js';

patterns.claim_panel = 'used';
patterns.gate_open = 'used';
patterns.claim_limit = 'used';

const TENANT_ID = 'claim-tenant-1';
const CONFIG = {
  timezone: 'Asia/Manila',
  isForceLocked: false,
  items: [{ id: 'puppet', name: 'Puppet', colorTheme: 'slate' }],
  events: { evt1: { title: 'Weekly', loots: { puppet: 1 } } },
};

const gate = vi.hoisted(() => ({
  current: {
    isGateOpen: true,
    currentPhase: 3,
    activeEventId: 'evt1',
    timezone: 'Asia/Manila',
    currentSessionLabel: '',
    nextStatusChangeMessage: '',
    phaseIntervals: {},
    activeEventTitle: 'Weekly',
    helpEmbedUrl: '',
    announcementMinutes: { phase1: [], phase2: null, phase3: null },
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
    loadAuctionRequests: async () => ({}),
  };
});

const { handleAuctionInteraction } = await import('../../backend/src/games/ragnarok-origin/services/discordInteractiveAuction.js');

function baseSession({ gateOpen = true, selected = ['', ''] } = {}) {
  return {
    isDiscordGateOpen: gateOpen,
    version: 1,
    lastUpdated: Date.now(),
    qtyPerPage: 4,
    lootSummary: { puppet: { qty: 0, limit: 1, seats: 0 } },
    categoryAllocations: { puppet: { selected: [...selected] } },
  };
}

function seed({ members = true, session } = {}) {
  storeHolder.store = createMemoryTenantStore({
    settings: { configuration: CONFIG },
    auction: {
      members: members ? { '111': { displayName: 'Ada', status: 'Active' } } : {},
      web_requests: {},
      active_session: session || baseSession(),
    },
  });
}

function makeInteraction({ customId, userId = '111' }) {
  const replies = [];
  const interaction = {
    user: { id: userId, username: 'Ada', globalName: 'Ada' },
    member: { nickname: 'Ada', displayName: 'Ada' },
    customId,
    values: [],
    isButton: () => true,
    isStringSelectMenu: () => false,
    deferReply: async () => undefined,
    deferUpdate: async () => undefined,
    editReply: async (payload) => {
      replies.push(payload);
      return payload;
    },
  };
  return { interaction, replies };
}

export async function openGateClaimUpdatesSession() {
  return withEnv({}, async () => {
    seed({ session: baseSession({ gateOpen: true, selected: ['', ''] }) });
    const before = JSON.stringify(storeHolder.store.activeSession());
    const { interaction, replies } = makeInteraction({ customId: 'claim_slot_btn_0_item_puppet' });
    await runWithTenant(TENANT_ID, () => handleAuctionInteraction(interaction));
    const after = storeHolder.store.activeSession();
    return { before, after, replies, claimed: after?.categoryAllocations?.puppet?.selected?.[0] };
  });
}

export async function closedGateDoesNotMutateViaOpenPanel() {
  return withEnv({}, async () => {
    seed({ session: baseSession({ gateOpen: false, selected: ['', ''] }) });
    const before = JSON.parse(JSON.stringify(storeHolder.store.activeSession()));
    const { interaction, replies } = makeInteraction({ customId: 'open_auction_panel' });
    await runWithTenant(TENANT_ID, () => handleAuctionInteraction(interaction));
    // Real claim_slot path does not re-check isDiscordGateOpen; closed-gate unit seam is the open panel
    // which shows paused UI and does not write claims.
    const after = storeHolder.store.activeSession();
    return { before, after, replies };
  });
}

export async function closedGateClaimPathHonesty() {
  return withEnv({}, async () => {
    seed({ session: baseSession({ gateOpen: false, selected: ['', ''] }) });
    const beforeSelected = [...(storeHolder.store.activeSession().categoryAllocations.puppet.selected)];
    const { interaction } = makeInteraction({ customId: 'claim_slot_btn_0_item_puppet' });
    await runWithTenant(TENANT_ID, () => handleAuctionInteraction(interaction));
    const afterSelected = storeHolder.store.activeSession().categoryAllocations.puppet.selected;
    return { beforeSelected, afterSelected };
  });
}

export async function missingMemberRosterDisconnect() {
  return withEnv({}, async () => {
    seed({ members: false, session: baseSession({ gateOpen: true }) });
    const before = JSON.parse(JSON.stringify(storeHolder.store.activeSession()));
    const { interaction, replies } = makeInteraction({ customId: 'open_auction_panel' });
    await runWithTenant(TENANT_ID, () => handleAuctionInteraction(interaction));
    return { before, after: storeHolder.store.activeSession(), replies };
  });
}

export async function collisionDoesNotOverwrite() {
  return withEnv({}, async () => {
    seed({
      session: baseSession({ gateOpen: true, selected: ['222', ''] }),
    });
    const { interaction, replies } = makeInteraction({ customId: 'claim_slot_btn_0_item_puppet' });
    await runWithTenant(TENANT_ID, () => handleAuctionInteraction(interaction));
    const selected = storeHolder.store.activeSession().categoryAllocations.puppet.selected;
    return { selected, replies };
  });
}

export async function perItemLimitDoesNotWriteExtra() {
  return withEnv({}, async () => {
    seed({
      session: baseSession({ gateOpen: true, selected: ['111', ''] }),
    });
    // limit is 1; user 111 already claimed index 0 — claiming index 1 must abort
    const { interaction, replies } = makeInteraction({ customId: 'claim_slot_btn_1_item_puppet' });
    await runWithTenant(TENANT_ID, () => handleAuctionInteraction(interaction));
    const selected = storeHolder.store.activeSession().categoryAllocations.puppet.selected;
    return { selected, replies };
  });
}

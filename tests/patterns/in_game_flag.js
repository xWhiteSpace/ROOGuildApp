import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { createMemoryTenantStore } from '../support/memoryTenantStore.js';
import { dispatch } from '../support/dispatch.js';
import { RAGNAROK_ORIGIN_ID } from '../../backend/src/games/catalog.js';

patterns.in_game_flag_set = 'used';
patterns.in_game_flag_clear = 'used';
patterns.active_session_untouched = 'used';

const TENANT = 'in-game-flag-tenant';
const SESSION_ID = 's1';
const MEMBER_UID = '139847293847293847';
const storeHolder = vi.hoisted(() => ({ store: null }));

vi.mock('../../backend/src/db/database.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getTenantStore: () => storeHolder.store };
});

vi.mock('../../backend/src/db/tenants.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTenant: async (id) => (id ? {
      id,
      enabled_games: [RAGNAROK_ORIGIN_ID],
      subscription_status: 'active',
      billing_source: 'invite',
      owner_discord_id: 'officer-1',
    } : null),
    loadTenantSettings: async () => ({
      configuration: { timezone: 'Asia/Manila', adminRoles: ['Officer'] },
      discordChannels: {},
    }),
    claimTenantOwner: async () => undefined,
  };
});

vi.mock('../../backend/src/db/billing.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, tenantHasAccess: () => true };
});

const { createApp } = await import('../../backend/src/createApp.js');

function seedArchive({ includeInGame = false, live = true } = {}) {
  storeHolder.store = createMemoryTenantStore({
    attendance: {
      session_archive: {
        [SESSION_ID]: {
          id: SESSION_ID,
          eventTitle: 'GvG Night',
          eventDate: '2026-10-18',
          eventKey: 'evt1',
          endedAt: 1,
          ...(includeInGame ? { inGameStatus: { [MEMBER_UID]: true } } : {}),
        },
      },
      live_session: live ? { status: 'Active', eventTitle: 'Live GvG' } : null,
    },
    settings: { configuration: { timezone: 'Asia/Manila', adminRoles: ['Officer'] } },
  });
}

function officerSession() {
  return {
    user: {
      id: 'officer-1',
      username: 'Lead',
      displayName: 'Lead',
      currentTenantId: TENANT,
      isOfficer: true,
      roles: ['Officer'],
    },
    currentTenantId: TENANT,
  };
}

function memberSession() {
  return {
    user: {
      id: 'member-2',
      username: 'Raider',
      displayName: 'Raider',
      currentTenantId: TENANT,
      isOfficer: false,
      roles: ['Member'],
    },
    currentTenantId: TENANT,
  };
}

async function patchInGame({ sessionId = SESSION_ID, userId = MEMBER_UID, confirmed, session } = {}) {
  const app = createApp();
  return dispatch(app, {
    method: 'PATCH',
    path: `/api/live-raid/history/${sessionId}/in-game`,
    session: session || officerSession(),
    body: { userId, confirmed },
  });
}

async function flagAt(uid = MEMBER_UID) {
  const snap = await storeHolder.store.ref(`attendance/session_archive/${SESSION_ID}/inGameStatus/${uid}`).once();
  return snap.exists() ? snap.val() : null;
}

async function liveSession() {
  const snap = await storeHolder.store.ref('attendance/live_session').once();
  return snap.exists() ? snap.val() : null;
}

export async function inGameFlagSet() {
  return withEnv({}, async () => {
    seedArchive({ includeInGame: false });
    const res = await patchInGame({ confirmed: true });
    return {
      status: res.status,
      body: res.body,
      flag: await flagAt(),
    };
  });
}

export async function inGameFlagClear() {
  return withEnv({}, async () => {
    seedArchive({ includeInGame: true });
    const res = await patchInGame({ confirmed: false });
    return {
      status: res.status,
      body: res.body,
      flag: await flagAt(),
    };
  });
}

export async function missingArchiveIs404() {
  return withEnv({}, async () => {
    storeHolder.store = createMemoryTenantStore({
      attendance: { session_archive: {}, live_session: { status: 'Active' } },
      settings: { configuration: { adminRoles: ['Officer'] } },
    });
    const res = await patchInGame({ confirmed: true });
    return { status: res.status, body: res.body };
  });
}

export async function nonOfficerDoesNotCount() {
  return withEnv({}, async () => {
    seedArchive({ includeInGame: false });
    const res = await patchInGame({ confirmed: true, session: memberSession() });
    return {
      status: res.status,
      flag: await flagAt(),
    };
  });
}

export async function activeSessionUntouched() {
  return withEnv({}, async () => {
    seedArchive({ includeInGame: false, live: true });
    const before = await liveSession();
    const res = await patchInGame({ confirmed: true });
    return {
      status: res.status,
      before,
      after: await liveSession(),
      flag: await flagAt(),
    };
  });
}

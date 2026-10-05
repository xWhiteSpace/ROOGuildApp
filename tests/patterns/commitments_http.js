import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { createMemoryTenantStore } from '../support/memoryTenantStore.js';
import { dispatch } from '../support/dispatch.js';
import { RAGNAROK_ORIGIN_ID } from '../../backend/src/games/catalog.js';

patterns.no_timer_reget = 'used';
patterns.week_change = 'used';
patterns.etag_clear = 'used';
patterns.settings_fields = 'used';

const TENANT = 'commitments-http-tenant';
const storeHolder = vi.hoisted(() => ({ store: null }));

vi.mock('../../backend/src/db/database.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTenantStore: () => storeHolder.store,
    loadCommitmentsForWeek: async (weekMonday) => ({
      weekMonday,
      stub: true,
      rows: { [`${weekMonday}_evt`]: { u1: { status: 'Confirmed' } } },
    }),
    sqlFingerprint: async () => 'fp-unit',
  };
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
      owner_discord_id: 'u1',
    } : null),
    loadTenantSettings: async () => ({
      configuration: {
        timezone: 'Asia/Manila',
        events: { evt1: { title: 'GvG' } },
        specialEventCategories: ['Boss'],
        adminRoles: ['Officer'],
        jobs: { k: { name: 'Knight' } },
      },
      discordChannels: {},
    }),
  };
});

vi.mock('../../backend/src/db/billing.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, tenantHasAccess: () => true };
});

const { createApp } = await import('../../backend/src/createApp.js');
const requestRoutes = (await import('../../backend/src/api/request.routes.js')).default;
const { runWithTenant } = await import('../../backend/src/db/tenantContext.js');

function session() {
  return {
    user: {
      id: 'u1',
      username: 'Ada',
      displayName: 'Ada',
      currentTenantId: TENANT,
      isOfficer: true,
      roles: ['Officer'],
    },
    currentTenantId: TENANT,
  };
}

function seed() {
  storeHolder.store = createMemoryTenantStore({
    settings: {
      configuration: {
        timezone: 'Asia/Manila',
        events: { evt1: { title: 'GvG' } },
        specialEventCategories: ['Boss'],
        adminRoles: ['Officer'],
        jobs: { k: { name: 'Knight' } },
      },
    },
    attendance: { commitments: {} },
  });
}

export async function commitmentsIncludeWeekMonday() {
  return withEnv({}, async () => {
    seed();
    const app = createApp();
    return dispatch(app, {
      method: 'GET',
      path: '/api/attendance/commitments?weekMonday=2026-10-05',
      session: session(),
    });
  });
}

export async function settingsAsksThreeFields() {
  return withEnv({}, async () => {
    seed();
    return runWithTenant(TENANT, () => dispatch(requestRoutes, {
      method: 'GET',
      path: '/settings/get?fields=events,specialEventCategories,timezone',
      session: session(),
    }));
  });
}

export function reactPageBulletsSkipped() {
  return {
    skipped: [
      'No timer re-GET while Scheduler stays open',
      'Commitments load when the page opens',
      'Week change clears stored ETag before the fetch',
    ],
    reason: 'Scheduler.jsx + react-query effects only; no exported unit seam for timer/ETag. Covered HTTP weekMonday + settings fields shapes instead.',
  };
}

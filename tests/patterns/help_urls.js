import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { createMemoryTenantStore } from '../support/memoryTenantStore.js';
import { runWithTenant } from '../../backend/src/db/tenantContext.js';
import { dispatch } from '../support/dispatch.js';
import { helpSettingsView } from '../../backend/src/auth/officer.js';

patterns.help_urls = 'used';
patterns.no_admin_leak = 'used';

const TENANT_ID = 'help-tenant-1';
const CONFIG = {
  timezone: 'Asia/Tokyo',
  adminRoles: ['Officer', 'Admin'],
  helpEmbedUrl: 'https://example.com/help',
  raidHelpEmbedUrl: 'https://example.com/raid',
  guildDisplayName: 'Dynasty',
  guildLogoUrl: 'https://example.com/logo.png',
  items: [{ id: 'puppet', name: 'Puppet' }],
};

const storeHolder = vi.hoisted(() => ({ store: null }));

vi.mock('../../backend/src/db/database.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTenantStore: () => storeHolder.store,
  };
});

const requestRoutes = (await import('../../backend/src/api/request.routes.js')).default;

function seed() {
  storeHolder.store = createMemoryTenantStore({
    settings: { configuration: CONFIG },
    auction: { members: {}, web_requests: {} },
  });
}

export async function authenticatedHelpView() {
  return withEnv({}, async () => {
    seed();
    const res = await runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'GET',
      path: '/settings/help',
      session: {
        user: { id: '111', username: 'Ada', displayName: 'Ada', currentTenantId: TENANT_ID },
        currentTenantId: TENANT_ID,
      },
    }));
    return { res, view: helpSettingsView(CONFIG) };
  });
}

export async function unauthenticatedHelpRoute() {
  return withEnv({}, async () => {
    seed();
    // Real seam: GET /settings/help does not check identity (no 401).
    return runWithTenant(TENANT_ID, () => dispatch(requestRoutes, {
      method: 'GET',
      path: '/settings/help',
      session: {},
    }));
  });
}

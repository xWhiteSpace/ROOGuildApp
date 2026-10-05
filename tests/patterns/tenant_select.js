import { vi } from 'vitest';
import tenantRouter, { buildSessionUser } from '../../backend/src/api/tenant.routes.js';
import * as tenantsDb from '../../backend/src/db/tenants.js';
import * as database from '../../backend/src/db/database.js';
import { discordClient } from '../../backend/src/discord-bot/client.js';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { dispatch } from '../support/dispatch.js';

patterns.tenant_select = 'used';
patterns.roster_member_upsert = 'used';

const TENANT_ID = '555666777888999000';

function stubSettingsAndStore(updateMock) {
  const getTenantSpy = vi.spyOn(tenantsDb, 'getTenant').mockResolvedValue({
    id: TENANT_ID,
    display_name: 'Select Guild',
    owner_discord_id: 'user-1',
    onboarded: true,
    enabled_games: ['adventurer-guild', 'ragnarok-origin'],
    subscription_status: 'active',
    billing_source: 'invite',
    is_platform_owner: false,
    logo_url: '',
  });
  const settingsSpy = vi.spyOn(tenantsDb, 'loadTenantSettings').mockResolvedValue({
    configuration: {
      adminRoles: ['Officer'],
      timezone: 'Asia/Manila',
      guildDisplayName: 'Select Guild',
      guildLogoUrl: '',
    },
    discordChannels: {},
  });
  const claimSpy = vi.spyOn(tenantsDb, 'claimTenantOwner').mockResolvedValue(null);
  const storeSpy = vi.spyOn(database, 'getTenantStore').mockReturnValue({
    ref: () => ({
      update: updateMock,
      set: vi.fn().mockResolvedValue(undefined),
      once: vi.fn().mockResolvedValue({ exists: () => false, val: () => null }),
    }),
  });
  const readySpy = vi.spyOn(discordClient, 'isReady').mockReturnValue(false);
  return () => {
    getTenantSpy.mockRestore();
    settingsSpy.mockRestore();
    claimSpy.mockRestore();
    storeSpy.mockRestore();
    readySpy.mockRestore();
  };
}

export async function selectRequiresMembershipVisibility() {
  return withEnv({}, async () => {
    const restore = stubSettingsAndStore(vi.fn().mockResolvedValue(undefined));
    const memberSpy = vi.spyOn(tenantsDb, 'getTenantsForMember').mockResolvedValue([]);
    const byIdsSpy = vi.spyOn(tenantsDb, 'getTenantsByIds').mockResolvedValue([]);
    try {
      return await dispatch(tenantRouter, {
        method: 'POST',
        path: '/select',
        body: { tenantId: TENANT_ID },
        session: {
          user: { id: 'user-1', username: 'Ada', displayName: 'Ada' },
          discordGuilds: [{ id: 'other-guild', name: 'Other', owner: false, permissions: '0' }],
        },
      });
    } finally {
      memberSpy.mockRestore();
      byIdsSpy.mockRestore();
      restore();
    }
  });
}

export async function selectBuildsSessionOfficerAndGames() {
  return withEnv({}, async () => {
    const updateMock = vi.fn().mockResolvedValue(undefined);
    const restore = stubSettingsAndStore(updateMock);
    const memberSpy = vi.spyOn(tenantsDb, 'getTenantsForMember').mockResolvedValue([]);
    const byIdsSpy = vi.spyOn(tenantsDb, 'getTenantsByIds').mockResolvedValue([
      { id: TENANT_ID, display_name: 'Select Guild', onboarded: true },
    ]);
    try {
      const result = await dispatch(tenantRouter, {
        method: 'POST',
        path: '/select',
        body: { tenantId: TENANT_ID },
        session: {
          user: {
            id: 'user-1',
            username: 'Ada',
            displayName: 'Ada',
            roles: ['Officer'],
          },
          discordGuilds: [{ id: TENANT_ID, name: 'Select Guild', owner: true, permissions: String(32n) }],
        },
      });
      return { ...result, updateMock };
    } finally {
      memberSpy.mockRestore();
      byIdsSpy.mockRestore();
      restore();
    }
  });
}

export async function selectUpsertsAuctionMember() {
  return withEnv({}, async () => {
    const updateMock = vi.fn().mockResolvedValue(undefined);
    const restore = stubSettingsAndStore(updateMock);
    try {
      const req = {
        session: {
          user: null,
          discordGuilds: [{ id: TENANT_ID, name: 'Select Guild', owner: true, permissions: String(32n) }],
        },
      };
      const user = await buildSessionUser(req, TENANT_ID, {
        id: 'user-1',
        username: 'Ada',
        displayName: 'Ada',
        discriminator: '0',
        avatar: null,
        roles: ['Officer'],
      });
      return { user, updateMock, calls: updateMock.mock.calls };
    } finally {
      restore();
    }
  });
}

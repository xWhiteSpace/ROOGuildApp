import { vi } from 'vitest';
import tenantRouter from '../../backend/src/api/tenant.routes.js';
import * as tenantsDb from '../../backend/src/db/tenants.js';
import * as billing from '../../backend/src/db/billing.js';
import { discordClient } from '../../backend/src/discord-bot/client.js';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { dispatch } from '../support/dispatch.js';

patterns.mine_list = 'used';
patterns.capacity_empty_onboardable = 'used';

const MANAGE_SERVER = String(32n);

function stubDiscordIdle() {
  return vi.spyOn(discordClient, 'isReady').mockReturnValue(false);
}

async function mineRequest({ guilds, tenants, activeCount }) {
  return withEnv({}, async () => {
    const readySpy = stubDiscordIdle();
    const memberSpy = vi.spyOn(tenantsDb, 'getTenantsForMember').mockResolvedValue([]);
    const byIdsSpy = vi.spyOn(tenantsDb, 'getTenantsByIds').mockResolvedValue(tenants);
    const countSpy = vi.spyOn(billing, 'countOccupyingGuilds').mockResolvedValue(activeCount);
    try {
      return await dispatch(tenantRouter, {
        method: 'GET',
        path: '/mine',
        session: {
          user: { id: 'user-1', username: 'Ada' },
          discordGuilds: guilds,
        },
      });
    } finally {
      readySpy.mockRestore();
      memberSpy.mockRestore();
      byIdsSpy.mockRestore();
      countSpy.mockRestore();
    }
  });
}

export function visibleOnboardedTenantsForMember() {
  return mineRequest({
    activeCount: 0,
    guilds: [
      { id: 'guild-on', name: 'Onboarded', owner: false, permissions: '0', icon: null },
      { id: 'guild-new', name: 'New', owner: true, permissions: MANAGE_SERVER, icon: null },
    ],
    tenants: [
      {
        id: 'guild-on',
        display_name: 'Onboarded',
        onboarded: true,
        plan: 'free',
        is_platform_owner: false,
        enabled_games: ['ragnarok-origin'],
        logo_url: '',
      },
    ],
  });
}

export function manageServerOnboardableWhenCapacityAllows() {
  return mineRequest({
    activeCount: 1,
    guilds: [
      { id: 'guild-on', name: 'Onboarded', owner: false, permissions: '0', icon: null },
      { id: 'guild-ms', name: 'Manageable', owner: false, permissions: MANAGE_SERVER, icon: null },
    ],
    tenants: [
      {
        id: 'guild-on',
        display_name: 'Onboarded',
        onboarded: true,
        plan: 'free',
        is_platform_owner: false,
        enabled_games: [],
        logo_url: '',
      },
    ],
  });
}

export function capacityFullClearsOnboardable() {
  return mineRequest({
    activeCount: 20,
    guilds: [
      { id: 'guild-ms', name: 'Manageable', owner: true, permissions: MANAGE_SERVER, icon: null },
    ],
    tenants: [],
  });
}

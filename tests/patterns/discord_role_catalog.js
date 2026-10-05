import { vi } from 'vitest';
import tenantRouter from '../../backend/src/api/tenant.routes.js';
import { discordClient } from '../../backend/src/discord-bot/client.js';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { dispatch } from '../support/dispatch.js';

patterns.discord_role_catalog = 'used';
patterns.bot_presence_gate = 'used';

const GUILD_ID = '101010101010101010';

function mockGuildWithRoles(roles) {
  const cache = new Map(roles.map((role) => [role.id, role]));
  return {
    id: GUILD_ID,
    roles: {
      cache: {
        values: () => cache.values(),
        get: (id) => cache.get(String(id)),
      },
      fetch: async () => cache,
    },
  };
}

export async function roleCatalogSortedWithoutEveryone() {
  return withEnv({}, async () => {
    const guild = mockGuildWithRoles([
      { id: '1', name: '@everyone', position: 0 },
      { id: '2', name: 'Member', position: 1 },
      { id: '3', name: 'Officer', position: 5 },
      { id: '4', name: 'Raid Lead', position: 3 },
    ]);
    const getSpy = vi.spyOn(discordClient.guilds.cache, 'get').mockImplementation((id) => (
      String(id) === GUILD_ID ? guild : undefined
    ));
    try {
      return await dispatch(tenantRouter, {
        method: 'GET',
        path: '/discord-roles',
        query: { guildId: GUILD_ID },
        session: { user: { id: 'user-1', username: 'Ada' } },
      });
    } finally {
      getSpy.mockRestore();
    }
  });
}

export async function roleCatalogRefusedWhenBotMissing() {
  return withEnv({}, async () => {
    const getSpy = vi.spyOn(discordClient.guilds.cache, 'get').mockReturnValue(undefined);
    try {
      return await dispatch(tenantRouter, {
        method: 'GET',
        path: '/discord-roles',
        query: { guildId: GUILD_ID },
        session: { user: { id: 'user-1', username: 'Ada' } },
      });
    } finally {
      getSpy.mockRestore();
    }
  });
}

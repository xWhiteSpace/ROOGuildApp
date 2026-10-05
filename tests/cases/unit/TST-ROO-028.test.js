import { describe, expect, it } from 'vitest';
import {
  roleCatalogRefusedWhenBotMissing,
  roleCatalogSortedWithoutEveryone,
} from '../../patterns/discord_role_catalog.js';

describe('TST-ROO-028 DiscordRoleCatalog requires bot in guild and sorts non-@everyone roles', () => {
  it('Bot in guild → non-@everyone roles sorted by position', async () => {
    const { status, body } = await roleCatalogSortedWithoutEveryone();
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.roles.map((r) => r.name)).toEqual(['Officer', 'Raid Lead', 'Member']);
    expect(body.roles.every((r) => r.name !== '@everyone')).toBe(true);
  });

  it('Bot not in guild → refuse catalog', async () => {
    const { status, body } = await roleCatalogRefusedWhenBotMissing();
    expect(status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.inviteUrl).toMatch(/discord\.com\/oauth2\/authorize/);
  });
});

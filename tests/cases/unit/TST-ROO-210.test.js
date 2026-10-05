import { describe, expect, it } from 'vitest';
import {
  discordCircuitMapsToKey,
  platformAccessWithoutTenant,
  storedRowHasNoTenantId,
  anotherPlatformKeyUsesPlatformState,
} from '../../patterns/platform_state_circuit.js';

describe('TST-ROO-210 PlatformStateDiscordCircuitAndOtherKeys stores bot-wide rows without tenant_id', () => {
  it('scheduler/discord_circuit maps to key discord_circuit', async () => {
    const r = await discordCircuitMapsToKey();
    expect(r.key).toBe('discord_circuit');
  });

  it('platform_state access does not require a tenant', async () => {
    const r = await platformAccessWithoutTenant();
    expect(r.proceeded).toBe(true);
  });

  it('the stored platform_state row has no tenant_id', async () => {
    const r = await storedRowHasNoTenantId();
    expect(r.colocatedKeyOnly).toBe(true);
  });

  it('another platform key uses platform_state, not a per-guild table', async () => {
    const r = await anotherPlatformKeyUsesPlatformState();
    expect(r.notJsonDocs).toBe(true);
    expect(r.notPerGuildTable).toBe(true);
    expect(String(r.key)).toMatch(/^oauth_guilds:/);
  });
});

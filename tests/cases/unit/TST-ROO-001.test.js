import { describe, expect, it } from 'vitest';
import { allowCompleteEnv } from '../../patterns/env_gate_refusal.js';
import { refuseMissingSecret } from '../../patterns/missing_secret_matrix.js';

describe('TST-ROO-001 ProcessBootstrap refuses start when required secrets missing', () => {
  it('Missing DISCORD_CLIENT_SECRET refuses normal start', () => {
    expect(() => refuseMissingSecret('DISCORD_CLIENT_SECRET')).toThrow(/DISCORD_CLIENT_SECRET/);
  });

  it('Missing SESSION_SECRET refuses normal start', () => {
    expect(() => refuseMissingSecret('SESSION_SECRET')).toThrow(/SESSION_SECRET/);
  });

  it('Missing DATABASE_URL refuses normal start', () => {
    expect(() => refuseMissingSecret('DATABASE_URL')).toThrow(/DATABASE_URL/);
  });

  it('All required secrets present allows gate pass', () => {
    const gate = allowCompleteEnv();
    expect(gate.discord.clientId).toBe('unit-client-id');
    expect(gate.postgres.databaseUrl).toBe('postgres://127.0.0.1/valhalla_unit');
  });
});

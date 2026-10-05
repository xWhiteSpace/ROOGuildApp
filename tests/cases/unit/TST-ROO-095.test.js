import { describe, expect, it } from 'vitest';
import {
  clearGuildCommandsEmptiesRegistry,
  readyClearsEachOnboardedTenant,
  perTenantClearFailureContinues,
  slashInvokeEphemeralRedirectNoReregister,
} from '../../patterns/slash_clear_on_ready.js';

describe('TST-ROO-095 SlashCommandClearOnReady clears guild slash commands and replies ephemeral', () => {
  it('Ready clears guild slash commands for each onboarded tenant', async () => {
    const emptied = await clearGuildCommandsEmptiesRegistry();
    expect(emptied.putCalls).toBeGreaterThanOrEqual(1);
    expect(emptied.emptied).toBe(true);
    expect(emptied.route).toBe(emptied.expectedRoute);

    const { cleared } = await readyClearsEachOnboardedTenant();
    expect(cleared).toEqual(expect.arrayContaining(['guild-a', 'guild-b']));
  });

  it('A per-tenant clear failure does not crash the bot', async () => {
    const { cleared, warnings, processAlive } = await perTenantClearFailureContinues();
    expect(processAlive).toBe(true);
    expect(cleared).toContain('guild-ok');
    expect(cleared).toContain('guild-fail');
    expect(warnings.some((w) => /guild-fail|clear/i.test(w))).toBe(true);
  });

  it('A later slash invoke is an ephemeral redirect and does not re-register', async () => {
    const { replyArgs, clearCallsAfterSlash, handlerHits } = await slashInvokeEphemeralRedirectNoReregister();
    expect(replyArgs?.ephemeral).toBe(true);
    expect(replyArgs?.content).toMatch(/Slash commands were removed/i);
    expect(replyArgs?.content).toMatch(/Request|attendance|party/i);
    expect(clearCallsAfterSlash).toBe(0);
    expect(handlerHits.attendance + handlerHits.auction).toBe(0);
  });
});

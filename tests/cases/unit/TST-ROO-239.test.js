import { describe, expect, it } from 'vitest';
import {
  productionUsesFrontendBridge,
  localExchangesDirectlyWithDiscord,
  successfulExchangeReturnsProfileToCallback,
} from '../../patterns/oauth_bridge.js';

describe('TST-ROO-239 OAuthCodeExchangeBridgeOffloadsProductionAndKeepsLocalDirect', () => {
  it('Production exchanges the OAuth code through the FRONTEND_URL oauth bridge', () => {
    const r = productionUsesFrontendBridge();
    expect(r.url).toBe(r.expected);
    expect(r.isBridge).toBe(true);
  });

  it('Local exchanges the OAuth code directly with Discord', () => {
    const r = localExchangesDirectlyWithDiscord();
    expect(r.usesDirectDiscord).toBe(true);
  });

  it('A successful exchange returns token/profile material to the callback handler', async () => {
    const r = await successfulExchangeReturnsProfileToCallback();
    expect(r.usedBridge).toBe(true);
    expect(r.notDiscordToken).toBe(true);
    expect(r.redirectedWithAuthUser).toBe(true);
    expect(r.sessionUser?.id).toBe('disc-1');
  });
});

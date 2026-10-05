import { describe, expect, it } from 'vitest';
import {
  botInitFailureHttpStillServes,
  missingTokenFatalNoLogin,
  presentTokenProceedsToLogin,
} from '../../patterns/bot_token_gate.js';

describe('TST-ROO-094 BotTokenGate refuses login without token', () => {
  it('Present token proceeds to bot login', async () => {
    const { loginCalls, tokenArg } = await presentTokenProceedsToLogin();
    expect(loginCalls).toBeGreaterThanOrEqual(1);
    expect(tokenArg).toBe('unit-bot-token-present');
  });

  it('Missing token is fatal for bot init and does not log in', async () => {
    const { error, loginCalls } = await missingTokenFatalNoLogin();
    expect(error).toBeTruthy();
    expect(error.message).toMatch(/DISCORD_BOT_TOKEN/i);
    expect(loginCalls).toBe(0);
  });

  it('Bot init failure does not stop non-bot HTTP routes', async () => {
    const { botError, health } = await botInitFailureHttpStillServes();
    expect(botError).toBeTruthy();
    expect(health.status).toBe(200);
  });
});

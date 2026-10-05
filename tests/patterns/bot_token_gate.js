import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { createApp } from '../../backend/src/createApp.js';
import { dispatch } from '../support/dispatch.js';

patterns.bot_token_gate = 'used';
patterns.bot_login_stub = 'used';

const loginSpy = vi.hoisted(() => vi.fn(async () => 'stubbed-login'));

vi.mock('../../backend/src/utils/discordRateLimit.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    hydrateDiscordCircuit: async () => undefined,
    isDiscordCircuitOpen: () => false,
    getDiscordRateLimitStatus: () => ({ untilHuman: '', remainingHuman: '', circuitRemainingMs: 0 }),
  };
});

const clientMod = await import('../../backend/src/discord-bot/client.js');
const { initializeDiscordBot, discordClient } = clientMod;

export async function presentTokenProceedsToLogin() {
  return withEnv({ DISCORD_BOT_TOKEN: 'unit-bot-token-present' }, async () => {
    loginSpy.mockClear();
    const originalLogin = discordClient.login.bind(discordClient);
    discordClient.login = loginSpy;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      if (String(url).includes('/gateway/bot')) {
        return {
          status: 200,
          ok: true,
          headers: new Map(),
          async text() { return '{"url":"wss://example"}'; },
        };
      }
      return originalFetch(url);
    };
    const originalIsReady = discordClient.isReady.bind(discordClient);
    try {
      Object.defineProperty(discordClient, 'isReady', {
        configurable: true,
        value: () => false,
      });
      await initializeDiscordBot();
      return { loginCalls: loginSpy.mock.calls.length, tokenArg: loginSpy.mock.calls[0]?.[0] };
    } finally {
      Object.defineProperty(discordClient, 'isReady', {
        configurable: true,
        value: originalIsReady,
      });
      discordClient.login = originalLogin;
      globalThis.fetch = originalFetch;
    }
  });
}

export async function missingTokenFatalNoLogin() {
  return withEnv({ DISCORD_BOT_TOKEN: '' }, async () => {
    loginSpy.mockClear();
    const originalLogin = discordClient.login.bind(discordClient);
    discordClient.login = loginSpy;
    let error = null;
    try {
      await initializeDiscordBot();
    } catch (err) {
      error = err;
    } finally {
      discordClient.login = originalLogin;
    }
    return { error, loginCalls: loginSpy.mock.calls.length };
  });
}

export async function botInitFailureHttpStillServes() {
  return withEnv({ DISCORD_BOT_TOKEN: '' }, async () => {
    let botError = null;
    try {
      await initializeDiscordBot();
    } catch (err) {
      botError = err;
    }
    const pool = await import('../../backend/src/db/pool.js');
    const spy = vi.spyOn(pool, 'query').mockResolvedValue({ rows: [{ '?column?': 1 }] });
    try {
      const app = createApp();
      const health = await dispatch(app, { method: 'GET', path: '/' });
      return { botError, health };
    } finally {
      spy.mockRestore();
    }
  });
}

import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { resolveOAuthExchangeUrl, isLocalOAuthRedirect } from '../../backend/src/utils/discordRateLimit.js';
import { dispatch } from '../support/dispatch.js';

patterns.oauth_bridge = 'used';

const hold = vi.hoisted(() => ({
  fetchCalls: [],
}));

vi.mock('../../backend/src/utils/discordRateLimit.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    hydrateDiscordCircuit: async () => {},
    beginOAuthAttempt: () => ({ allowed: true }),
    endOAuthAttempt: () => {},
    isDiscordCircuitOpen: () => false,
  };
});

vi.mock('../../backend/src/db/oauthGuilds.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    saveOAuthGuilds: async () => {},
    compactDiscordGuilds: (g) => g || [],
  };
});

vi.mock('../../backend/src/api/tenant.routes.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    listVisibleTenants: async () => [],
    buildSessionUser: async (_req, tenantId, base) => ({ ...base, currentTenantId: tenantId, tenantOnboarded: true, subscriptionAllowed: true }),
    attachTenantLogo: async (u) => u,
  };
});

vi.mock('../../backend/src/auth/identity.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    signUserProfile: (u) => ({ ...u, signed: true }),
  };
});

const oauthRouter = (await import('../../backend/src/auth/discordOAuth.js')).default;

export function productionUsesFrontendBridge() {
  return withEnv({
    FRONTEND_URL: 'https://valhalla.example.com',
    OAUTH_REDIRECT_URI: 'https://api.example.com/auth/callback',
    OAUTH_EXCHANGE_URL: '',
  }, () => {
    const url = resolveOAuthExchangeUrl();
    return {
      url,
      expected: 'https://valhalla.example.com/api/discord-token-exchange',
      isBridge: Boolean(url && /discord-token-exchange/.test(url)),
    };
  });
}

export function localExchangesDirectlyWithDiscord() {
  return withEnv({
    FRONTEND_URL: 'http://localhost:3000',
    OAUTH_REDIRECT_URI: 'http://127.0.0.1:5001/auth/callback',
    OAUTH_EXCHANGE_URL: '',
  }, () => {
    const url = resolveOAuthExchangeUrl();
    const local = isLocalOAuthRedirect();
    return {
      exchangeUrl: url,
      localRedirect: local,
      usesDirectDiscord: url == null && local,
    };
  });
}

export async function successfulExchangeReturnsProfileToCallback() {
  return withEnv({
    FRONTEND_URL: 'https://valhalla.example.com',
    OAUTH_REDIRECT_URI: 'https://api.example.com/auth/callback',
    OAUTH_EXCHANGE_URL: '',
    DISCORD_CLIENT_ID: 'cid',
    DISCORD_CLIENT_SECRET: 'csecret',
  }, async () => {
    hold.fetchCalls = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      hold.fetchCalls.push({ url: String(url), init });
      // Bridge POST
      if (String(url).includes('discord-token-exchange')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              user: {
                id: 'disc-1',
                username: 'Ada',
                discriminator: '0',
                avatar: null,
                global_name: 'Ada',
              },
              guilds: [{ id: 'g1', name: 'Guild', permissions: '0' }],
              member: null,
            };
          },
        };
      }
      return { ok: false, status: 500, async json() { return {}; }, async text() { return ''; } };
    };
    try {
      let redirect = null;
      let sessionUser = null;
      const res = {
        statusCode: 200,
        redirect(loc) { redirect = loc; return this; },
        status(c) { this.statusCode = c; return this; },
        json() { return this; },
      };
      // Prefer dispatch
      const session = {
        save: (cb) => { if (typeof cb === 'function') cb(); },
      };
      const out = await dispatch(oauthRouter, {
        method: 'GET',
        path: '/callback?code=oauth-code-1&state=login',
        session,
      });
      const location = out.location || out.headers?.location || '';
      return {
        fetchUrls: hold.fetchCalls.map((c) => c.url),
        usedBridge: hold.fetchCalls.some((c) => /discord-token-exchange/.test(c.url)),
        notDiscordToken: !hold.fetchCalls.some((c) => /discord\.com\/api\/oauth2\/token/.test(c.url)),
        status: out.status,
        location,
        redirectedWithAuthUser: String(location).includes('auth_user='),
        sessionUser: session.user || null,
      };
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
}

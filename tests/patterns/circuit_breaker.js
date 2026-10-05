import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { createMemoryTenantStore } from '../support/memoryTenantStore.js';
import { runWithTenant } from '../../backend/src/db/tenantContext.js';

patterns.circuit_breaker = 'used';
patterns.human_until = 'used';
patterns.no_secrets = 'used';

const storeHolder = vi.hoisted(() => ({ store: null }));

vi.mock('../../backend/src/db/database.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTenantStore: () => storeHolder.store,
  };
});

const {
  tripDiscordCircuit,
  hydrateDiscordCircuit,
  enqueueDiscordCall,
  getDiscordRateLimitStatus,
  isDiscordCircuitOpen,
  DiscordCircuitOpenError,
} = await import('../../backend/src/utils/discordRateLimit.js');

/** Non-local redirect so isLocalOAuthRedirect() is false and the circuit can open. */
const NON_LOCAL = {
  OAUTH_REDIRECT_URI: 'https://valhalla.example/auth/callback',
  OAUTH_EXCHANGE_URL: '',
  DISCORD_BOT_TOKEN: 'unit-circuit-token',
};

function resetCircuitMemory() {
  storeHolder.store = createMemoryTenantStore({});
}

async function forceCloseCircuit() {
  // hydrateDiscordCircuit clears only for local/ngrok redirects.
  await withEnv({
    OAUTH_REDIRECT_URI: 'http://127.0.0.1:5001/auth/callback',
    DISCORD_BOT_TOKEN: 'unit-circuit-token',
  }, async () => {
    storeHolder.store = createMemoryTenantStore({});
    await hydrateDiscordCircuit();
  });
}


async function withCircuitEnv(fn) {
  return withEnv(NON_LOCAL, async () => runWithTenant('circuit-tenant', fn));
}

export async function trip429WithRetryAfterStoresHold() {
  return withCircuitEnv(async () => {
    await forceCloseCircuit();
    resetCircuitMemory();
    await hydrateDiscordCircuit();
    const holdSec = 42;
    const status = tripDiscordCircuit(
      { status: 429, headers: { 'retry-after': String(holdSec) } },
      'unit-429'
    );
    await new Promise((r) => setImmediate(r));
    const snap = storeHolder.store.snapshot();
    const stored = snap?.scheduler?.discord_circuit || null;
    return {
      status,
      stored,
      // Honesty: store persists `until` (+ meta), not a literal `circuit_open` / `remaining` key.
      circuitOpen: status.circuitOpen === true,
      until: stored?.until,
      remainingHuman: status.circuitRemainingHuman,
      remainingMs: status.circuitRemainingMs,
      holdMsApprox: holdSec * 1000,
    };
  });
}

export async function trip429WithoutRetryAfterUsesDefault() {
  return withCircuitEnv(async () => {
    await forceCloseCircuit();
    resetCircuitMemory();
    await hydrateDiscordCircuit();
    const status = tripDiscordCircuit(
      { status: 429, message: 'You are being rate limited.' },
      'unit-429-default'
    );
    const DEFAULT_MS = 15 * 60 * 1000;
    return {
      circuitOpen: status.circuitOpen,
      remainingMs: status.circuitRemainingMs,
      defaultMs: DEFAULT_MS,
      withinDefault: status.circuitRemainingMs > DEFAULT_MS - 5000 && status.circuitRemainingMs <= DEFAULT_MS,
    };
  });
}

export async function statusHumanNoSecrets() {
  return withCircuitEnv(async () => {
    await forceCloseCircuit();
    resetCircuitMemory();
    await hydrateDiscordCircuit();
    tripDiscordCircuit({ status: 429, retryAfter: 30 }, 'unit-status');
    const status = getDiscordRateLimitStatus();
    const json = JSON.stringify(status);
    const secretHits = [
      /Bot\s+[A-Za-z0-9._-]+/,
      /client_secret/i,
      /DISCORD_BOT_TOKEN/,
      /unit-circuit-token/,
    ].filter((re) => re.test(json));
    return {
      circuitOpen: status.circuitOpen,
      remainingHuman: status.circuitRemainingHuman || status.remainingHuman,
      untilHuman: status.circuitUntilHuman || status.untilHuman,
      secretHits,
      status,
    };
  });
}

export async function enqueueRefusesWhileOpen() {
  return withCircuitEnv(async () => {
    await forceCloseCircuit();
    resetCircuitMemory();
    await hydrateDiscordCircuit();
    tripDiscordCircuit({ status: 429, retryAfter: 120 }, 'unit-refuse');
    const sent = vi.fn(async () => 'sent');
    let error = null;
    try {
      await enqueueDiscordCall(sent);
    } catch (err) {
      error = err;
    }
    return {
      sent: sent.mock.calls.length,
      refused: error instanceof DiscordCircuitOpenError || error?.name === 'DiscordCircuitOpenError',
      errorName: error?.name,
      open: isDiscordCircuitOpen(),
    };
  });
}

export async function enqueueSendsWhenClosed() {
  await forceCloseCircuit();
  return withCircuitEnv(async () => {
    resetCircuitMemory();
    await hydrateDiscordCircuit();
    if (isDiscordCircuitOpen()) {
      throw new Error('circuit still open before enqueue closed test');
    }
    const sent = vi.fn(async () => 'ok-sent');
    const result = await enqueueDiscordCall(sent);
    return {
      result,
      sent: sent.mock.calls.length,
      open: isDiscordCircuitOpen(),
    };
  });
}

export async function hydrateFromPlatformStore() {
  return withCircuitEnv(async () => {
    await forceCloseCircuit();
    resetCircuitMemory();
    const until = Date.now() + 90_000;
    await storeHolder.store.ref('scheduler/discord_circuit').set({
      until,
      last: { sourceLabel: 'hydrated-fixture', waitMs: 90_000, until },
      updatedAt: Date.now(),
    });
    await hydrateDiscordCircuit();
    const status = getDiscordRateLimitStatus();
    return {
      circuitOpen: status.circuitOpen,
      remainingMs: status.circuitRemainingMs,
      untilHuman: status.circuitUntilHuman,
      // Honesty: hydrate restores `until` into process memory; status exposes circuitOpen + remaining*.
      hydratedOpen: isDiscordCircuitOpen(),
    };
  });
}

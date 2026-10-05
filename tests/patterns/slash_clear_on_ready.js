import { vi } from 'vitest';
import { REST, Routes } from 'discord.js';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';

patterns.slash_clear_on_ready = 'used';
patterns.ephemeral_redirect = 'used';

const clearState = vi.hoisted(() => ({
  calls: [],
  failIds: new Set(),
}));

const handlerSpies = vi.hoisted(() => ({
  attendance: vi.fn(async () => 'attendance'),
  ocr: vi.fn(async () => 'ocr'),
  party: vi.fn(async () => 'party'),
  reqcard: vi.fn(async () => 'reqcard'),
  auction: vi.fn(async () => 'auction'),
  onboard: vi.fn(async () => 'onboard'),
}));

const onboarded = vi.hoisted(() => ({ tenants: [] }));

vi.mock('../../backend/src/discord-bot/deployGuild.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    clearGuildCommands: vi.fn(async (guildId) => {
      clearState.calls.push(guildId);
      if (clearState.failIds.has(String(guildId))) {
        throw new Error(`clear failed for ${guildId}`);
      }
      return [];
    }),
  };
});

vi.mock('../../backend/src/db/tenants.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    forEachOnboardedTenant: async (fn) => {
      for (const tenant of onboarded.tenants) {
        await fn(tenant);
      }
    },
    getTenant: async () => null,
    loadTenantSettings: async () => ({ configuration: {}, discordChannels: {} }),
  };
});

vi.mock('../../backend/src/games/ragnarok-origin/services/discordAttendanceCards.js', () => ({
  handleAttendanceCardInteraction: (...args) => handlerSpies.attendance(...args),
  attendanceCardWantsEphemeralAck: () => false,
  attendanceCardSkipsGatewayAck: () => true,
}));

vi.mock('../../backend/src/games/ragnarok-origin/services/discordPartyOcr.js', () => ({
  handlePartyOcrInteraction: (...args) => handlerSpies.ocr(...args),
}));

vi.mock('../../backend/src/games/ragnarok-origin/services/partyViewer.js', () => ({
  handlePartyCardInteraction: (...args) => handlerSpies.party(...args),
}));

vi.mock('../../backend/src/games/ragnarok-origin/services/discordRequestDeck.js', () => ({
  handleRequestDeckInteraction: (...args) => handlerSpies.reqcard(...args),
}));

vi.mock('../../backend/src/games/ragnarok-origin/services/discordInteractiveAuction.js', () => ({
  handleAuctionInteraction: (...args) => handlerSpies.auction(...args),
}));

vi.mock('../../backend/src/games/ragnarok-origin/services/discordOnboardingCard.js', () => ({
  handleOnboardingCardInteraction: (...args) => handlerSpies.onboard(...args),
  classifyOnboardingAck: (interaction) => {
    const id = interaction?.customId || '';
    if (id === 'onboard:back') return { ack: 'deferUpdate', view: 'hub' };
    if (String(id).startsWith('onboard:')) return { ack: 'deferReply', view: 'topic', topic: 'auction' };
    return { ack: 'noop', view: 'none' };
  },
}));

vi.mock('../../backend/src/games/ragnarok-origin/services/discordJobEmojis.js', () => ({
  syncJobIconEmojis: async () => undefined,
}));

vi.mock('../../backend/src/utils/discordRateLimit.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    hydrateDiscordCircuit: async () => undefined,
    isDiscordCircuitOpen: () => false,
    getDiscordRateLimitStatus: () => ({
      circuitOpen: false,
      circuitRemainingMs: 0,
      untilHuman: '',
      remainingHuman: 'none',
    }),
  };
});

const { initializeDiscordBot, discordClient } = await import('../../backend/src/discord-bot/client.js');
const { clearGuildCommands } = await import('../../backend/src/discord-bot/deployGuild.js');

async function stubGatewayAndLogin(run) {
  const originalLogin = discordClient.login.bind(discordClient);
  const loginSpy = vi.fn(async () => 'stubbed-login');
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
  Object.defineProperty(discordClient, 'isReady', {
    configurable: true,
    value: () => false,
  });

  const realSetInterval = global.setInterval;
  const realSetTimeout = global.setTimeout;
  const inertTimers = [];
  const inertTimeouts = [];
  global.setInterval = (cb, ms) => {
    const id = realSetInterval(() => {}, 1e9);
    inertTimers.push({ id, cb, ms });
    return id;
  };
  global.setTimeout = (cb, ms, ...args) => {
    // Swallow bot login retry / readyWatch timers — do not hit real Discord.
    const id = realSetTimeout(() => {}, 1e9);
    inertTimeouts.push(id);
    return id;
  };

  discordClient.removeAllListeners('ready');
  discordClient.removeAllListeners('clientReady');
  discordClient.removeAllListeners('interactionCreate');

  try {
    await initializeDiscordBot();
    return await run({ inertTimers, loginSpy });
  } finally {
    for (const t of inertTimers) clearInterval(t.id);
    for (const id of inertTimeouts) clearTimeout(id);
    global.setInterval = realSetInterval;
    global.setTimeout = realSetTimeout;
    Object.defineProperty(discordClient, 'isReady', {
      configurable: true,
      value: originalIsReady,
    });
    discordClient.login = originalLogin;
    globalThis.fetch = originalFetch;
  }
}

/** Real REST.put seam: empty body clears guild slash registry (Discord stubbed). */
export async function clearGuildCommandsEmptiesRegistry() {
  return withEnv({
    DISCORD_BOT_TOKEN: 'unit-clear-token',
    DISCORD_CLIENT_ID: 'unit-clear-client',
  }, async () => {
    const put = vi.spyOn(REST.prototype, 'put').mockResolvedValue([]);
    const setToken = vi.spyOn(REST.prototype, 'setToken').mockReturnThis();
    try {
      // Use the real implementation, not the vi.mock wrapper — re-import original via unmock path.
      // The mock replaces clearGuildCommands; call Routes body assertion through REST.prototype.put
      // by invoking the mocked fn after temporarily using actual module method:
      const actual = await vi.importActual('../../backend/src/discord-bot/deployGuild.js');
      await actual.clearGuildCommands('guild-clear-1');
      const route = put.mock.calls[0]?.[0];
      const body = put.mock.calls[0]?.[1];
      return {
        putCalls: put.mock.calls.length,
        route,
        body,
        emptied: Array.isArray(body?.body) && body.body.length === 0,
        expectedRoute: Routes.applicationGuildCommands('unit-clear-client', 'guild-clear-1'),
      };
    } finally {
      put.mockRestore();
      setToken.mockRestore();
    }
  });
}


async function waitForClears(minCount, timeoutMs = 500) {
  const start = Date.now();
  while (clearState.calls.length < minCount && Date.now() - start < timeoutMs) {
    await new Promise((r) => setImmediate(r));
  }
}

export async function readyClearsEachOnboardedTenant() {
  return withEnv({ DISCORD_BOT_TOKEN: 'unit-bot-token' }, async () => {
    clearState.calls = [];
    clearState.failIds.clear();
    onboarded.tenants = [{ id: 'guild-a' }, { id: 'guild-b' }];
    handlerSpies.attendance.mockClear();
    return stubGatewayAndLogin(async () => {
      discordClient.emit('ready');
      await waitForClears(2);
      return { cleared: [...clearState.calls] };
    });
  });
}

export async function perTenantClearFailureContinues() {
  return withEnv({ DISCORD_BOT_TOKEN: 'unit-bot-token' }, async () => {
    clearState.calls = [];
    clearState.failIds = new Set(['guild-fail']);
    onboarded.tenants = [{ id: 'guild-fail' }, { id: 'guild-ok' }];
    const warnings = [];
    const origWarn = console.warn;
    console.warn = (...args) => { warnings.push(args.map(String).join(' ')); };
    try {
      return await stubGatewayAndLogin(async () => {
        discordClient.emit('ready');
        await waitForClears(2);
        return {
          cleared: [...clearState.calls],
          warnings,
          processAlive: true,
        };
      });
    } finally {
      console.warn = origWarn;
    }
  });
}

export async function slashInvokeEphemeralRedirectNoReregister() {
  return withEnv({ DISCORD_BOT_TOKEN: 'unit-bot-token' }, async () => {
    clearState.calls = [];
    clearState.failIds.clear();
    onboarded.tenants = [];
    const reply = vi.fn(async () => undefined);
    reply.catch = () => reply;
    return stubGatewayAndLogin(async () => {
      discordClient.emit('ready');
      await new Promise((r) => setImmediate(r));
      const clearsBefore = clearState.calls.length;
      const interaction = {
        guildId: 'guild-slash',
        isButton: () => false,
        isStringSelectMenu: () => false,
        isModalSubmit: () => false,
        isChatInputCommand: () => true,
        customId: undefined,
        replied: false,
        deferred: false,
        reply: Object.assign(reply, { catch: () => Promise.resolve() }),
      };
      const listeners = discordClient.listeners('interactionCreate');
      await Promise.all(listeners.map((fn) => Promise.resolve(fn(interaction))));
      return {
        replyArgs: reply.mock.calls[0]?.[0],
        clearCallsAfterSlash: clearState.calls.length - clearsBefore,
        handlerHits: {
          attendance: handlerSpies.attendance.mock.calls.length,
          auction: handlerSpies.auction.mock.calls.length,
        },
      };
    });
  });
}

export { handlerSpies, clearState, onboarded, stubGatewayAndLogin, discordClient };

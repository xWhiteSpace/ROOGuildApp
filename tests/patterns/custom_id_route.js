import { patterns } from './registry.js';
import {
  handlerSpies,
  stubGatewayAndLogin,
  discordClient,
  onboarded,
  clearState,
} from './slash_clear_on_ready.js';
import { withEnv } from './envSandbox.js';
import { vi } from 'vitest';

patterns.custom_id_route = 'used';
patterns.general_room_bypass = 'used';

function buttonInteraction(customId) {
  return {
    guildId: 'guild-route-1',
    customId,
    isButton: () => true,
    isStringSelectMenu: () => false,
    isModalSubmit: () => false,
    isChatInputCommand: () => false,
    replied: false,
    deferred: false,
    deferUpdate: vi.fn(async () => undefined),
    deferReply: vi.fn(async () => undefined),
    reply: vi.fn(async () => undefined),
  };
}

async function emitInteraction(interaction) {
  const pending = [];
  const listeners = discordClient.listeners('interactionCreate');
  for (const listener of listeners) {
    pending.push(Promise.resolve(listener(interaction)));
  }
  await Promise.all(pending);
}

async function withReadyRouter(run) {
  return withEnv({ DISCORD_BOT_TOKEN: 'unit-bot-token' }, async () => {
    clearState.calls = [];
    clearState.failIds.clear();
    onboarded.tenants = [];
    for (const spy of Object.values(handlerSpies)) spy.mockClear();
    return stubGatewayAndLogin(async () => {
      discordClient.emit('ready');
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
      return run();
    });
  });
}

/**
 * Real seam: interactionCreate routes card customId prefixes before any
 * general-room gate. Current client.js has no remaining genroom gate after
 * the card/slash branches — "skips the gate" means handlers are reached
 * without a channel-id check (none is applied on these routes).
 */
export async function routeAttcardSkipsGate() {
  return withReadyRouter(async () => {
    const interaction = buttonInteraction('attcard:open');
    await emitInteraction(interaction);
    return {
      dispatched: handlerSpies.attendance.mock.calls.length === 1,
      others: {
        ocr: handlerSpies.ocr.mock.calls.length,
        party: handlerSpies.party.mock.calls.length,
        reqcard: handlerSpies.reqcard.mock.calls.length,
        auction: handlerSpies.auction.mock.calls.length,
        onboard: handlerSpies.onboard.mock.calls.length,
      },
      gateApplied: false,
    };
  });
}

export async function routeOcrSkipsGate() {
  return withReadyRouter(async () => {
    const interaction = buttonInteraction('ocr:scan');
    await emitInteraction(interaction);
    return {
      dispatched: handlerSpies.ocr.mock.calls.length === 1,
      others: {
        attendance: handlerSpies.attendance.mock.calls.length,
        party: handlerSpies.party.mock.calls.length,
      },
      gateApplied: false,
    };
  });
}

export async function routePartycardSkipsGate() {
  return withReadyRouter(async () => {
    const interaction = buttonInteraction('partycard:open');
    await emitInteraction(interaction);
    return {
      dispatched: handlerSpies.party.mock.calls.length === 1,
      gateApplied: false,
    };
  });
}

export async function routeReqcardSkipsGate() {
  return withReadyRouter(async () => {
    const interaction = buttonInteraction('reqcard:open');
    await emitInteraction(interaction);
    return {
      dispatched: handlerSpies.reqcard.mock.calls.length === 1,
      gateApplied: false,
    };
  });
}

export async function routeAuctionClaimSkipsGate() {
  return withReadyRouter(async () => {
    const interaction = buttonInteraction('claim_slot_btn_0');
    await emitInteraction(interaction);
    return {
      dispatched: handlerSpies.auction.mock.calls.length === 1,
      gateApplied: false,
    };
  });
}

export async function routeOnboardSkipsGate() {
  return withReadyRouter(async () => {
    const interaction = buttonInteraction('onboard:auction');
    await emitInteraction(interaction);
    return {
      dispatched: handlerSpies.onboard.mock.calls.length === 1,
      gateApplied: false,
    };
  });
}

export async function unknownPrefixFallsThrough() {
  return withReadyRouter(async () => {
    const interaction = buttonInteraction('unknown:thing');
    await emitInteraction(interaction);
    const hits = {
      attendance: handlerSpies.attendance.mock.calls.length,
      ocr: handlerSpies.ocr.mock.calls.length,
      party: handlerSpies.party.mock.calls.length,
      reqcard: handlerSpies.reqcard.mock.calls.length,
      auction: handlerSpies.auction.mock.calls.length,
      onboard: handlerSpies.onboard.mock.calls.length,
    };
    return {
      cardRouteHits: Object.values(hits).reduce((a, b) => a + b, 0),
      hits,
    };
  });
}

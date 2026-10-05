import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';

patterns.ocr_pointer = 'used';
patterns.pointer_noop = 'used';

const hold = vi.hoisted(() => ({
  edits: [],
  fetchThrows: false,
  swordCalls: 0,
}));

vi.mock('../../backend/src/discord-bot/client.js', () => ({
  discordClient: {
    isReady: () => true,
    channels: {
      fetch: async (channelId) => {
        if (hold.fetchThrows) throw new Error('discord edit boom');
        return {
          id: channelId,
          messages: {
            fetch: async (messageId) => ({
              id: messageId,
              edit: async (payload) => {
                hold.edits.push(payload);
                return payload;
              },
            }),
          },
        };
      },
    },
  },
}));

vi.mock('../../backend/src/utils/discordRateLimit.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    enqueueDiscordCall: async (fn) => fn(),
    isDiscordCircuitOpen: () => false,
  };
});

vi.mock('../../backend/src/games/ragnarok-origin/services/inGameStatus.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    commitInGameForEvent: async (...args) => {
      hold.swordCalls += 1;
      return actual.commitInGameForEvent?.(...args) ?? { mode: 'pending' };
    },
  };
});

const {
  refreshReviewMessage,
  buildReviewComponents,
} = await import('../../backend/src/games/ragnarok-origin/services/discordPartyOcr.js');

function sampleReview(overrides = {}) {
  return {
    id: 'rev1',
    status: 'draft',
    eventTitle: 'GvG Night',
    eventKey: 'evt1',
    eventDate: '2026-10-07',
    ocrMatches: { u1: { ocrText: 'Ada', score: 0.9 } },
    unmatched: [{ id: 'x1' }],
    present: { u1: {} },
    absent: ['u2'],
    createdByName: 'Officer',
    reviewChannelId: '111',
    reviewMessageId: '222',
    source: { attachmentUrls: [] },
    ...overrides,
  };
}

export async function pointerEmbedShowsEventCountsStatus() {
  return withEnv({ FRONTEND_URL: 'https://app.example.com' }, async () => {
    hold.edits = [];
    hold.fetchThrows = false;
    await refreshReviewMessage(sampleReview({ status: 'committed' }), {}, null);
    const embed = hold.edits[0]?.embeds?.[0];
    const desc = embed?.data?.description || embed?.description || '';
    return { desc, edits: hold.edits.length };
  });
}

export async function draftEmbedIncludesOpenValhalla() {
  return withEnv({ FRONTEND_URL: 'https://app.example.com' }, async () => {
    hold.edits = [];
    await refreshReviewMessage(sampleReview({ status: 'draft' }), {}, null);
    const comps = hold.edits[0]?.components || buildReviewComponents(sampleReview({ status: 'draft' }));
    const json = JSON.stringify(comps);
    return { json, hasOpen: /Open VALHALLA/i.test(json) };
  });
}

export async function missingIdsAreNoOp() {
  return withEnv({ FRONTEND_URL: 'https://app.example.com' }, async () => {
    hold.edits = [];
    await refreshReviewMessage(sampleReview({
      reviewChannelId: null,
      reviewMessageId: null,
    }), {}, null);
    return { edits: hold.edits.length };
  });
}

export async function failedDiscordEditSwallowed() {
  return withEnv({ FRONTEND_URL: 'https://app.example.com' }, async () => {
    hold.fetchThrows = true;
    hold.edits = [];
    let routeOk = false;
    let refreshErr = null;
    try {
      await refreshReviewMessage(sampleReview(), {}, null);
    } catch (e) {
      refreshErr = e;
    }
    // HTTP writer seam: routes wrap with .catch(() => {})
    await refreshReviewMessage(sampleReview(), {}, null).catch(() => {});
    routeOk = true;
    hold.fetchThrows = false;
    return {
      refreshThrew: Boolean(refreshErr),
      httpWriterContinues: routeOk,
      honesty: 'refreshReviewMessage itself can throw; ocrReview.routes wraps .catch(() => {}) so HTTP writer does not fail',
    };
  });
}

export async function pointerDoesNotWriteSwords() {
  return withEnv({ FRONTEND_URL: 'https://app.example.com' }, async () => {
    hold.swordCalls = 0;
    hold.edits = [];
    hold.fetchThrows = false;
    await refreshReviewMessage(sampleReview({ status: 'draft' }), {}, null);
    return { swordCalls: hold.swordCalls, edits: hold.edits.length };
  });
}

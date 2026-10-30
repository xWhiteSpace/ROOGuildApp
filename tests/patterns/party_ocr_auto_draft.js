import { patterns } from './registry.js';
import {
  createDraftPress,
  draftShotName,
  partyOcrInteractionKind,
  promptSentence,
  selectThreadShots,
  shouldOpenPartyOcrThread,
  threadNameFromWarDate,
} from '../../backend/src/games/ragnarok-origin/services/partyOcrPrompt.js';

patterns.party_ocr_auto_draft = 'used';

const openReady = {
  enabled: true,
  phase: 3,
  channelId: 'raid-shot',
  pointer: null,
  warDate: '2026-10-29',
  eventId: 'evt1',
};

export function skipWhenSettingOff() {
  return shouldOpenPartyOcrThread({ ...openReady, enabled: false });
}

export function skipWhenNotWar() {
  return shouldOpenPartyOcrThread({ ...openReady, phase: 2 });
}

export function skipWhenChannelMissing() {
  return shouldOpenPartyOcrThread({ ...openReady, channelId: '' });
}

export function skipWhenThreadExists() {
  return shouldOpenPartyOcrThread({ ...openReady, pointer: { threadId: 't1' } });
}

export function openOncePerWar() {
  return {
    open: shouldOpenPartyOcrThread(openReady),
    name: threadNameFromWarDate('2026-10-29'),
    sentence: promptSentence('2026-10-29'),
  };
}

function shot(id, createdTimestamp, extras = {}) {
  return {
    id,
    createdTimestamp,
    authorId: extras.authorId || 'leader',
    authorBot: extras.authorBot || false,
    attachments: extras.attachments || [],
  };
}

export function threadShotsIgnoreTextAndBot() {
  const messages = [
    shot('prompt', 1, { authorId: 'bot', authorBot: true, attachments: [] }),
    shot('talk', 2, { attachments: [] }),
    shot('pic', 3, {
      attachments: [
        { url: 'https://cdn.example/a.png', name: 'IMG_1.png', contentType: 'image/png' },
        { url: 'https://cdn.example/b.png', name: 'IMG_2.png', contentType: 'image/png' },
      ],
    }),
    shot('gallery', 4, {
      authorId: 'bot',
      authorBot: true,
      attachments: [{ url: 'https://cdn.example/gallery.png', name: 'raid.png', contentType: 'image/png' }],
    }),
  ];
  return selectThreadShots(messages, {
    botId: 'bot',
    promptMessageId: 'prompt',
    warDate: '2026-10-29',
  });
}

export function threadShotsRefuseOverEight() {
  const attachments = Array.from({ length: 9 }, (_, i) => ({
    url: `https://cdn.example/${i}.png`,
    name: `f${i}.png`,
    contentType: 'image/png',
  }));
  return selectThreadShots([shot('pile', 1, { attachments })], { warDate: '2026-10-29' });
}

export function threadShotsEmpty() {
  return selectThreadShots([shot('talk', 1)], { warDate: '2026-10-29' });
}

export function secondPressRepeatsOpenDraft() {
  return createDraftPress({ id: 'rev1', status: 'draft' });
}

export function cancelledReviewScansAgain() {
  return {
    cancelled: createDraftPress({ id: 'rev1', status: 'cancelled' }),
    missing: createDraftPress(null),
  };
}

export function retiredOpenDoesNotScan() {
  return {
    open: partyOcrInteractionKind('ocr:open'),
    grab: partyOcrInteractionKind('ocr:grab'),
    draft: partyOcrInteractionKind('ocr:create-draft'),
    name: draftShotName('2026-10-30', 2),
  };
}

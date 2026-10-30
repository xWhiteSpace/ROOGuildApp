import { patterns } from './registry.js';
import { linkOcrReading, persistReviewDictionary, unlinkOcrReading } from '../../backend/src/games/ragnarok-origin/services/discordPartyOcr.js';
import { releaseOcrCorrection } from '@guildname/shared/inGameAlias';
import { gvgResultValue } from '../../backend/src/games/ragnarok-origin/services/inGameStatus.js';

patterns.ocr_link_present = 'used';

function reviewWithGaps() {
  return {
    ocrMatches: {
      ada: { ocrText: 'Ada', score: 0.9, source: 'ocr', imageIndex: 0, ocrCol: 1, ocrRow: 1 },
    },
    present: {
      ada: { ocrText: 'Ada', score: 0.9, source: 'ocr', imageIndex: 0, ocrCol: 1, ocrRow: 1 },
    },
    absent: ['bea', 'cy'],
    unmatched: [{ id: 'u1', text: 'Beee', category: 'unmatch', imageIndex: 0, ocrCol: 2, ocrRow: 1 }],
    slotGaps: [
      { id: 'u1', text: 'Beee', category: 'unmatch', imageIndex: 0, ocrCol: 2, ocrRow: 1 },
      { id: 'm1', text: '', category: 'missing', imageIndex: 0, ocrCol: 3, ocrRow: 1 },
    ],
  };
}

const members = {
  ada: { displayName: 'Ada', ocrCorrections: [] },
  bea: { displayName: 'Bea', ocrCorrections: [] },
  cy: { displayName: 'Cy', ocrCorrections: [] },
};

export function linkUnmatchMarksPresent() {
  const review = reviewWithGaps();
  const ok = linkOcrReading(review, { unmatchedId: 'u1', toUid: 'bea', text: 'Beee', remember: false });
  return {
    ok,
    text: review.present.bea?.ocrText,
    source: review.present.bea?.source,
    col: review.present.bea?.ocrCol,
    absent: review.absent,
    gapIds: review.slotGaps.map((row) => row.id),
  };
}

export function linkMissingMarksPresent() {
  const review = reviewWithGaps();
  linkOcrReading(review, { unmatchedId: 'm1', toUid: 'cy', text: '', remember: false });
  return {
    text: review.present.cy?.ocrText ?? null,
    source: review.present.cy?.source,
    col: review.present.cy?.ocrCol,
    row: review.present.cy?.ocrRow,
    absent: review.absent,
    gapIds: review.slotGaps.map((row) => row.id),
  };
}

export async function blankMissingSkipsDictionary() {
  const review = reviewWithGaps();
  linkOcrReading(review, { unmatchedId: 'm1', toUid: 'cy', text: '', remember: false });
  const updates = [];
  const db = {
    ref() {
      return {
        update: async (payload) => {
          updates.push(payload);
        },
      };
    },
  };
  await persistReviewDictionary(db, review, members);
  return { updates, text: review.ocrMatches.cy?.ocrText ?? null };
}

export async function namedGapSkipsDictionary() {
  const review = reviewWithGaps();
  linkOcrReading(review, { unmatchedId: 'u1', toUid: 'bea', text: 'Beee', remember: false });
  const updates = [];
  const db = {
    ref() {
      return {
        update: async (payload) => {
          updates.push(payload);
        },
      };
    },
  };
  await persistReviewDictionary(db, review, members);
  return { updates, source: review.ocrMatches.bea?.source };
}

export function moveClearsPrevious() {
  const review = reviewWithGaps();
  linkOcrReading(review, { fromUid: 'ada', toUid: 'bea', text: 'Ada', remember: true });
  return {
    adaPresent: Object.prototype.hasOwnProperty.call(review.present, 'ada'),
    beaText: review.present.bea?.ocrText,
    source: review.present.bea?.source,
    absent: review.absent,
    adaMatch: review.ocrMatches.ada || null,
  };
}

export function unlinkRestoresGap() {
  const review = reviewWithGaps();
  linkOcrReading(review, { unmatchedId: 'u1', toUid: 'bea', text: 'Beee', remember: true });
  const gap = unlinkOcrReading(review, 'bea');
  const members = {
    bea: { displayName: 'Bea', ocrCorrections: ['Beee', 'Bee'] },
  };
  return {
    gapText: gap?.text,
    category: gap?.category,
    col: gap?.ocrCol,
    stillPresent: Boolean(review.present.bea),
    presentText: review.present.bea?.ocrText,
    match: review.ocrMatches.bea || null,
    gapIds: review.slotGaps.map((row) => row.text),
    forgotten: releaseOcrCorrection(members, 'bea', 'Beee'),
  };
}

export function resultWheel() {
  return {
    win: gvgResultValue('Win'),
    down: gvgResultValue('↓5th'),
    other: gvgResultValue('Draw'),
  };
}

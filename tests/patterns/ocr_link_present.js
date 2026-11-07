import { patterns } from './registry.js';
import { linkOcrReading, persistReviewDictionary, setOcrDictionaryMark, unlinkOcrReading } from '../../backend/src/games/ragnarok-origin/services/discordPartyOcr.js';
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

export function registerToggleKeepsSeat() {
  const review = reviewWithGaps();
  const on = setOcrDictionaryMark(review, 'ada', true);
  const marked = {
    on,
    text: review.ocrMatches.ada.ocrText,
    score: review.ocrMatches.ada.score,
    present: Boolean(review.present.ada),
    source: review.ocrMatches.ada.source,
    presentSource: review.present.ada.source,
  };
  const off = setOcrDictionaryMark(review, 'ada', false);
  return {
    ...marked,
    off,
    cleared: review.ocrMatches.ada.source,
    clearedPresent: review.present.ada.source,
    stillText: review.ocrMatches.ada.ocrText,
    stillPresent: Boolean(review.present.ada),
  };
}

export async function registerOffSkipsDictionary() {
  const review = reviewWithGaps();
  setOcrDictionaryMark(review, 'ada', true);
  setOcrDictionaryMark(review, 'ada', false);
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
  return { updates, source: review.ocrMatches.ada.source };
}

export function linkOverExistingReturnsPrevious() {
  const review = reviewWithGaps();
  review.ocrMatches.ada.source = 'dictionary';
  review.present.ada.source = 'dictionary';
  const ok = linkOcrReading(review, {
    unmatchedId: 'u1',
    toUid: 'ada',
    text: 'Beee',
    remember: false,
    displacedGapId: 'back1',
  });
  return {
    ok,
    adaText: review.ocrMatches.ada.ocrText,
    adaCol: review.ocrMatches.ada.ocrCol,
    adaRow: review.ocrMatches.ada.ocrRow,
    adaSource: review.ocrMatches.ada.source,
    adaScore: review.ocrMatches.ada.score,
    adaPresent: Boolean(review.present.ada),
    presentText: review.present.ada?.ocrText,
    absent: review.absent,
    returned: review.unmatched.find((row) => row.id === 'back1') || null,
    gapIds: review.slotGaps.map((row) => row.id),
  };
}

export function linkOverAbsentKeepsMark() {
  const review = reviewWithGaps();
  delete review.present.ada;
  review.absent = ['ada', 'bea', 'cy'];
  linkOcrReading(review, {
    unmatchedId: 'u1',
    toUid: 'ada',
    text: 'Beee',
    remember: false,
    displacedGapId: 'back2',
  });
  return {
    present: Boolean(review.present.ada),
    absent: review.absent,
    text: review.ocrMatches.ada.ocrText,
    source: review.ocrMatches.ada.source,
    returned: review.unmatched.find((row) => row.id === 'back2')?.text || '',
  };
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

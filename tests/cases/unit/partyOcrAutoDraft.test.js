import { describe, expect, it } from 'vitest';
import {
  cancelledReviewScansAgain,
  openOncePerWar,
  retiredOpenDoesNotScan,
  secondPressRepeatsOpenDraft,
  skipWhenChannelMissing,
  skipWhenNotWar,
  skipWhenSettingOff,
  skipWhenThreadExists,
  threadShotsEmpty,
  threadShotsIgnoreTextAndBot,
  threadShotsRefuseOverEight,
} from '../../patterns/party_ocr_auto_draft.js';

describe('Party OCR auto compose draft', () => {
  it('skips the thread when the setting is off, the phase is not War, the channel is missing, or a thread already exists', () => {
    expect(skipWhenSettingOff()).toBe(false);
    expect(skipWhenNotWar()).toBe(false);
    expect(skipWhenChannelMissing()).toBe(false);
    expect(skipWhenThreadExists()).toBe(false);
  });

  it('opens one thread named for the war date', () => {
    const opened = openOncePerWar();
    expect(opened.open).toBe(true);
    expect(opened.name).toBe('GVG 1029');
    expect(opened.sentence).toBe([
      'GVG Event 2026-10-29',
      '1. Party leaders post Team Party screenshots in this thread.',
      '2. Press Create draft only after the pictures are here.',
    ].join('\n'));
  });

  it('keeps people\'s pictures in order and skips text, the prompt, and bot images', () => {
    const selected = threadShotsIgnoreTextAndBot();
    expect(selected.overLimit).toBe(false);
    expect(selected.count).toBe(2);
    expect(selected.shots.map((shot) => shot.name)).toEqual(['1029-01', '1029-02']);
    expect(selected.shots[0].url).toBe('https://cdn.example/a.png');
  });

  it('refuses an empty thread and a thread with more than 8 screenshots', () => {
    expect(threadShotsEmpty()).toMatchObject({ count: 0, overLimit: false, shots: [] });
    expect(threadShotsRefuseOverEight()).toMatchObject({ count: 9, overLimit: true, shots: [] });
  });

  it('repeats the link while a draft is open and scans again after cancel', () => {
    expect(secondPressRepeatsOpenDraft()).toBe('repeat');
    const again = cancelledReviewScansAgain();
    expect(again.cancelled).toBe('scan');
    expect(again.missing).toBe('scan');
  });

  it('treats a leftover Scan button as retired', () => {
    const kind = retiredOpenDoesNotScan();
    expect(kind.open).toBe('retired');
    expect(kind.grab).toBe('retired');
    expect(kind.draft).toBe('create-draft');
    expect(kind.name).toBe('1030-02');
  });
});

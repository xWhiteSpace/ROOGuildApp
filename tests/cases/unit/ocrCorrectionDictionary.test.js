import { describe, expect, it } from 'vitest';
import { claimOcrCorrection, matchOcrTokensToRoster } from '@guildname/shared/inGameAlias';

function rosterMember(name, extra = {}) {
  return {
    displayName: name,
    inGameName: name,
    isRaidRoster: true,
    status: 'Active',
    ...extra,
  };
}

describe('OCR correction dictionary second pass', () => {
  it('matches a stored OCR string at score 1 when fuzzy would prefer someone else', () => {
    const members = {
      john: rosterMember('Johnathan', { ocrCorrections: ['jonn'] }),
      jon: rosterMember('Jon'),
    };
    const result = matchOcrTokensToRoster(['jonn'], members);
    expect(result.matched).toEqual([
      expect.objectContaining({ uid: 'john', ocrText: 'jonn', score: 1, via: 'dictionary' }),
    ]);
    expect(result.unmatched).toEqual([]);
  });

  it('matches a stored OCR string that fuzzy would miss', () => {
    const members = {
      note: rosterMember('Azrielle', { ocrCorrections: ['il0'] }),
      other: rosterMember('Othername'),
    };
    const result = matchOcrTokensToRoster(['il0'], members);
    expect(result.matched[0]).toEqual(expect.objectContaining({
      uid: 'note',
      score: 1,
      via: 'dictionary',
    }));
  });

  it('leaves a shared token unmatched', () => {
    const members = {
      john: rosterMember('John', { ocrCorrections: ['jonn'] }),
      jane: rosterMember('Jane', { ocrCorrections: ['Jonn'] }),
    };
    const result = matchOcrTokensToRoster(['jonn'], members);
    expect(result.matched).toEqual([]);
    expect(result.unmatched.map((row) => row.text)).toEqual(['jonn']);
  });

  it('keeps fuzzy matching when nobody stored the reading', () => {
    const members = {
      john: rosterMember('John'),
    };
    const result = matchOcrTokensToRoster(['John'], members);
    expect(result.matched[0]).toEqual(expect.objectContaining({ uid: 'john', via: 'fuzzy', score: 1 }));
  });

  it('gives a token to one member and takes it off the others', () => {
    const members = {
      john: rosterMember('John', { ocrCorrections: ['jonh'] }),
      jane: rosterMember('Jane', { ocrCorrections: ['jonn', 'janee'] }),
    };
    const changed = claimOcrCorrection(members, 'john', 'jonn');
    expect(changed.john).toEqual(['jonh', 'jonn']);
    expect(changed.jane).toEqual(['janee']);
  });
});

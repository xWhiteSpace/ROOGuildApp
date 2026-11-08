import { describe, expect, it } from 'vitest';
import {
  registryStartPages,
  sameItemContinuesAcrossRows,
  shortSeatListLeavesLaterCoordsAvailable,
} from '../../patterns/auction_book_layout.js';

describe('Auction book follows loot-registry coordinates', () => {
  it('places item_002 at page 3 and item_003 at page 17 through page 42', () => {
    const book = registryStartPages();
    expect(book.pageCount).toBe(42);
    expect(book.item002Count).toBe(56);
    expect(book.item003Count).toBe(102);
    expect(book.first002).toMatchObject({ name: 'Ada', page: 3, slot: 1, index: 0, status: 'Selected' });
    expect(book.second002).toMatchObject({ name: '', page: 3, slot: 2, index: 1, status: 'NotSelected' });
    expect(book.last002).toMatchObject({ page: 16, slot: 4 });
    expect(book.first003).toMatchObject({ name: 'Ben', page: 17, slot: 1, index: 0, status: 'Selected' });
    expect(book.page42Slots).toEqual([1, 2]);
    expect(book.item002OnPagesBeforeStart).toBe(false);
    expect(book.uncoveredPagesEmitted).toBe(false);
    expect(book.orphanEmitted).toBe(false);
  });

  it('leaves a coordinate with no seat as Available', () => {
    expect(shortSeatListLeavesLaterCoordsAvailable()).toEqual([
      { name: 'Ada', page: 3, slot: 1, index: 0, status: 'Selected' },
      { name: '', page: 3, slot: 2, index: 1, status: 'NotSelected' },
    ]);
  });

  it('continues the same item across a later row instead of restarting at page 1', () => {
    expect(sameItemContinuesAcrossRows()).toEqual([
      { name: 'Ada', page: 3, slot: 1, index: 0, status: 'Selected' },
      { name: 'Ben', page: 3, slot: 2, index: 1, status: 'Selected' },
      { name: 'Cara', page: 5, slot: 1, index: 2, status: 'Selected' },
    ]);
  });
});

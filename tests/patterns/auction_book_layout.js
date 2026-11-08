import { patterns } from './registry.js';
import { auctionBookPageCount, placeAuctionBookSlots } from '@guildname/shared/auctionBookLayout';

patterns.auction_book_layout = 'used';

const QTY_PER_PAGE = 4;

function seats(count, firstName) {
  return [firstName, ...Array(Math.max(0, count - 1)).fill('')];
}

function reportedBook() {
  const lootRows = [
    { id: 1, itemType: 'item_002', startPage: 3, startPos: 1, endPage: 16, endPos: 4 },
    { id: 2, itemType: 'item_003', startPage: 17, startPos: 1, endPage: 42, endPos: 2 },
  ];
  const slots = placeAuctionBookSlots({
    items: [
      { id: 'item_003', name: 'Item 003' },
      { id: 'item_002', name: 'Item 002' },
    ],
    lootRows,
    categoryAllocations: {
      item_002: { selected: seats(56, 'Ada') },
      item_003: { selected: seats(102, 'Ben') },
      item_orphan: { selected: ['Cara'] },
    },
    qtyPerPage: QTY_PER_PAGE,
  });
  const item002 = slots.filter((slot) => slot.itemType === 'item_002');
  const item003 = slots.filter((slot) => slot.itemType === 'item_003');
  return { slots, item002, item003, pageCount: auctionBookPageCount(lootRows) };
}

export function registryStartPages() {
  const { slots, item002, item003, pageCount } = reportedBook();
  return {
    pageCount,
    first002: item002[0],
    second002: item002[1],
    last002: item002[item002.length - 1],
    first003: item003[0],
    item002Count: item002.length,
    item003Count: item003.length,
    item002OnPagesBeforeStart: item002.some((slot) => slot.page < 3),
    uncoveredPagesEmitted: slots.some((slot) => slot.page < 3),
    page42Slots: slots.filter((slot) => slot.page === 42).map((slot) => slot.slot),
    orphanEmitted: slots.some((slot) => slot.itemType === 'item_orphan'),
  };
}

export function shortSeatListLeavesLaterCoordsAvailable() {
  const slots = placeAuctionBookSlots({
    items: [{ id: 'item_002', name: 'Item 002' }],
    lootRows: [
      { itemType: 'item_002', startPage: 3, startPos: 1, endPage: 3, endPos: 2 },
    ],
    categoryAllocations: {
      item_002: { selected: ['Ada'] },
    },
    qtyPerPage: QTY_PER_PAGE,
  });
  return slots.map((slot) => ({
    name: slot.name,
    page: slot.page,
    slot: slot.slot,
    index: slot.index,
    status: slot.status,
  }));
}

export function sameItemContinuesAcrossRows() {
  const slots = placeAuctionBookSlots({
    items: [{ id: 'item_002', name: 'Item 002' }],
    lootRows: [
      { itemType: 'item_002', startPage: 3, startPos: 1, endPage: 3, endPos: 2 },
      { itemType: 'item_002', startPage: 5, startPos: 1, endPage: 5, endPos: 1 },
    ],
    categoryAllocations: {
      item_002: { selected: ['Ada', 'Ben', 'Cara'] },
    },
    qtyPerPage: QTY_PER_PAGE,
  });
  return slots.map((slot) => ({
    name: slot.name,
    page: slot.page,
    slot: slot.slot,
    index: slot.index,
    status: slot.status,
  }));
}

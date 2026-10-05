import { patterns } from './registry.js';
import { buildAllocateBidRows } from '@guildname/shared/allocatePreview';

patterns.allocate_rows = 'used';
patterns.rank_label = 'used';

const ROW_KEYS = ['key', 'itemId', 'itemName', 'uid', 'name', 'rank', 'rankLabel', 'priority'];

export function onlyItemsWithLootQty() {
  const result = buildAllocateBidRows({
    items: [
      { id: 'itemA', name: 'Alpha' },
      { id: 'itemB', name: 'Beta' },
    ],
    lootSummary: {
      itemA: { qty: 2, limit: 2 },
      itemB: { qty: 0, limit: 2 },
    },
    categoryAllocations: {
      itemA: { selected: ['111'] },
      itemB: { selected: ['222'] },
    },
    rankingsByItem: {
      itemA: ['111', '333'],
      itemB: ['222'],
    },
    requestsByItemDetails: {
      itemA: { '111': { name: 'Ada', priority: 3 }, '333': { name: 'Cara', priority: 1 } },
      itemB: { '222': { name: 'Ben', priority: 2 } },
    },
    members: {
      '111': { displayName: 'Ada' },
      '222': { displayName: 'Ben' },
      '333': { displayName: 'Cara' },
    },
  });
  return result;
}

export function selectedUniqueOrdered() {
  return buildAllocateBidRows({
    items: [{ id: 'itemA', name: 'Alpha' }],
    lootSummary: { itemA: { qty: 3 } },
    categoryAllocations: {
      itemA: { selected: ['', '333', '111', '111', ''] },
    },
    rankingsByItem: { itemA: ['111', '222', '333'] },
    requestsByItemDetails: {
      itemA: {
        '111': { name: 'Ada', priority: 5 },
        '333': { name: 'Cara', priority: 2 },
      },
    },
    members: {
      '111': { displayName: 'Ada' },
      '333': { displayName: 'Cara' },
    },
  });
}

export function notSelectedMinusSelected() {
  return buildAllocateBidRows({
    items: [{ id: 'itemA', name: 'Alpha' }],
    lootSummary: { itemA: { qty: 1 } },
    categoryAllocations: { itemA: { selected: ['111'] } },
    rankingsByItem: { itemA: ['111', '222', '333'] },
    requestsByItemDetails: {
      itemA: {
        '111': { priority: 1 },
        '222': { priority: 2 },
        '333': { priority: 3 },
      },
    },
    members: {
      '111': { displayName: 'Ada' },
      '222': { displayName: 'Ben' },
      '333': { displayName: 'Cara' },
    },
  });
}

export function rowFieldShapeAndLabels() {
  const result = buildAllocateBidRows({
    items: [{ id: 'itemA', name: 'Alpha' }],
    lootSummary: { itemA: { qty: 1 } },
    categoryAllocations: { itemA: { selected: ['999'] } },
    rankingsByItem: { itemA: ['111'] },
    requestsByItemDetails: { itemA: { '111': { priority: 4 } } },
    members: { '111': { displayName: 'Ada' }, '999': { displayName: 'Zed' } },
  });
  return { result, ROW_KEYS };
}

export function missingPriorityIsZero() {
  return buildAllocateBidRows({
    items: [{ id: 'itemA', name: 'Alpha' }],
    lootSummary: { itemA: { qty: 1 } },
    categoryAllocations: { itemA: { selected: ['111'] } },
    rankingsByItem: { itemA: ['111'] },
    requestsByItemDetails: { itemA: {} },
    members: { '111': { displayName: 'Ada' } },
  });
}

export function oneRowPerItemMemberNotPerSlot() {
  return buildAllocateBidRows({
    items: [{ id: 'itemA', name: 'Alpha' }],
    lootSummary: { itemA: { qty: 2 } },
    categoryAllocations: { itemA: { selected: ['111', '111'] } },
    rankingsByItem: { itemA: ['111'] },
    requestsByItemDetails: { itemA: { '111': { priority: 1 } } },
    members: { '111': { displayName: 'Ada' } },
  });
}

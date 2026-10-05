import { describe, expect, it } from 'vitest';
import {
  missingPriorityIsZero,
  notSelectedMinusSelected,
  oneRowPerItemMemberNotPerSlot,
  onlyItemsWithLootQty,
  rowFieldShapeAndLabels,
  selectedUniqueOrdered,
} from '../../patterns/allocate_rows.js';

describe('TST-ROO-089 AllocateBidRows builds one row per item and member', () => {
  it('Only items with lootSummary qty greater than 0 are listed', () => {
    const { selectedRows, notSelectedRows } = onlyItemsWithLootQty();
    const ids = [...selectedRows, ...notSelectedRows].map((r) => r.itemId);
    expect(ids.every((id) => id === 'itemA')).toBe(true);
    expect(ids.includes('itemB')).toBe(false);
  });

  it('Selected rows are unique non-empty uids ordered by rank then uid', () => {
    const { selectedRows } = selectedUniqueOrdered();
    expect(selectedRows.map((r) => r.uid)).toEqual(['111', '333']);
    expect(selectedRows.every((r) => r.uid)).toBe(true);
  });

  it('Not-selected rows are the ranking minus selected uids, in ranking order', () => {
    const { notSelectedRows } = notSelectedMinusSelected();
    expect(notSelectedRows.map((r) => r.uid)).toEqual(['222', '333']);
  });

  it('Each row has only the named fields', () => {
    const { result, ROW_KEYS } = rowFieldShapeAndLabels();
    for (const row of [...result.selectedRows, ...result.notSelectedRows]) {
      expect(Object.keys(row).sort()).toEqual([...ROW_KEYS].sort());
    }
  });

  it('rankLabel is the 1-based ranking index padded to two digits', () => {
    const { selectedRows } = selectedUniqueOrdered();
    expect(selectedRows.find((r) => r.uid === '111').rankLabel).toBe('01');
  });

  it('A uid missing from the ranking gets an em dash rankLabel', () => {
    const { result } = rowFieldShapeAndLabels();
    const missing = result.selectedRows.find((r) => r.uid === '999');
    expect(missing.rankLabel).toBe('—');
  });

  it('Missing lobby priority is 0', () => {
    const { selectedRows } = missingPriorityIsZero();
    expect(selectedRows[0].priority).toBe(0);
  });

  it('One row per item and member, not per loot slot', () => {
    const { selectedRows } = oneRowPerItemMemberNotPerSlot();
    expect(selectedRows).toHaveLength(1);
    expect(selectedRows[0].uid).toBe('111');
  });
});

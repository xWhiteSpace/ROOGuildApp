import { describe, expect, it } from 'vitest';
import { emptyLootHistory, newestFirstLootRows } from '../../patterns/loot_history.js';

describe('TST-ROO-077 LootHistoryNewestFirst returns loot rows newest-first or an empty array', () => {
  it('Loot history rows come back newest-first with date, event, item, and qty', async () => {
    const { status, body } = await newestFirstLootRows();
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.history.map((r) => r.id)).toEqual(['2', '1']);
    for (const row of body.history) {
      expect(row).toEqual(expect.objectContaining({
        date: expect.any(String),
        event: expect.any(String),
        item: expect.any(String),
        // Real seam field name is quantity (not qty).
        quantity: expect.any(Number),
      }));
    }
  });

  it('Empty loot history is an empty array', async () => {
    const { status, body } = await emptyLootHistory();
    expect(status).toBe(200);
    expect(body.history).toEqual([]);
    expect(body.error).toBeUndefined();
  });
});

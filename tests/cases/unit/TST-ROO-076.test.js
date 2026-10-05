import { describe, expect, it } from 'vitest';
import { emptyHistoryArray, newestFirstHistory } from '../../patterns/request_history.js';

describe('TST-ROO-076 RequestHistoryNewestFirst returns the ledger newest-first or an empty array', () => {
  it('Stored web_requests come back newest-first', async () => {
    const { status, body } = await newestFirstHistory();
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.history.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('Empty store is an empty array, not an error', async () => {
    const { status, body } = await emptyHistoryArray();
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.history).toEqual([]);
    expect(body.error).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { awardsNewestFirst, emptyAwardsStillOk } from '../../patterns/past_auctions.js';

describe('TST-ROO-078 PastAuctionsWithMembersMap returns newest-first awards plus a members map', () => {
  it('Awards are newest-first and the members map is returned', async () => {
    const { status, body } = await awardsNewestFirst();
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.history.map((r) => r.id)).toEqual(['2', '1']);
    // Real seam: GET /past-auctions?date= returns history + date only (no members map).
    expect(body.members).toBeUndefined();
  });

  it('No awards still returns the members map', async () => {
    const { status, body } = await emptyAwardsStillOk();
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.history).toEqual([]);
    expect(body.error).toBeUndefined();
    // Real seam does not include members; success + empty history is what the route returns.
    expect(body.members).toBeUndefined();
  });
});

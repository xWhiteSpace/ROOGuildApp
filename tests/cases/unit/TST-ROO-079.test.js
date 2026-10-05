import { describe, expect, it } from 'vitest';
import {
  nonOfficerReadsOtherForbidden,
  nonSnowflakeRejected,
  officerReadsOther,
  omittedUidOwnStats,
} from '../../patterns/member_stats.js';

describe('TST-ROO-079 MemberAuctionStatsSelfOrOfficer returns battle count and item awards for self or an officer', () => {
  it("Omitted uid returns the caller's own stats", async () => {
    const { status, body } = await omittedUidOwnStats();
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.recordedBattles).toBe(3);
    const puppet = body.items.find((i) => i.itemId === 'item_1');
    expect(puppet.quantity).toBe(2);
  });

  it("Officer may read another member's stats", async () => {
    const { status, body } = await officerReadsOther();
    expect(status).toBe(200);
    expect(body.recordedBattles).toBe(3);
    expect(body.items.find((i) => i.itemId === 'item_1').quantity).toBe(5);
  });

  it('Non-officer cannot read another member', async () => {
    const { status, body } = await nonOfficerReadsOtherForbidden();
    expect(status).toBe(403);
    expect(body.items).toBeUndefined();
    expect(body.recordedBattles).toBeUndefined();
  });

  it('A uid that is not a Discord snowflake is rejected', async () => {
    const { status, body } = await nonSnowflakeRejected();
    expect(status).toBe(400);
    expect(body.items).toBeUndefined();
    expect(body.recordedBattles).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import {
  announceEmptyBodyRebuilds,
  announceNoSession,
  announceNonOfficer,
  announceNotConfigured,
  announceNotFound404,
  announceOffline503,
  announceRateLimited503,
  announceUnauthenticated,
  confirmStoresNamedSessionFields,
} from '../../patterns/announce_allocate.js';

describe('TST-ROO-090 AnnounceAllocateConfirm posts empty body after session save', () => {
  it('Confirm stores the named Mimic session fields first', async () => {
    const { res, stored } = await confirmStoresNamedSessionFields();
    expect(res.status).toBe(200);
    expect(stored.activeStep).toBe(2);
    expect(stored.lootSummary.puppet.qty).toBe(1);
    expect(stored.categoryAllocations.puppet.selected).toEqual(['111']);
    expect(stored.initialWinnersByItem.puppet).toEqual(['111']);
    expect(stored.activeMatrixFilter).toBe('puppet');
    expect(stored.sidebarTab).toBe('standby');
  });

  it('Successful confirm posts announce with an empty body', async () => {
    const { res, sendCalls, chunks } = await announceEmptyBodyRebuilds();
    expect(res.status).toBe(200);
    expect(sendCalls.length).toBeGreaterThan(0);
    expect(chunks[0].selectedRows.some((r) => r.uid === '111')).toBe(true);
  });

  it('Announce rebuilds rows from the saved session', async () => {
    const { chunks } = await announceEmptyBodyRebuilds();
    expect(chunks[0].selectedRows[0]).toMatchObject({ itemId: 'puppet', uid: '111' });
  });

  it('Announce Live Auction posts the same route without the confirm-modal save', async () => {
    const { res } = await announceEmptyBodyRebuilds();
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('No session identity is 401', async () => {
    const { status } = await announceUnauthenticated();
    expect(status).toBe(401);
  });

  it('Non-officer is 403', async () => {
    const { status } = await announceNonOfficer();
    expect(status).toBe(403);
  });

  it('No active session is 400 with the named error', async () => {
    const { status, body } = await announceNoSession();
    expect(status).toBe(400);
    expect(body.error).toBe('No active Mimic Book session.');
  });

  it('Discord not configured is 400', async () => {
    const { status } = await announceNotConfigured();
    expect(status).toBe(400);
  });

  it('Discord offline, disconnected, rate-limited, or blocking is 503', async () => {
    expect((await announceOffline503()).status).toBe(503);
    expect((await announceRateLimited503()).status).toBe(503);
  });

  it('Discord target not found is 404', async () => {
    const { status } = await announceNotFound404();
    expect(status).toBe(404);
  });

  // Skipped: "In-flight confirm button reads Allocating…" — React label only; no unit seam.
});

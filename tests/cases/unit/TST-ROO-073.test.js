import { describe, expect, it } from 'vitest';
import {
  discordFetchFailureDoesNotFinish,
  dummiesNotGhosted,
  missingDiscordBecomeGhost,
  nonOfficerDoesNotSync,
  officerSyncUpsertsAndRestoresGhost,
  openCircuitDoesNotGhost,
} from '../../patterns/roster_sync.js';

describe('TST-ROO-073 AuctionRosterSync ghosts missing Discord members and never ghosts dummies', () => {
  it('Officer sync upserts seen members and restores Ghost to Active', async () => {
    const { res, members } = await officerSyncUpsertsAndRestoresGhost();
    expect(res.status).toBe(200);
    expect(members['111'].status).toBe('Active');
    expect(members['111'].displayName).toBeTruthy();
    expect(members['111'].syncedAt).toBeTruthy();
    expect(members['111'].joinedAt).toBeTruthy();
    expect(members['333'].displayName).toBeTruthy();
  });

  it('Members missing from Discord become Ghost', async () => {
    const { res, members } = await missingDiscordBecomeGhost();
    expect(res.status).toBe(200);
    expect(members['222'].status).toBe('Ghost');
    expect(members['111'].status).not.toBe('Ghost');
  });

  it('dummy_* and isDummy do not become Ghost', async () => {
    const { res, members } = await dummiesNotGhosted();
    expect(res.status).toBe(200);
    expect(members.dummy_bot.status).not.toBe('Ghost');
    expect(members['999'].status).not.toBe('Ghost');
  });

  it('Non-officer does not sync', async () => {
    const { res, before, after } = await nonOfficerDoesNotSync();
    expect(res.status).toBe(403);
    expect(after).toEqual(before);
  });

  it('Open circuit does not ghost anyone', async () => {
    const { res, before, after } = await openCircuitDoesNotGhost();
    expect(res.status).toBe(503);
    expect(after).toEqual(before);
  });

  it('Discord fetch failure does not finish the sync', async () => {
    const { res, before, after } = await discordFetchFailureDoesNotFinish();
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(after).toEqual(before);
  });
});

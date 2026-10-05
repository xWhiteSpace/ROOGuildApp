import { describe, expect, it } from 'vitest';
import {
  missingAssignedConfigFails,
  phase1Or2SyncsWithActiveLive,
  phase3NoLiveSyncs,
  phase3ActiveLiveLeavesSnapshot,
  successfulSyncKeepsOnlyAssigned,
  alreadyExactSetsAnchor,
} from '../../patterns/war_room_publish.js';

describe('TST-ROO-174 WarRoomPublishAssignedRaidParty syncs only the assigned config and leaves phase-3 Active snapshots alone', () => {
  it('A missing assigned config fails publish', async () => {
    const r = await missingAssignedConfigFails();
    expect(r.lastError).toMatch(/No Raid Party config is assigned in Game Settings/i);
    expect(r.unchanged).toBe(true);
  });

  it('Phase 1 or 2 still syncs when an Active live session exists', async () => {
    const r = await phase1Or2SyncsWithActiveLive();
    expect(r.synced).toBe(true);
  });

  it('Phase 3 with no Active live session syncs', async () => {
    const r = await phase3NoLiveSyncs();
    expect(r.onlyCfg1).toBe(true);
  });

  it('Phase 3 with an Active live session leaves the snapshot alone', async () => {
    const r = await phase3ActiveLiveLeavesSnapshot();
    expect(r.unchanged).toBe(true);
  });

  it('A successful sync keeps only the assigned config', async () => {
    const r = await successfulSyncKeepsOnlyAssigned();
    expect(r.onlyCfg1).toBe(true);
  });

  it('Already holding exactly that config still sets the anchor active', async () => {
    const r = await alreadyExactSetsAnchor();
    expect(r.anchor).toBe('pub-exact');
  });
});

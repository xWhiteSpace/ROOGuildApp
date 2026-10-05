import { describe, expect, it } from 'vitest';
import {
  readyPhase3CreatesInProcess,
  skipNeedsSetup,
  skipForceLocked,
  skipNoActiveEvent,
  skipNonPhase3,
  skipExistingLiveSession,
  rejectDuplicateCreate,
  rejectMissingPublishedOrGrids,
  rejectCrossTabDuplicates,
  rejectUnresolvedWarRooms,
} from '../../patterns/in_process_create.js';

describe('TST-ROO-168 AutoCreateLiveRaidFromPublished creates an in-process live raid only when the launch checks pass', () => {
  it('A ready phase-3 tick creates the live raid in-process', async () => {
    const r = await readyPhase3CreatesInProcess();
    expect(r.session?.status).toBe('Active');
    expect(r.launchedBy).toBe('War Room');
    expect(r.httpCreateCalls).toBe(0);
  });

  it('Monitoring fields are taken from the cycle', async () => {
    const r = await readyPhase3CreatesInProcess();
    expect(r.session.pollIntervalMinutes).toBe(20);
    expect(r.session.monitoringStartsAt).toBeTruthy();
    expect(r.session.monitoringEndsAt).toBeTruthy();
  });

  it('war_room_status records the outcome', async () => {
    const r = await readyPhase3CreatesInProcess();
    expect(r.status?.liveStartedAt || r.status?.publishedId).toBeTruthy();
  });

  it('needsSetup does not count', async () => {
    const r = await skipNeedsSetup();
    expect(r.session).toBeNull();
  });

  it('forceLocked does not count', async () => {
    const r = await skipForceLocked();
    expect(r.session).toBeNull();
  });

  it('No active event does not count', async () => {
    const r = await skipNoActiveEvent();
    expect(r.session).toBeNull();
  });

  it('A phase other than 3 does not count', async () => {
    const r = await skipNonPhase3();
    expect(r.session).toBeNull();
  });

  it('An existing live session is skipped', async () => {
    const r = await skipExistingLiveSession();
    expect(r.launchedBy).toBe('Prior');
  });

  it('A duplicate live session is rejected by create', async () => {
    const r = await rejectDuplicateCreate();
    expect(r.firstOk).toBe(true);
    expect(r.secondOk).toBe(false);
  });

  it('Missing published or grids are rejected', async () => {
    const r = await rejectMissingPublishedOrGrids();
    expect(r.missingPub.ok).toBe(false);
    expect(r.missingGrids.ok).toBe(false);
  });

  it('Cross-tab duplicates are rejected', async () => {
    const r = await rejectCrossTabDuplicates();
    expect(r.ok).toBe(false);
    expect(r.duplicates?.length).toBeGreaterThan(0);
  });

  it('Unresolved war-room channels are rejected', async () => {
    const r = await rejectUnresolvedWarRooms();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/war room|channel/i);
  });
});

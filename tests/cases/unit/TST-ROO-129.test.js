import { describe, expect, it } from 'vitest';
import {
  firstReadNotActiveSetsAbsent,
  createSetsWatchActive,
  warRoomReadActiveSetsWatch,
  endOrCancelSetsAbsent,
  laterTicksAfterAbsentSkipQuery,
  activePastEndArchivesThenAbsent,
  otherProcessNotVisible,
} from '../../patterns/live_session_watch.js';

describe('TST-ROO-129 LiveSessionWatchSkipIdleReads skips later live_session queries after the watch is absent and still archives while active and past end', () => {
  it('The first read that does not find Active sets the watch absent', async () => {
    const r = await firstReadNotActiveSetsAbsent();
    expect(r.after).toBe('absent');
  });

  it('A read that finds Active sets the watch active', async () => {
    const r = await warRoomReadActiveSetsWatch();
    expect(r.after).toBe('active');
  });

  it('Creating a live raid from published sets the watch active', async () => {
    const r = await createSetsWatchActive();
    expect(r.ok).toBe(true);
    expect(r.watch).toBe('active');
  });

  it('A war-room read that finds Active sets the watch active', async () => {
    const r = await warRoomReadActiveSetsWatch();
    expect(r.after).toBe('active');
  });

  it('End or cancel sets the watch absent', () => {
    const r = endOrCancelSetsAbsent();
    expect(r.watch).toBe('absent');
  });

  it('Later ticks after absent do not query the live session', async () => {
    const r = await laterTicksAfterAbsentSkipQuery();
    expect(r.watch).toBe('absent');
    expect(r.readsSecondTick).toBe(0);
  });

  it('An active watch past monitoringEndsAt archives and then marks absent', async () => {
    const r = await activePastEndArchivesThenAbsent();
    expect(r.archiveCount).toBeGreaterThanOrEqual(1);
    expect(r.liveSession).toBeNull();
    expect(r.watch).toBe('absent');
  });

  it('Another process is not visible to this watch', async () => {
    const r = await otherProcessNotVisible();
    expect(r.ignoredDbActive).toBe(true);
    expect(r.reads).toBe(0);
  });
});

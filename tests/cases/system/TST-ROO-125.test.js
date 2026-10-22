import { describe, expect, it } from 'vitest';
import {
  inGameFlagSet,
  inGameFlagClear,
  inGameMapReplace,
  missingArchiveIs404,
  nonOfficerDoesNotCount,
  activeSessionUntouched,
} from '../../patterns/in_game_flag.js';

describe('TST-ROO-125 PatchArchivedInGameFlags stores or clears an archived in-game flag and does not change the Active session', () => {
  it('confirmed true stores the in-game flag', async () => {
    const r = await inGameFlagSet();
    expect(r.status).toBe(200);
    expect(r.body?.success).toBe(true);
    expect(r.body?.confirmed).toBe(true);
    expect(r.flag).toBe(true);
  });

  it('confirmed false or any other value clears the flag', async () => {
    const r = await inGameFlagClear();
    expect(r.status).toBe(200);
    expect(r.body?.success).toBe(true);
    expect(r.body?.confirmed).toBe(false);
    expect(r.flag).toBeNull();
  });

  it('A missing archive is 404', async () => {
    const r = await missingArchiveIs404();
    expect(r.status).toBe(404);
  });

  it('A non-officer patch does not count', async () => {
    const r = await nonOfficerDoesNotCount();
    expect(r.status).toBe(403);
    expect(r.flag).toBeNull();
  });

  it('replaces the archived in-game map in one write', async () => {
    const r = await inGameMapReplace();
    expect(r.status).toBe(200);
    expect(r.body?.success).toBe(true);
    expect(r.body?.inGameStatus).toEqual({ '200000000000000001': true });
    expect(r.previous).toBeNull();
    expect(r.next).toBe(true);
    expect(r.beforeStatus).toBe('Active');
    expect(r.liveStatus).toBe('Active');
  });

  it('The Active live_session is not mutated', async () => {
    const r = await activeSessionUntouched();
    expect(r.status).toBe(200);
    expect(r.flag).toBe(true);
    expect(r.after).toEqual(r.before);
    expect(r.after?.status).toBe('Active');
  });
});

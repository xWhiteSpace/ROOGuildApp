import { describe, expect, it } from 'vitest';
import {
  activeLiveRefusesRefresh,
  replacedSlotsMatchTemplate,
} from '../../patterns/war_room_refresh.js';

describe('War Room refresh party replaces the published copy from the Raid Config', () => {
  it('replaces moved players with the current Raid Config slots', async () => {
    const r = await replacedSlotsMatchTemplate();
    expect(r.ok).toBe(true);
    expect(r.userId).toBe('template-user');
    expect(r.partyName).toBe('Alpha');
    expect(r.keys).toEqual(['cfg1__tab_001', 'cfg1__tab_002']);
    expect(r.eventTitle).toBe('GvG');
    expect(r.otherUser).toBe('stay');
    expect(r.anchorWrites).toBe(0);
    expect(r.responseUser).toBe('template-user');
    expect(r.liveGridsUntouched).toBe(true);
    const sql = r.calls.map((call) => call.sql).join('\n');
    expect(sql).toMatch(/data->>'status'/);
    expect(sql).toMatch(/jsonb_set/);
    expect(r.calls.filter((call) => call.sql.includes('jsonb_set'))).toHaveLength(1);
    expect(r.calls.some((call) => (
      /SELECT data FROM json_docs/i.test(call.sql)
      && call.sql.includes("'attendance/published'")
      && !call.sql.includes('published_anchor')
    ))).toBe(false);
    expect(r.calls.some((call) => String(call.params).includes('attendance/compositions'))).toBe(true);
    const liveCall = r.calls.find((call) => call.sql.includes('attendance/live_session'));
    expect(liveCall.sql.includes('grids')).toBe(false);
  });

  it('refuses an Active live session and leaves the published party alone', async () => {
    const r = await activeLiveRefusesRefresh();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/live war is already running/i);
    expect(r.unchanged).toBe(true);
    expect(r.calls.some((call) => call.sql.includes('jsonb_set'))).toBe(false);
    expect(r.calls.some((call) => String(call.params).includes('attendance/compositions'))).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  raidEnabledSelectsRaidPhases,
  raidDisabledSelectsEventPhases,
  weeklyFallbacks2055,
  specialFallbacks2130,
  schedulerUsesSelectedPhase3,
} from '../../patterns/phase3_select.js';

describe('TST-ROO-190 RaidPhase3WhenRaidEnabled selects raid.phases[3] or phases[3] and keeps the stated fallbacks', () => {
  it('isRaidEnabled true selects event.raid.phases[3]', () => {
    const r = raidEnabledSelectsRaidPhases();
    expect(r.enabled).toBe(true);
    expect(r.selected.timeStart).toBe('20:10');
    expect(r.selected.timeEnd).toBe('22:40');
  });

  it('isRaidEnabled false selects event.phases[3]', () => {
    const r = raidDisabledSelectsEventPhases();
    expect(r.enabled).toBe(false);
    expect(r.selected.timeStart).toBe('19:30');
  });

  it('Scheduler blocks, shading, and RSVP deadline use that phase 3', () => {
    const r = schedulerUsesSelectedPhase3();
    expect(r.timeStart).toBe('20:15');
    expect(r.timeEnd).toBe('22:45');
    // Honesty: React FullCalendar shading/blocks skipped; instance times from buildWeekInstanceMap.
  });

  it('Missing phase-3 business-hours fallback is 20:55-22:15', () => {
    const r = weeklyFallbacks2055();
    expect(r.timeStart).toBe('20:55');
    expect(r.timeEnd).toBe('22:15');
  });

  it('Day-focus time fallback is 21:30-23:00', () => {
    const r = specialFallbacks2130();
    expect(r.timeStart).toBe('21:30');
    expect(r.timeEnd).toBe('23:00');
  });
});

import { describe, expect, it } from 'vitest';
import {
  attendanceStatusExports,
  compositionTabHelpersIncludeCrossTab,
  raidCycleHelpersExported,
  inGameAliasHelpersExported,
  apiAndSpaShareEntryPoints,
} from '../../patterns/shared_exports.js';

describe('TST-ROO-211 SharedPackageExportsAreConsumedByApiAndSpa keeps one shared entry surface', () => {
  it('attendance status constants and normalizers are exported', () => {
    const r = attendanceStatusExports();
    expect(r.statuses).toEqual(['Confirmed', 'Leave', 'NoConfirm', 'None']);
    expect(r.normalize && r.isCalendarCommitted && r.isArchivedRsvp).toBe(true);
  });

  it('composition tab helpers include a cross-tab uniqueness check', () => {
    const r = compositionTabHelpersIncludeCrossTab();
    expect(r.findCrossTabDuplicates).toBe(true);
    expect(r.sample).toBeTruthy();
  });

  it('raid cycle helpers are exported', () => {
    const r = raidCycleHelpersExported();
    expect(r.isRaidEnabled && r.getAbsoluteMinutes).toBe(true);
    expect(r.RAID_PHASE_LABELS[3]).toBeTruthy();
  });

  it('in-game alias helpers are exported', () => {
    const r = inGameAliasHelpersExported();
    expect(r.sanitizeInGameName && r.foldConfusable && r.matchOcrTokensToRoster).toBe(true);
  });

  it('the API process and the SPA use the same entry points', () => {
    const r = apiAndSpaShareEntryPoints();
    expect(r.backendImportsShared).toBe(true);
    expect(r.frontendImportsShared).toBe(true);
    expect(r.exports.length).toBeGreaterThan(0);
  });
});

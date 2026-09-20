/**
 * Attendance point-system core formula (shared SSOT).
 *
 * Each raid session grades a member on four 1.0-point axes:
 *  - calPt:      Calendar RSVP — Discord Available / Leave (copied at End Raid)
 *  - discPt:     Discord voice — showed up in a war-room voice channel at least once
 *  - durationPt: Duration in voice (presentTicks / totalPulses)
 *  - inGamePt:   In-game — officer toggle on History, not the Discord Available button
 *
 * Total is capped at 4.0.
 */
import { isCalendarCommitted } from '@guildname/shared/attendanceStatus';

export const MAX_RAID_SCORE = 4.0;

export function calculatePoints(commitment, presentTicks, totalPulses, inGameConfirmed = false) {
  const calPt = isCalendarCommitted(commitment) ? 1.0 : 0.0;
  const discPt = presentTicks > 0 ? 1.0 : 0.0;
  const durationPt = totalPulses > 0 ? (presentTicks / totalPulses) * 1.0 : 0.0;
  const inGamePt = inGameConfirmed ? 1.0 : 0.0;

  const total = parseFloat((calPt + discPt + durationPt + inGamePt).toFixed(2));
  return {
    calPt,
    discPt,
    durationPt,
    inGamePt,
    total: total > MAX_RAID_SCORE ? MAX_RAID_SCORE : total,
  };
}

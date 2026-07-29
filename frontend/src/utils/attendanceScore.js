/**
 * Attendance point-system core formula (shared SSOT).
 *
 * Each raid session grades a member on four 1.0-point axes:
 *  - calPt:      committed on the calendar (Confirmed / Leave)
 *  - discPt:     showed up in Discord voice at least once (presentTicks > 0)
 *  - durationPt: fraction of the monitored window they stayed (presentTicks / totalPulses)
 *  - inGamePt:   officer-confirmed in-game presence (manual toggle)
 *
 * Total is capped at 4.0.
 */
export const MAX_RAID_SCORE = 4.0;

export function calculatePoints(commitment, presentTicks, totalPulses, inGameConfirmed = false) {
  const calPt = (commitment === 'Confirmed' || commitment === 'Confirm' || commitment === 'Leave') ? 1.0 : 0.0;
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

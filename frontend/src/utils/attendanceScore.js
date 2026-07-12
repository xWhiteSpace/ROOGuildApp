/**
 * Attendance point-system core formula (shared SSOT).
 *
 * Each raid session grades a member on three 1.0-point axes:
 *  - calPt:      committed on the calendar (Confirmed / Leave)
 *  - discPt:     showed up in Discord voice at least once (presentTicks > 0)
 *  - durationPt: fraction of the monitored window they stayed (presentTicks / totalPulses)
 *
 * Total is capped at 3.0.
 */
export function calculatePoints(commitment, presentTicks, totalPulses) {
  const calPt = (commitment === 'Confirmed' || commitment === 'Confirm' || commitment === 'Leave') ? 1.0 : 0.0;
  const discPt = presentTicks > 0 ? 1.0 : 0.0;
  const durationPt = totalPulses > 0 ? (presentTicks / totalPulses) * 1.0 : 0.0;

  const total = parseFloat((calPt + discPt + durationPt).toFixed(2));
  return {
    calPt,
    discPt,
    durationPt,
    total: total > 3.0 ? 3.0 : total,
  };
}

/**
 * Canonical calendar RSVP statuses shared by Discord cards, End Raid archive, and History.
 *
 * Confirmed / Leave earn calendar score. NoConfirm is stored in the archive but scores 0.
 * Missing / None means unanswered.
 */
export const COMMITMENT_CONFIRMED = 'Confirmed';
export const COMMITMENT_LEAVE = 'Leave';
export const COMMITMENT_NO_CONFIRM = 'NoConfirm';
export const COMMITMENT_NONE = 'None';

export function normalizeCommitmentStatus(status) {
  if (status === 'Confirm') return COMMITMENT_CONFIRMED;
  if (status === COMMITMENT_CONFIRMED || status === COMMITMENT_LEAVE || status === COMMITMENT_NO_CONFIRM) {
    return status;
  }
  return COMMITMENT_NONE;
}

export function isCalendarCommitted(status) {
  const normalized = normalizeCommitmentStatus(status);
  return normalized === COMMITMENT_CONFIRMED || normalized === COMMITMENT_LEAVE;
}

export function isArchivedRsvp(status) {
  const normalized = normalizeCommitmentStatus(status);
  return (
    normalized === COMMITMENT_CONFIRMED
    || normalized === COMMITMENT_LEAVE
    || normalized === COMMITMENT_NO_CONFIRM
  );
}

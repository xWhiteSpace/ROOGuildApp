import { patterns } from './registry.js';
import {
  COMMITMENT_CONFIRMED,
  COMMITMENT_LEAVE,
  COMMITMENT_NO_CONFIRM,
  COMMITMENT_NONE,
  normalizeCommitmentStatus,
  isCalendarCommitted,
  isArchivedRsvp,
} from '@guildname/shared/attendanceStatus';

patterns.commitment_status = 'used';
patterns.canonical_four = 'used';

export function legacyConfirmNormalizes() {
  return normalizeCommitmentStatus('Confirm');
}

export function unknownNormalizesToNone() {
  return {
    empty: normalizeCommitmentStatus(''),
    garbage: normalizeCommitmentStatus('Maybe'),
    none: normalizeCommitmentStatus(COMMITMENT_NONE),
  };
}

export function calendarCommittedFlags() {
  return {
    confirmed: isCalendarCommitted(COMMITMENT_CONFIRMED),
    leave: isCalendarCommitted(COMMITMENT_LEAVE),
    noConfirm: isCalendarCommitted(COMMITMENT_NO_CONFIRM),
    none: isCalendarCommitted(COMMITMENT_NONE),
  };
}

export function archivedIncludesNoConfirm() {
  return {
    noConfirm: isArchivedRsvp(COMMITMENT_NO_CONFIRM),
    confirmed: isArchivedRsvp(COMMITMENT_CONFIRMED),
    leave: isArchivedRsvp(COMMITMENT_LEAVE),
    none: isArchivedRsvp(COMMITMENT_NONE),
  };
}

export function exactlyFourCanonical() {
  return [COMMITMENT_CONFIRMED, COMMITMENT_LEAVE, COMMITMENT_NO_CONFIRM, COMMITMENT_NONE];
}

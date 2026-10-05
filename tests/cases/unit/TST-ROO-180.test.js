import { describe, expect, it } from 'vitest';
import {
  legacyConfirmNormalizes,
  unknownNormalizesToNone,
  calendarCommittedFlags,
  archivedIncludesNoConfirm,
  exactlyFourCanonical,
} from '../../patterns/commitment_status.js';

describe('TST-ROO-180 CommitmentStatusNormalize maps legacy Confirm and unknown to canonical statuses', () => {
  it('Legacy Confirm normalizes to Confirmed', () => {
    expect(legacyConfirmNormalizes()).toBe('Confirmed');
  });

  it('An unknown status normalizes to None', () => {
    const r = unknownNormalizesToNone();
    expect(r.empty).toBe('None');
    expect(r.garbage).toBe('None');
  });

  it('isCalendarCommitted is true for Confirmed', () => {
    expect(calendarCommittedFlags().confirmed).toBe(true);
  });

  it('isCalendarCommitted is true for Leave', () => {
    expect(calendarCommittedFlags().leave).toBe(true);
  });

  it('isCalendarCommitted is false for NoConfirm and None', () => {
    const r = calendarCommittedFlags();
    expect(r.noConfirm).toBe(false);
    expect(r.none).toBe(false);
  });

  it('isArchivedRsvp includes NoConfirm', () => {
    expect(archivedIncludesNoConfirm().noConfirm).toBe(true);
  });

  it('Exactly four canonical statuses exist', () => {
    expect(exactlyFourCanonical()).toEqual(['Confirmed', 'Leave', 'NoConfirm', 'None']);
  });
});

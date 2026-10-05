import { describe, expect, it } from 'vitest';
import {
  confirmedAnnouncesAvailable,
  leaveAnnouncesUnavailable,
  secondWithin60sNoAnnounce,
  noopPressNoAnnounce,
  failedDecisionNoAnnounce,
  lineUsesCycleTitleAndWarDate,
  fallbacksForMissingFields,
  confirmYoursClause,
} from '../../patterns/rsvp_announce.js';

describe('TST-ROO-192 AttendanceCardRsvpAnnounceCooldown posts at most one GEN line per minute after a real status change', () => {
  it('A Confirmed status change announces Available', async () => {
    const r = await confirmedAnnouncesAvailable();
    expect(r.calls).toHaveLength(1);
    expect(r.line).toMatch(/Available/);
    expect(r.line).toMatch(/Cycle Title/);
  });

  it('A Leave status change announces Unavailable', async () => {
    const r = await leaveAnnouncesUnavailable();
    expect(r.calls).toHaveLength(1);
    expect(r.line).toMatch(/Unavailable/);
  });

  it('A second change within 60s for the same key does not announce', async () => {
    const r = await secondWithin60sNoAnnounce();
    expect(r.afterFirst).toBe(1);
    expect(r.total).toBe(1);
  });

  it('A no-op press does not announce', async () => {
    const r = await noopPressNoAnnounce();
    expect(r.calls).toHaveLength(0);
  });

  it('A failed applyAttendanceDecision does not announce', async () => {
    const r = await failedDecisionNoAnnounce();
    expect(r.calls).toHaveLength(0);
  });

  it('The line uses cycle title and warDate, not the button event key', () => {
    const r = lineUsesCycleTitleAndWarDate();
    expect(r.line).toMatch(/Cycle Title/);
    expect(r.line).toMatch(/Oct 07, 2026/);
    expect(r.line).not.toMatch(/evt1/);
  });

  it('Missing title, name, or unparseable date use the stated fallbacks', () => {
    const r = fallbacksForMissingFields();
    expect(r.line).toMatch(/A raider/);
    expect(r.line).toMatch(/the raid/);
  });

  it('Confirm-yours clause follows DISCORD_WARANNOUNCE_CHANNEL_ID', () => {
    const r = confirmYoursClause();
    expect(r.without).not.toMatch(/Confirm yours at/);
    expect(r.withCta).toMatch(/Confirm yours at <#999888777666555444>\./);
  });
});

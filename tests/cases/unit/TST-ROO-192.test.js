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
  chainSwordCommitsAndPostsButtons,
  chainDoveCommitsUnavailable,
  chainSameStatusStaysQuiet,
  chainFailedDecisionLeavesMessage,
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

  it('A sword button commits Confirmed and posts Available with both buttons', async () => {
    const r = await chainSwordCommitsAndPostsButtons();
    expect(r.calls).toHaveLength(1);
    expect(r.line).toMatch(/Available/);
    expect(r.status).toBe('Confirmed');
    expect(r.compositeKey).toBe(r.key);
    expect(r.edited).toBe(0);
    expect(r.buttons.map((button) => button.id)).toEqual([
      `attcard:chain:${r.key}:confirm`,
      `attcard:chain:${r.key}:leave`,
    ]);
    expect(r.buttons.map((button) => button.emoji)).toEqual(['⚔️', '🕊️']);
  });

  it('A dove button commits Leave and posts Unavailable with both buttons', async () => {
    const r = await chainDoveCommitsUnavailable();
    expect(r.calls).toHaveLength(1);
    expect(r.line).toMatch(/Unavailable/);
    expect(r.status).toBe('Leave');
    expect(r.edited).toBe(0);
    expect(r.buttons.map((button) => button.emoji)).toEqual(['⚔️', '🕊️']);
  });

  it('The same chain status does not post again', async () => {
    const r = await chainSameStatusStaysQuiet();
    expect(r.calls).toHaveLength(0);
    expect(r.seen).toBe(0);
    expect(r.edited).toBe(0);
  });

  it('A failed chain decision posts nothing and leaves the source message', async () => {
    const r = await chainFailedDecisionLeavesMessage();
    expect(r.calls).toHaveLength(0);
    expect(r.edited).toBe(0);
    expect(r.followedUp).toBe(1);
  });
});

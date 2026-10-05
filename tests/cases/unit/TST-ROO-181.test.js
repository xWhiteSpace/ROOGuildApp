import { describe, expect, it } from 'vitest';
import {
  pastDeadlineUnansweredBecomesNoConfirm,
  futureDeadlineSkipped,
  startOlderThan7DaysSkipped,
  existingMarkerSkips,
  alreadyAnsweredNotRewritten,
  clockDoesNotNameCloseExpired,
} from '../../patterns/close_expired.js';

describe('TST-ROO-181 CloseExpiredRsvpDeadlines marks unanswered raid-roster members NoConfirm only when callable and not skipped', () => {
  it('Past-deadline unanswered raid-roster members become NoConfirm', async () => {
    const r = await pastDeadlineUnansweredBecomesNoConfirm();
    expect(r.u1.status).toBe('NoConfirm');
    expect(r.u1Count).toBe(2);
    expect(r.marker).toBeTruthy();
  });

  it('A future deadline is skipped', async () => {
    const r = await futureDeadlineSkipped();
    expect(r.commitment).toBeUndefined();
    expect(r.marker).toBeUndefined();
  });

  it('A start older than 7 days is skipped', async () => {
    const r = await startOlderThan7DaysSkipped();
    expect(r.marker).toBeUndefined();
  });

  it('An existing deadline_closed marker skips the event', async () => {
    const r = await existingMarkerSkips();
    expect(r.commitment).toBeUndefined();
    expect(r.marker.closedAt).toBe(1);
  });

  it('A member already Confirmed, Leave, or NoConfirm is not auto-marked', async () => {
    const r = await alreadyAnsweredNotRewritten();
    expect(r.commits.c.status).toBe('Confirmed');
    expect(r.commits.l.status).toBe('Leave');
    expect(r.commits.n.status).toBe('NoConfirm');
    expect(r.commits.open.status).toBe('NoConfirm');
  });

  it('The CMP-010 60s clock does not invoke the writer', () => {
    const r = clockDoesNotNameCloseExpired();
    expect(r.namesCloseExpired).toBe(false);
    expect(r.namesRefreshLeave).toBe(true);
  });

  it('A closed marker is stored after marking', async () => {
    const r = await pastDeadlineUnansweredBecomesNoConfirm();
    expect(r.marker.closedAt).toBeTruthy();
    expect(typeof r.marker.count).toBe('number');
  });
});

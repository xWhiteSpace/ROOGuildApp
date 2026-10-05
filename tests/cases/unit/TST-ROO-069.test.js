import { describe, expect, it } from 'vitest';
import {
  freshSessionReturnedNotReset,
  missingSessionIsNull,
  staleSessionResetsFromCatalog,
} from '../../patterns/active_session.js';

describe('TST-ROO-069 MimicActiveSessionReader returns null, a fresh session, or a 24h catalog reset', () => {
  it('Missing session is null, not an error', async () => {
    const { status, body } = await missingSessionIsNull();
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.session).toBeNull();
    expect(body.error).toBeUndefined();
  });

  it('Session older than 24h is reset from catalog', async () => {
    const { res, stored } = await staleSessionResetsFromCatalog();
    expect(res.status).toBe(200);
    expect(res.body.session).toBeTruthy();
    expect(res.body.session.lastUpdated).toBeGreaterThan(Date.now() - 60_000);
    expect(stored.lastUpdated).toBe(res.body.session.lastUpdated);
    expect(stored.lootSummary.puppet).toMatchObject({ qty: 0, seats: 0 });
    expect(stored.categoryAllocations.puppet).toEqual({ selected: [] });
  });

  it('Session not older than 24h is returned and not reset', async () => {
    const { res, stored } = await freshSessionReturnedNotReset();
    expect(res.status).toBe(200);
    expect(res.body.session.marker).toBe('keep-me');
    expect(res.body.session.version).toBe(7);
    expect(res.body.session.qtyPerPage).toBe(4);
    expect(stored.marker).toBe('keep-me');
  });
});

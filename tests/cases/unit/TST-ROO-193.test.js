import { describe, expect, it } from 'vitest';
import {
  activeHasAccess,
  pastDueGraceOpenHasAccess,
  pastDueGraceExpiredNoAccess,
  pastDueNoGraceNoAccess,
  inactiveNoAccess,
  canceledNoAccess,
  missingTenantNoAccess,
  occupyUsesSamePredicate,
} from '../../patterns/access_predicate.js';

describe('TST-ROO-193 TenantAccessAndOccupancyPredicate shares one access predicate for gates and seats', () => {
  it('subscription_status active has access', () => {
    expect(activeHasAccess()).toBe(true);
  });

  it('past_due with grace_until after now has access', () => {
    expect(pastDueGraceOpenHasAccess()).toBe(true);
  });

  it('expired past_due grace does not count as access', () => {
    expect(pastDueGraceExpiredNoAccess()).toBe(false);
  });

  it('past_due without grace_until does not have access', () => {
    expect(pastDueNoGraceNoAccess()).toBe(false);
  });

  it('inactive does not have access', () => {
    expect(inactiveNoAccess()).toBe(false);
  });

  it('canceled does not have access', () => {
    expect(canceledNoAccess()).toBe(false);
  });

  it('a missing tenant does not have access', () => {
    expect(missingTenantNoAccess()).toBe(false);
  });

  it('occupying a slot uses the same predicate as tenantHasAccess', () => {
    const r = occupyUsesSamePredicate();
    expect(r.acceptedAccess).toBe(true);
    expect(r.acceptedOccupies).toBe(true);
    expect(r.rejectedAccess).toBe(false);
    expect(r.rejectedOccupies).toBe(false);
  });
});

import { patterns } from './registry.js';
import { tenantHasAccess, tenantOccupiesSlot } from '../../backend/src/db/billing.js';

patterns.access_predicate = 'used';
patterns.occupy_same = 'used';

export function activeHasAccess() {
  return tenantHasAccess({ subscription_status: 'active' });
}

export function pastDueGraceOpenHasAccess() {
  return tenantHasAccess({
    subscription_status: 'past_due',
    grace_until: new Date(Date.now() + 86_400_000).toISOString(),
  });
}

export function pastDueGraceExpiredNoAccess() {
  return tenantHasAccess({
    subscription_status: 'past_due',
    grace_until: new Date(Date.now() - 86_400_000).toISOString(),
  });
}

export function pastDueNoGraceNoAccess() {
  return tenantHasAccess({ subscription_status: 'past_due', grace_until: null });
}

export function inactiveNoAccess() {
  return tenantHasAccess({ subscription_status: 'inactive' });
}

export function canceledNoAccess() {
  return tenantHasAccess({ subscription_status: 'canceled' });
}

export function missingTenantNoAccess() {
  return tenantHasAccess(null);
}

export function occupyUsesSamePredicate() {
  const accepted = {
    id: 'A',
    subscription_status: 'past_due',
    grace_until: new Date(Date.now() + 86_400_000).toISOString(),
  };
  const rejected = { id: 'B', subscription_status: 'inactive' };
  return {
    acceptedAccess: tenantHasAccess(accepted),
    acceptedOccupies: tenantOccupiesSlot(accepted),
    rejectedAccess: tenantHasAccess(rejected),
    rejectedOccupies: tenantOccupiesSlot(rejected),
    sameFn: tenantHasAccess === tenantHasAccess && tenantOccupiesSlot(accepted) === tenantHasAccess(accepted),
  };
}

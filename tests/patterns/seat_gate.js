import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';

patterns.seat_gate = 'used';
patterns.payment_required_402 = 'used';

const hold = vi.hoisted(() => ({
  tenant: null,
}));

vi.mock('../../backend/src/db/tenants.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTenant: async (id) => (id ? hold.tenant : null),
  };
});

const {
  requireTenant,
  requireActiveSubscription,
} = await import('../../backend/src/middleware/tenantContext.js');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

export function noTenant409() {
  return withEnv({}, async () => {
    const req = { session: {} };
    const res = mockRes();
    let nextCalled = false;
    await requireActiveSubscription(req, res, () => { nextCalled = true; });
    return { status: res.statusCode, body: res.body, nextCalled };
  });
}

export function inactiveSeat402() {
  return withEnv({}, async () => {
    hold.tenant = {
      id: 't-inactive',
      subscription_status: 'inactive',
      billing_source: null,
      grace_until: null,
    };
    const req = { tenantId: 't-inactive', session: { currentTenantId: 't-inactive' } };
    const res = mockRes();
    let nextCalled = false;
    await requireActiveSubscription(req, res, () => { nextCalled = true; });
    return {
      status: res.statusCode,
      body: res.body,
      nextCalled,
      honesty: 'gate calls tenantHasAccess(tenant) only — does not recompute grace itself',
    };
  });
}

export function activeSeatContinues() {
  return withEnv({}, async () => {
    hold.tenant = {
      id: 't-active',
      subscription_status: 'active',
      billing_source: 'stripe',
    };
    const req = { tenantId: 't-active', session: { currentTenantId: 't-active' } };
    const res = mockRes();
    let nextCalled = false;
    await requireActiveSubscription(req, res, () => { nextCalled = true; });
    return { status: res.statusCode, body: res.body, nextCalled };
  });
}

export function requireTenant409Also() {
  return withEnv({}, () => {
    const req = { session: {} };
    const res = mockRes();
    let nextCalled = false;
    requireTenant(req, res, () => { nextCalled = true; });
    return { status: res.statusCode, body: res.body, nextCalled };
  });
}

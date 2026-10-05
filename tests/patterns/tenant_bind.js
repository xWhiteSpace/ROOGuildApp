import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { getCurrentTenantId, runWithTenant, clearTenantCaches } from '../../backend/src/db/tenantContext.js';

patterns.tenant_bind = 'used';
patterns.attach_order = 'used';

const hold = vi.hoisted(() => ({
  loadedFor: null,
  settings: { configuration: { timezone: 'Asia/Manila' }, discordChannels: {} },
  writes: [],
}));

vi.mock('../../backend/src/db/tenants.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadTenantSettings: async (tenantId) => {
      hold.loadedFor = String(tenantId);
      return hold.settings;
    },
    getTenant: async (id) => (id ? {
      id: String(id),
      subscription_status: 'active',
      billing_source: 'invite',
    } : null),
    mergeChannelFallback: (c) => c || {},
  };
});

vi.mock('../../backend/src/auth/identity.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    resolveUserIdentity: (req) => req._identity || null,
  };
});

vi.mock('../../backend/src/db/pool.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    query: async (sql, params = []) => {
      hold.writes.push({ sql: String(sql), params });
      if (/tenant_settings/i.test(String(sql)) && /SELECT/i.test(String(sql))) {
        return { rows: [{ configuration: { timezone: 'Asia/Manila' } }] };
      }
      if (/INSERT INTO|UPDATE|DELETE FROM/i.test(String(sql))) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [] };
    },
  };
});

const {
  attachTenantContext,
  requireTenant,
} = await import('../../backend/src/middleware/tenantContext.js');
const { getTenantStore, getTenantStoreFor } = await import('../../backend/src/db/database.js');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

async function attach(opts) {
  hold.loadedFor = null;
  clearTenantCaches();
  const req = {
    path: opts.path || '/api/attendance/commitments',
    headers: opts.headers || {},
    session: opts.session || {},
    _identity: opts.identity || null,
  };
  const res = mockRes();
  let insideTenant = null;
  let nextCalled = false;
  await attachTenantContext(req, res, () => {
    nextCalled = true;
    insideTenant = getCurrentTenantId();
  });
  return {
    tenantId: req.tenantId || null,
    loadedFor: hold.loadedFor,
    insideTenant,
    nextCalled,
    status: res.statusCode,
    body: res.body,
  };
}

export function sessionTenantPreferred() {
  return withEnv({}, () => attach({
    session: { currentTenantId: 'S' },
    identity: { id: 'u1', currentTenantId: 'P' },
    headers: { 'x-tenant-id': 'H' },
  }));
}

export function signedProfileWhenNoSession() {
  return withEnv({}, () => attach({
    session: {},
    identity: { id: 'u1', currentTenantId: 'P' },
    headers: { 'x-tenant-id': 'H' },
  }));
}

export function headerWhenNoSessionNoProfile() {
  return withEnv({}, () => attach({
    session: {},
    identity: null,
    headers: { 'x-tenant-id': 'H' },
  }));
}

export function loadsSettingsCache() {
  return withEnv({}, () => attach({
    session: { currentTenantId: 'T-cache' },
  }));
}

export function remainderInsideRunWithTenant() {
  return withEnv({}, () => attach({
    session: { currentTenantId: 'T-als' },
  }));
}

export async function operationalRowStamped() {
  return withEnv({}, async () => {
    hold.writes = [];
    clearTenantCaches();
    await runWithTenant('T-stamp', async () => {
      const store = getTenantStore();
      await store.ref('auction/members/u1').set({ displayName: 'Ada' });
    });
    const memberWrite = hold.writes.find((w) => /INSERT INTO members/i.test(w.sql));
    return {
      write: memberWrite || null,
      stamped: Boolean(memberWrite && String(memberWrite.params[0]) === 'T-stamp'),
    };
  });
}

export async function writeNoTenantRefused() {
  return withEnv({}, async () => {
    clearTenantCaches();
    let err = null;
    try {
      const store = getTenantStore();
      await store.ref('auction/members/u1').set({ displayName: 'X' });
    } catch (e) {
      err = e;
    }
    return { refused: Boolean(err), message: err?.message || null };
  });
}

export function publicPathNoTenantProceeds() {
  return withEnv({}, () => attach({
    path: '/api/billing/capacity',
    session: {},
    identity: null,
  }));
}

export function boundRouteNoTenant409() {
  return withEnv({}, async () => {
    const req = { session: {}, path: '/api/attendance/commitments' };
    const res = mockRes();
    let nextCalled = false;
    requireTenant(req, res, () => { nextCalled = true; });
    return { status: res.statusCode, body: res.body, nextCalled };
  });
}

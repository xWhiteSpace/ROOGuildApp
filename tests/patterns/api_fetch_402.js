import { vi } from 'vitest';
import { patterns } from './registry.js';

patterns.api_fetch_402 = 'used';
patterns.credentials_include = 'used';

/**
 * apiClient.js uses import.meta.env — vitest/node provides it via vite transform when importing from frontend.
 * Stub window/localStorage/fetch/location.
 */

function installBrowserStubs({ hostname = 'example.com', pathname = '/workspace/raid', session = null } = {}) {
  const assigns = [];
  const fetchCalls = [];
  globalThis.window = {
    location: {
      hostname,
      pathname,
      assign: (url) => { assigns.push(url); },
    },
  };
  globalThis.localStorage = {
    getItem: (k) => (k === 'guild_raid_session' ? session : null),
    setItem: () => {},
    removeItem: () => {},
  };
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url, init });
    return {
      status: 200,
      ok: true,
      clone() { return this; },
      async json() { return {}; },
    };
  };
  return { assigns, fetchCalls };
}

export async function apiFetchSendsCredentialsInclude() {
  const { fetchCalls } = installBrowserStubs({ hostname: 'localhost' });
  // Force module reload-ish: dynamic import
  const mod = await import('../../frontend/src/services/apiClient.js');
  await mod.apiFetch('/api/ping', { method: 'GET' });
  return {
    credentials: fetchCalls[0]?.init?.credentials,
    url: fetchCalls[0]?.url,
  };
}

export async function presentSessionAttachesHeaders() {
  const session = JSON.stringify({
    id: 'u1',
    username: 'Ada',
    currentTenantId: 'guild-1',
    sig: 'x',
  });
  const { fetchCalls } = installBrowserStubs({ hostname: 'localhost', session });
  const mod = await import('../../frontend/src/services/apiClient.js');
  await mod.apiFetch('/api/ping', { method: 'GET' });
  const headers = fetchCalls[0]?.init?.headers || {};
  return {
    profile: headers['x-user-profile'],
    tenant: headers['x-tenant-id'],
  };
}

export async function http402OffBillingAssignsBilling() {
  const { assigns, fetchCalls } = installBrowserStubs({
    hostname: 'localhost',
    pathname: '/workspace/raid',
  });
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url, init });
    return {
      status: 402,
      ok: false,
      clone() { return this; },
      async json() { return { code: 'payment_required', error: 'Seat required now.' }; },
    };
  };
  const mod = await import('../../frontend/src/services/apiClient.js');
  let thrown = null;
  try {
    await mod.apiFetch('/api/attendance/me', { method: 'GET' });
  } catch (e) {
    thrown = e;
  }
  return {
    assigns,
    message: thrown?.message || null,
  };
}

export async function http402MissingMessageUsesDefault() {
  const { assigns, fetchCalls } = installBrowserStubs({
    hostname: 'localhost',
    pathname: '/workspace/raid',
  });
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url, init });
    return {
      status: 402,
      ok: false,
      clone() { return this; },
      async json() { return { code: 'payment_required' }; },
    };
  };
  const mod = await import('../../frontend/src/services/apiClient.js');
  let thrown = null;
  try {
    await mod.apiFetch('/api/x', { method: 'GET' });
  } catch (e) {
    thrown = e;
  }
  return { assigns, message: thrown?.message || null };
}

export async function http402AlreadyOnBillingNoRedirect() {
  const { assigns, fetchCalls } = installBrowserStubs({
    hostname: 'localhost',
    pathname: '/workspace/billing',
  });
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url, init });
    return {
      status: 402,
      ok: false,
      clone() { return this; },
      async json() { return { code: 'payment_required', error: 'pay' }; },
    };
  };
  const mod = await import('../../frontend/src/services/apiClient.js');
  let thrown = null;
  try {
    await mod.apiFetch('/api/x', { method: 'GET' });
  } catch (e) {
    thrown = e;
  }
  return { assigns, threw: Boolean(thrown) };
}

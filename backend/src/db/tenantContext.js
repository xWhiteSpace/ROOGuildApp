import { AsyncLocalStorage } from 'node:async_hooks';

const tenantAls = new AsyncLocalStorage();

const configCache = new Map();
const channelCache = new Map();
let onboardedTenantList = null;

export function getCachedOnboardedTenants() {
  return onboardedTenantList;
}

export function setCachedOnboardedTenants(rows) {
  onboardedTenantList = rows;
}

export function invalidateOnboardedTenants() {
  onboardedTenantList = null;
}

export function getCurrentTenantId() {
  return tenantAls.getStore()?.tenantId || null;
}

export function runWithTenant(tenantId, fn) {
  if (!tenantId) return fn();
  return tenantAls.run({ tenantId: String(tenantId) }, fn);
}

export function setCachedConfig(tenantId, config) {
  if (tenantId) configCache.set(String(tenantId), config || {});
}

export function hasCachedConfig(tenantId = getCurrentTenantId()) {
  return Boolean(tenantId) && configCache.has(String(tenantId));
}

export function getCachedConfig(tenantId = getCurrentTenantId()) {
  if (!tenantId) return null;
  return configCache.get(String(tenantId)) || null;
}

export function setCachedChannels(tenantId, channels) {
  if (tenantId) channelCache.set(String(tenantId), channels || {});
}

export function hasCachedChannels(tenantId = getCurrentTenantId()) {
  return Boolean(tenantId) && channelCache.has(String(tenantId));
}

export function getCachedChannels(tenantId = getCurrentTenantId()) {
  if (!tenantId) return {};
  return channelCache.get(String(tenantId)) || {};
}

export function clearTenantCaches(tenantId) {
  if (!tenantId) return;
  configCache.delete(String(tenantId));
  channelCache.delete(String(tenantId));
}

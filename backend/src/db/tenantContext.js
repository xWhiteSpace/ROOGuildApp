import { AsyncLocalStorage } from 'node:async_hooks';
import { RAGNAROK_ORIGIN_ID } from '../games/catalog.js';

const tenantAls = new AsyncLocalStorage();

const configCache = new Map();
const channelCache = new Map();
let onboardedTenantList = null;

function configCacheKey(tenantId, gameId) {
  return `${String(tenantId)}::${String(gameId || RAGNAROK_ORIGIN_ID)}`;
}

function resolveGameId(gameId) {
  return String(gameId || tenantAls.getStore()?.gameId || RAGNAROK_ORIGIN_ID);
}

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

export function getCurrentGameId() {
  return tenantAls.getStore()?.gameId || null;
}

export function runWithTenant(tenantId, fn) {
  if (!tenantId) return fn();
  const prev = tenantAls.getStore() || {};
  return tenantAls.run({
    tenantId: String(tenantId),
    gameId: prev.gameId || RAGNAROK_ORIGIN_ID,
  }, fn);
}

export function runWithGame(gameId, fn) {
  const prev = tenantAls.getStore() || {};
  return tenantAls.run({
    ...prev,
    gameId: String(gameId || RAGNAROK_ORIGIN_ID),
  }, fn);
}

export function setCachedConfig(tenantId, config, gameId) {
  if (!tenantId) return;
  configCache.set(configCacheKey(tenantId, resolveGameId(gameId)), config || {});
}

export function hasCachedConfig(tenantId = getCurrentTenantId(), gameId) {
  return Boolean(tenantId) && configCache.has(configCacheKey(tenantId, resolveGameId(gameId)));
}

export function getCachedConfig(tenantId = getCurrentTenantId(), gameId) {
  if (!tenantId) return null;
  return configCache.get(configCacheKey(tenantId, resolveGameId(gameId))) || null;
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
  const prefix = `${String(tenantId)}::`;
  for (const key of [...configCache.keys()]) {
    if (key === String(tenantId) || key.startsWith(prefix)) configCache.delete(key);
  }
  channelCache.delete(String(tenantId));
}

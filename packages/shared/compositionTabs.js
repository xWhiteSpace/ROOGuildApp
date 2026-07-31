/**
 * @guildname/shared – compositionTabs
 *
 * Single source of truth for Raid Composition / Grid Tab logic.
 * Used by both backend (Node.js ESM) and frontend (Vite/React).
 */

// ─── Key helpers ─────────────────────────────────────────────────────────────

export function isSlotCoordKey(key) {
  return typeof key === 'string' && /^\d+-\d+$/.test(key);
}

export function nextTabId(tabs = {}) {
  const numericIds = Object.keys(tabs).map((k) => {
    const match = String(k).match(/^tab_(\d+)$/);
    return match ? parseInt(match[1], 10) : 0;
  });
  const next = Math.max(...numericIds, 0) + 1;
  return `tab_${String(next).padStart(3, '0')}`;
}

// ─── Normalization ────────────────────────────────────────────────────────────

/**
 * Normalize a raw composition document (from Firebase) into the canonical
 * { id, title, tabs, tabOrder } shape.
 * Legacy flat docs (slots_allocation on the root) become a single "Main" tab.
 */
export function normalizeComposition(raw, configId) {
  if (!raw || typeof raw !== 'object') {
    const tabId = 'tab_001';
    return {
      id: configId,
      title: 'Untitled Configuration',
      lastUpdated: Date.now(),
      updatedBy: 'System',
      tabs: {
        [tabId]: { id: tabId, name: 'Main', slots_allocation: {} },
      },
      tabOrder: [tabId],
      _migratedFromLegacy: false,
    };
  }

  const base = {
    id: raw.id || configId,
    title: raw.title || 'Untitled Configuration',
    lastUpdated: raw.lastUpdated || Date.now(),
    updatedBy: raw.updatedBy || 'Officer',
    gridTopology: raw.gridTopology || { columns: 8, rows: 5 },
  };

  if (raw.tabs && typeof raw.tabs === 'object' && Object.keys(raw.tabs).length > 0) {
    const tabs = {};
    Object.entries(raw.tabs).forEach(([tabId, tab]) => {
      tabs[tabId] = {
        id: tab?.id || tabId,
        name: tab?.name || 'Untitled Tab',
        slots_allocation: tab?.slots_allocation || {},
      };
    });
    const tabOrder = Array.isArray(raw.tabOrder) && raw.tabOrder.length
      ? raw.tabOrder.filter((id) => tabs[id])
      : Object.keys(tabs);
    Object.keys(tabs).forEach((id) => {
      if (!tabOrder.includes(id)) tabOrder.push(id);
    });
    return { ...base, tabs, tabOrder, _migratedFromLegacy: false };
  }

  // Legacy: single root slots_allocation → wrap into a "Main" tab
  const tabId = 'tab_001';
  return {
    ...base,
    tabs: {
      [tabId]: {
        id: tabId,
        name: 'Main',
        slots_allocation: raw.slots_allocation || {},
      },
    },
    tabOrder: [tabId],
    _migratedFromLegacy: true,
  };
}

/** Normalize a map of { [configId]: rawComposition } all at once. */
export function normalizeCompositionsMap(compositions = {}) {
  const out = {};
  Object.entries(compositions).forEach(([id, raw]) => {
    out[id] = normalizeComposition(raw, id);
  });
  return out;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

/**
 * Strip internal-only flags (_migratedFromLegacy, etc.) before writing to
 * Firebase so they don't pollute the stored document.
 */
export function compositionForPersist(normalized) {
  const { _migratedFromLegacy, slots_allocation, ...rest } = normalized;
  const tabs = {};
  Object.entries(normalized.tabs || {}).forEach(([tabId, tab]) => {
    tabs[tabId] = {
      id: tab.id || tabId,
      name: tab.name || 'Untitled Tab',
      slots_allocation: tab.slots_allocation || {},
    };
  });
  return {
    id: rest.id,
    title: rest.title,
    lastUpdated: rest.lastUpdated,
    updatedBy: rest.updatedBy,
    gridTopology: rest.gridTopology || { columns: 8, rows: 5 },
    tabs,
    tabOrder: Array.isArray(rest.tabOrder) ? rest.tabOrder : Object.keys(tabs),
  };
}

// ─── Cross-tab membership helpers ─────────────────────────────────────────────

/** Collect all unique userIds assigned in a single slots_allocation map. */
export function collectUserIdsFromAllocation(slotsAllocation = {}) {
  const uids = new Set();
  Object.entries(slotsAllocation).forEach(([key, slot]) => {
    if (!isSlotCoordKey(key)) return;
    if (slot?.userId) uids.add(String(slot.userId));
  });
  return uids;
}

/**
 * Find duplicate userIds placed in more than one tab within the same config.
 * Returns [{ userId, placements: [{ tabId, coordKey }] }]
 */
export function findCrossTabDuplicates(tabs = {}) {
  const placementsByUid = {};
  Object.entries(tabs).forEach(([tabId, tab]) => {
    const alloc = tab?.slots_allocation || {};
    Object.entries(alloc).forEach(([coordKey, slot]) => {
      if (!isSlotCoordKey(coordKey) || !slot?.userId) return;
      const uid = String(slot.userId);
      if (!placementsByUid[uid]) placementsByUid[uid] = [];
      placementsByUid[uid].push({ tabId, coordKey });
    });
  });
  return Object.entries(placementsByUid)
    .filter(([, placements]) => placements.length > 1)
    .map(([userId, placements]) => ({ userId, placements }));
}

/**
 * Clear a userId from every slot across all tabs, optionally preserving one
 * specific { tabId, coordKey } placement.
 */
export function clearUidAcrossTabs(tabs, userId, keep = null) {
  if (!userId) return tabs;
  const uid = String(userId);
  const next = {};
  Object.entries(tabs || {}).forEach(([tabId, tab]) => {
    const alloc = { ...(tab.slots_allocation || {}) };
    Object.keys(alloc).forEach((coordKey) => {
      if (!isSlotCoordKey(coordKey)) return;
      if (alloc[coordKey]?.userId === uid) {
        if (keep && keep.tabId === tabId && keep.coordKey === coordKey) return;
        alloc[coordKey] = { ...alloc[coordKey], userId: '' };
      }
    });
    next[tabId] = { ...tab, slots_allocation: alloc };
  });
  return next;
}

/** Map uid → { tabId, coordKey, tabName } for every assigned slot across all tabs. */
export function buildAssignedLocationsAcrossTabs(tabs = {}, tabOrder = []) {
  const map = {};
  const order = tabOrder.length ? tabOrder : Object.keys(tabs);
  order.forEach((tabId) => {
    const tab = tabs[tabId];
    if (!tab) return;
    const alloc = tab.slots_allocation || {};
    Object.entries(alloc).forEach(([coordKey, slot]) => {
      if (!isSlotCoordKey(coordKey) || !slot?.userId) return;
      map[slot.userId] = { tabId, coordKey, tabName: tab.name || tabId };
    });
  });
  return map;
}

/**
 * Place uid on the target coordKey in activeTabId; remove the same uid from
 * every other slot across all tabs first (move semantics, cross-tab uniqueness).
 */
export function bindMemberAcrossTabs(tabs, activeTabId, coordKey, uid) {
  const nextTabs = {};
  Object.entries(tabs || {}).forEach(([tabId, tab]) => {
    const alloc = { ...(tab.slots_allocation || {}) };
    if (uid) {
      Object.keys(alloc).forEach((k) => {
        if (isSlotCoordKey(k) && alloc[k]?.userId === uid) {
          alloc[k] = { ...alloc[k], userId: '' };
        }
      });
    }
    if (tabId === activeTabId) {
      alloc[coordKey] = { ...(alloc[coordKey] || { roleLock: '' }), userId: uid || '' };
    }
    nextTabs[tabId] = { ...tab, slots_allocation: alloc };
  });
  return nextTabs;
}

// ─── Live-session builder ─────────────────────────────────────────────────────

/**
 * Transform a normalized composition into the live-session grids format.
 * Each Grid Tab becomes one live grid.
 */
export function buildLiveGridsFromComposition(normalized, configId) {
  const grids = {};
  const order = normalized.tabOrder || Object.keys(normalized.tabs || {});
  order.forEach((tabId) => {
    const tab = normalized.tabs[tabId];
    if (!tab) return;
    grids[tabId] = {
      id: tabId,
      name: tab.name || 'Untitled Tab',
      title: tab.name || 'Untitled Tab', // legacy /myparty readers
      parentConfigId: configId,
      parentConfigTitle: normalized.title || configId,
      slots_allocation: tab.slots_allocation || {},
    };
  });
  return { grids, selectedGridIds: order.filter((id) => grids[id]) };
}

// ─── Frontend matrix helpers ──────────────────────────────────────────────────

/** Build a blank 10×10 matrix with default meta values. */
export function buildBlankGridMatrix(cols = 8, rows = 5) {
  const matrix = { meta_columnsCount: cols, meta_rowsCount: rows };
  for (let c = 1; c <= 10; c++) {
    matrix[`party_name_${c}`] = `Party ${c}`;
    for (let r = 1; r <= 10; r++) {
      matrix[`${c}-${r}`] = { userId: '', roleLock: '' };
    }
  }
  return matrix;
}

/**
 * Expand a slots_allocation object into the flat matrix format used by the
 * RaidPartyTab grid renderer. Preserves all slot fields (roleLock, isPartyLeader…).
 */
export function hydrateMatrixFromAllocation(rawAllocation = {}, fallbackCols = 8, fallbackRows = 5) {
  const loadedCols = parseInt(rawAllocation.meta_columnsCount, 10) || fallbackCols;
  const loadedRows = parseInt(rawAllocation.meta_rowsCount, 10) || fallbackRows;
  const normalizedMatrix = { meta_columnsCount: loadedCols, meta_rowsCount: loadedRows };
  for (let c = 1; c <= 10; c++) {
    const partyNameKey = `party_name_${c}`;
    normalizedMatrix[partyNameKey] = rawAllocation[partyNameKey] || `Party ${c}`;
    for (let r = 1; r <= 10; r++) {
      const coordKey = `${c}-${r}`;
      const loadedSlot = rawAllocation[coordKey];
      normalizedMatrix[coordKey] = {
        userId: loadedSlot?.userId || '',
        roleLock: loadedSlot?.roleLock || '',
        ...(loadedSlot?.isPartyLeader ? { isPartyLeader: true } : {}),
      };
    }
  }
  return { matrix: normalizedMatrix, columnsCount: loadedCols, rowsCount: loadedRows };
}

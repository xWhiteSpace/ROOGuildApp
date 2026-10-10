/**
 * Mimic Book sidebar names and live-claim allocation patches.
 * Raid-roster names come from the SSOT card slice; allocations patch one slot.
 */

function asSelectedList(raw) {
  return Array.isArray(raw) ? raw : Object.values(raw || {});
}

function selectedEqual(prevList, nextList) {
  if (prevList.length !== nextList.length) return false;
  for (let i = 0; i < prevList.length; i += 1) {
    if ((prevList[i] || '') !== (nextList[i] || '')) return false;
  }
  return true;
}

/** Sorted raid-roster display names. Empty names are dropped. */
export function rosterNamesFromMembers(members) {
  return Object.values(members || {})
    .filter((row) => row?.isRaidRoster === true)
    .map((row) => String(row?.displayName || '').trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Return prev when no selected[] index changed (same reference).
 * Otherwise copy only the item slices whose occupant list changed.
 */
export function patchChangedAllocations(prev, next) {
  if (!next || typeof next !== 'object') return prev && typeof prev === 'object' ? prev : {};
  const base = prev && typeof prev === 'object' ? prev : {};
  const itemIds = new Set([...Object.keys(base), ...Object.keys(next)]);
  let changed = false;
  const out = { ...base };

  for (const itemId of itemIds) {
    const prevList = asSelectedList(base[itemId]?.selected);
    const nextList = asSelectedList(next[itemId]?.selected);
    if (selectedEqual(prevList, nextList)) continue;
    changed = true;
    out[itemId] = { ...(base[itemId] || {}), selected: nextList.slice() };
  }

  return changed ? out : base;
}

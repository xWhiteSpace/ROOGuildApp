/** In-memory Firebase-shaped store for unit tests. No Postgres / Discord. */

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function parts(path) {
  return String(path || '').replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
}

function getAt(tree, path) {
  let cur = tree;
  for (const p of parts(path)) {
    if (cur == null || typeof cur !== 'object') return null;
    cur = cur[p];
  }
  return cur === undefined ? null : cur;
}

function setAt(tree, path, value) {
  const segs = parts(path);
  if (!segs.length) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.keys(tree).forEach((k) => { delete tree[k]; });
      Object.assign(tree, clone(value));
    }
    return;
  }
  let cur = tree;
  for (let i = 0; i < segs.length - 1; i += 1) {
    const s = segs[i];
    if (!cur[s] || typeof cur[s] !== 'object') cur[s] = {};
    cur = cur[s];
  }
  const last = segs[segs.length - 1];
  if (value === null || value === undefined) delete cur[last];
  else cur[last] = clone(value);
}

function mergeAt(tree, path, patch) {
  const current = getAt(tree, path);
  const base = current && typeof current === 'object' && !Array.isArray(current) ? clone(current) : {};
  for (const [k, v] of Object.entries(patch || {})) {
    if (v === null) delete base[k];
    else base[k] = clone(v);
  }
  setAt(tree, path, base);
}

let pushSeq = 0;
function nextPushKey() {
  pushSeq += 1;
  return `-Punit${String(pushSeq).padStart(12, '0')}`;
}

export function createMemoryTenantStore(seed = {}) {
  const tree = clone(seed) || {};

  function makeRef(path = '') {
    const normalized = String(path || '').replace(/^\/+|\/+$/g, '');
    const segs = parts(normalized);
    return {
      path: normalized,
      key: segs.length ? segs[segs.length - 1] : null,
      child(childPath) {
        const suffix = String(childPath || '').replace(/^\/+|\/+$/g, '');
        return makeRef(normalized ? `${normalized}/${suffix}` : suffix);
      },
      push() {
        const key = nextPushKey();
        const child = makeRef(normalized ? `${normalized}/${key}` : key);
        child.key = key;
        return child;
      },
      async once() {
        const value = getAt(tree, normalized);
        return {
          exists: () => value !== null && value !== undefined,
          val: () => clone(value),
          key: segs.length ? segs[segs.length - 1] : null,
        };
      },
      async set(value) {
        setAt(tree, normalized, value);
      },
      async update(patch) {
        if (!normalized || normalized === '/') {
          for (const [subPath, val] of Object.entries(patch || {})) {
            setAt(tree, subPath, val);
          }
          return;
        }
        mergeAt(tree, normalized, patch);
      },
      async remove() {
        setAt(tree, normalized, null);
      },
      async transaction(updater) {
        const current = getAt(tree, normalized);
        const next = updater(current === null ? null : clone(current));
        if (next === undefined) return { committed: false, snapshot: await this.once() };
        setAt(tree, normalized, next);
        return { committed: true, snapshot: await this.once() };
      },
    };
  }

  return {
    ref: (path = '') => makeRef(path),
    snapshot: () => clone(tree),
    reset(next = {}) {
      Object.keys(tree).forEach((k) => { delete tree[k]; });
      Object.assign(tree, clone(next) || {});
    },
    webRequests() {
      return clone(getAt(tree, 'auction/web_requests') || {});
    },
    members() {
      return clone(getAt(tree, 'auction/members') || {});
    },
    activeSession() {
      return clone(getAt(tree, 'auction/active_session'));
    },
  };
}

export function auctionRequestsFromStore(store, filters = {}) {
  const all = store.webRequests() || {};
  const out = {};
  for (const [id, row] of Object.entries(all)) {
    if (!row || typeof row !== 'object') continue;
    if (filters.status && String(row.selectionStatus || '') !== String(filters.status)) continue;
    if (filters.userId && String(row.userId || '') !== String(filters.userId)) continue;
    if (filters.itemId && String(row.itemId || '') !== String(filters.itemId)) continue;
    if (filters.itemName && String(row.item || '') !== String(filters.itemName)) continue;
    out[id] = { ...row, id: row.id || id };
  }
  return out;
}

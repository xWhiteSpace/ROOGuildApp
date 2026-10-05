const RING_ORDER = ['REQ', 'FNC', 'API', 'CMP', 'UNT', 'TST'];

export const FOCUS_TABS = [
  { id: 'Connections', kind: null },
  { id: 'REQ', kind: 'REQ' },
  { id: 'FNC', kind: 'FNC' },
  { id: 'API', kind: 'API' },
  { id: 'CMP', kind: 'CMP' },
  { id: 'UNT', kind: 'UNT' },
  { id: 'Tests', kind: 'TST' },
];

function mentions(fn, id) {
  if (fn.id === id) return true;
  if (fn.requirements.includes(id)) return true;
  if (fn.interfaces.includes(id)) return true;
  if (fn.components.includes(id)) return true;
  if (fn.units.includes(id)) return true;
  return fn.tests.some((test) => test.id === id || test.links.includes(id));
}

function collect(fn) {
  const ids = new Set([fn.id, ...fn.requirements, ...fn.interfaces, ...fn.components, ...fn.units]);
  for (const test of fn.tests) {
    ids.add(test.id);
    for (const link of test.links) ids.add(link);
  }
  return ids;
}

export function focusGraph(index, id) {
  const nodes = index?.nodes || {};
  const center = nodes[id] || { id, kind: String(id).split('-')[0] || 'REQ', label: id };
  const seen = new Set([id]);
  const rings = Object.fromEntries(RING_ORDER.map((kind) => [kind, []]));

  for (const fn of index?.functions || []) {
    if (!mentions(fn, id)) continue;
    for (const other of collect(fn)) {
      if (other === id || seen.has(other)) continue;
      const node = nodes[other];
      if (!node) continue;
      const kind = RING_ORDER.includes(node.kind) ? node.kind : null;
      if (!kind) continue;
      seen.add(other);
      rings[kind].push(node);
    }
  }

  for (const kind of RING_ORDER) {
    rings[kind].sort((a, b) => a.id.localeCompare(b.id, 'en'));
  }

  const links = [];
  for (const test of rings.TST) {
    for (const target of test.links || nodes[test.id]?.links || []) {
      if (target === id || seen.has(target)) links.push([test.id, target]);
    }
  }

  return { center, rings, links, RING_ORDER };
}

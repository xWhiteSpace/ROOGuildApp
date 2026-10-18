const REVIEW_KEY = 'dbg-review-v1';

function unique(ids) {
  return [...new Set((ids || []).filter(Boolean))];
}

function kindOf(id) {
  return String(id || '').split('-')[0];
}

export function loadReviewMarks() {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(REVIEW_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveReviewMark(id, mark) {
  const all = loadReviewMarks();
  if (!mark?.verdict) {
    delete all[id];
  } else {
    all[id] = {
      verdict: mark.verdict,
      note: String(mark.note || ''),
      at: Date.now(),
    };
  }
  window.localStorage.setItem(REVIEW_KEY, JSON.stringify(all));
  return all;
}

export function reviewLineage(graph) {
  const parents = {};
  const satisfy = {};
  const verify = {};
  const allocate = {};

  for (const node of Object.values(graph?.nodes || {})) {
    if (node.linked_from) (parents[node.id] ||= []).push(node.linked_from);
    if (node.kind === 'TST') {
      for (const target of node.links || []) (verify[target] ||= []).push(node.id);
    }
  }

  for (const fn of graph?.functions || []) {
    for (const req of fn.requirements || []) {
      (satisfy[req] ||= []).push(fn.id);
      if (kindOf(req) === 'USR') (parents[fn.id] ||= []).push(req);
    }
    for (const iface of fn.interfaces || []) (satisfy[iface] ||= []).push(fn.id);
    for (const unit of fn.units || []) (satisfy[unit] ||= []).push(fn.id);
    for (const cmp of fn.components || []) {
      (allocate[fn.id] ||= []).push(cmp);
      (satisfy[cmp] ||= []).push(fn.id);
    }
    for (const test of fn.tests || []) {
      (verify[fn.id] ||= []).push(test.id);
      for (const link of test.links || []) (verify[link] ||= []).push(test.id);
    }
  }

  return {
    parents: Object.fromEntries(Object.entries(parents).map(([id, ids]) => [id, unique(ids)])),
    satisfy: Object.fromEntries(Object.entries(satisfy).map(([id, ids]) => [id, unique(ids)])),
    verify: Object.fromEntries(Object.entries(verify).map(([id, ids]) => [id, unique(ids)])),
    allocate: Object.fromEntries(Object.entries(allocate).map(([id, ids]) => [id, unique(ids)])),
  };
}

export function titleLooksTruncated(title, statement) {
  const rawTitle = String(title || '').replace(/^[A-Z]+-[A-Z0-9]+-\d+:\s*/, '').trim();
  const rawStatement = String(statement || '').trim();
  if (!rawTitle || !rawStatement) return false;
  if (rawTitle === rawStatement) return rawTitle.length > 72;
  if (!rawStatement.startsWith(rawTitle)) return false;
  if (rawTitle.length < 24) return false;
  if (/(\.\.\.|…)$/.test(rawTitle)) return true;
  if (/\s(and|the|a|an|to|with|when|unless|that|for)$/i.test(rawTitle)) return true;
  return rawStatement.length > rawTitle.length + 8;
}

function sameText(a, b) {
  return String(a || '').replace(/\s+/g, ' ').trim().toLowerCase()
    === String(b || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function reviewFlags(item, meta, lineage) {
  const kind = item.kind;
  const parents = lineage.parents[item.id] || [];
  const functions = lineage.satisfy[item.id] || [];
  const tests = lineage.verify[item.id] || [];
  const title = meta.title || item.id;
  const statement = meta.statement || '';
  const acceptance = meta.acceptance || '';
  const flags = [];

  if (kind === 'REQ' && parents.filter((id) => kindOf(id) === 'USR').length === 0) {
    flags.push('no USR parent');
  }
  if ((kind === 'REQ' || kind === 'USR') && functions.length === 0) flags.push('no FNC satisfy');
  if (!['USR', 'REQ', 'FNC', 'TST'].includes(kind) && functions.length === 0) flags.push('no FNC link');
  if (kind !== 'TST' && tests.length === 0) flags.push('no TST verify plan');
  if (titleLooksTruncated(title, statement)) flags.push('title is a truncated statement');
  if (kind === 'REQ' && (!acceptance || sameText(acceptance, statement))) {
    flags.push(acceptance ? 'acceptance copies statement' : 'acceptance criteria missing');
  }

  return {
    parents: parents.filter((id) => kindOf(id) === 'USR'),
    functions,
    tests,
    flags,
  };
}

export function queueFor(items, artifacts) {
  return [...items].sort((a, b) => {
    const domainA = artifacts?.[a.id]?.domain || '(none)';
    const domainB = artifacts?.[b.id]?.domain || '(none)';
    if (domainA !== domainB) return domainA.localeCompare(domainB, 'en');
    return a.id.localeCompare(b.id, 'en');
  });
}

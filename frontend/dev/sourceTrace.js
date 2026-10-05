import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { focusGraph } from '../src/pages/debug/focusGraph.js';
import { buildNeighborhoodIndex } from './neighborhoodGraph.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CASE_LEVELS = ['unit', 'integration', 'system', 'acceptance'];
const ALLOWED_PREFIX = ['backend/src/', 'frontend/src/', 'tests/cases/', 'tests/patterns/', 'tests/smoke/'];
const MAX_SNIPPET_CHARS = 8000;
const MAX_SNIPPET_LINES = 56;
const MAX_CHAINS = 16;
const IMPORT_RE = /(?:import\s+(?:[\s\S]*?)\s+from\s+|export\s+[\s\S]*?\s+from\s+)['"]([^'"]+)['"]/g;
const NAMED_IMPORT_RE = /import\s+(?:type\s+)?(?:\*\s+as\s+(\w+)|\{([^}]+)\}|(\w+))\s+from\s+['"]([^'"]+)['"]/g;

let planCache = null;

function posix(rel) {
  return String(rel || '').replaceAll('\\', '/');
}

export function isAllowedRel(rel) {
  const norm = posix(rel);
  if (!norm || norm.includes('\0') || norm.includes('..')) return false;
  if (norm.includes('node_modules') || /(^|\/)\.env(\.|$)/.test(norm)) return false;
  return ALLOWED_PREFIX.some((prefix) => norm.startsWith(prefix));
}

function resolveUnderRepo(rel) {
  const norm = posix(rel);
  if (!isAllowedRel(norm)) return null;
  const abs = path.resolve(repoRoot, norm);
  if (!abs.startsWith(repoRoot + path.sep)) return null;
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
  return { rel: posix(path.relative(repoRoot, abs)), abs };
}

function field(block, name) {
  const match = String(block || '').match(new RegExp(`^${name}:[ \\t]*(.*)$`, 'm'));
  return match ? match[1].trim() : '';
}

function readPlanIndex() {
  if (planCache) return planCache;
  const text = fs.readFileSync(path.join(repoRoot, 'docs/strictdoc/verification/tests.sdoc'), 'utf8');
  const plans = {};
  let plan = null;
  let mode = null;
  let buffer = [];

  function closeMode() {
    if (plan && mode) plan[mode] = buffer.join('\n');
    mode = null;
    buffer = [];
  }

  function flush() {
    closeMode();
    if (!plan?.id) {
      plan = null;
      return;
    }
    plans[plan.id] = {
      id: plan.id,
      level: field(plan.statement, 'level'),
      patterns: field(plan.statement, 'patterns')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean),
    };
    plan = null;
  }

  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.startsWith('[REQUIREMENT]')) {
      flush();
      plan = { id: '', statement: '' };
      continue;
    }
    if (!plan) continue;
    if (!mode && line.startsWith('UID:')) {
      plan.id = line.slice('UID:'.length).trim();
      continue;
    }
    if (line.trim() === 'STATEMENT: >>>') {
      closeMode();
      mode = 'statement';
      continue;
    }
    if (line.trim() === '<<<') {
      closeMode();
      continue;
    }
    if (mode) buffer.push(line);
  }
  flush();
  planCache = plans;
  return plans;
}

function findCaseFile(testId, level) {
  const dirs = level ? [level, ...CASE_LEVELS.filter((name) => name !== level)] : CASE_LEVELS;
  for (const dir of dirs) {
    for (const ext of ['.test.js', '.spec.js']) {
      const rel = `tests/cases/${dir}/${testId}${ext}`;
      if (fs.existsSync(path.join(repoRoot, rel))) return rel;
    }
  }
  for (const ext of ['.spec.js', '.test.js']) {
    const rel = `tests/smoke/${testId}${ext}`;
    if (fs.existsSync(path.join(repoRoot, rel))) return rel;
  }
  return null;
}

function patternFile(name) {
  const rel = `tests/patterns/${name}.js`;
  return fs.existsSync(path.join(repoRoot, rel)) ? rel : null;
}

function readImports(rel) {
  const found = resolveUnderRepo(rel);
  if (!found) return [];
  const text = fs.readFileSync(found.abs, 'utf8');
  const items = [];
  const seen = new Set();
  NAMED_IMPORT_RE.lastIndex = 0;
  let match = NAMED_IMPORT_RE.exec(text);
  while (match) {
    const spec = match[4];
    const names = match[2]
      ? match[2].split(',').map((part) => part.trim().split(/\s+as\s+/).pop()).filter(Boolean)
      : [match[1] || match[3]].filter(Boolean);
    if (!seen.has(spec)) {
      seen.add(spec);
      items.push({ spec, names });
    }
    match = NAMED_IMPORT_RE.exec(text);
  }
  IMPORT_RE.lastIndex = 0;
  match = IMPORT_RE.exec(text);
  while (match) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      items.push({ spec: match[1], names: [] });
    }
    match = IMPORT_RE.exec(text);
  }
  return items;
}

function toRepoImport(fromRel, spec) {
  if (!spec || spec.startsWith('node:') || !spec.startsWith('.')) return null;
  const abs = path.resolve(repoRoot, path.dirname(fromRel), spec);
  let rel = posix(path.relative(repoRoot, abs));
  if (!path.extname(rel) && fs.existsSync(path.join(repoRoot, `${rel}.js`))) rel = `${rel}.js`;
  return isAllowedRel(rel) ? rel : null;
}

function productionImports(fromRel) {
  const files = [];
  const seen = new Set();
  for (const item of readImports(fromRel)) {
    const rel = toRepoImport(fromRel, item.spec);
    if (!rel || seen.has(rel)) continue;
    if (!rel.startsWith('backend/src/') && !rel.startsWith('frontend/src/')) continue;
    seen.add(rel);
    files.push({ path: rel, role: 'source', symbol: item.names[0] || null });
  }
  return files;
}

export function grainOf(id) {
  const kind = String(id || '').split('-')[0];
  if (kind === 'USR' || kind === 'REQ') return 'need';
  if (kind === 'FNC') return 'allocation';
  if (kind === 'CMP') return 'architecture';
  if (kind === 'API' || kind === 'INT') return 'contract';
  if (kind === 'UNT') return 'unit';
  if (kind === 'TST') return 'test';
  return 'need';
}

function slim(nodes) {
  return (nodes || []).map((node) => ({
    id: node.id,
    kind: node.kind,
    label: node.label || node.id,
  }));
}

function testIdsFor(index, id) {
  const graph = focusGraph(index, id);
  const ids = graph.rings.TST.map((node) => node.id);
  if (String(id).startsWith('TST-')) ids.unshift(id);
  return [...new Set(ids)];
}

function collectUnitFiles(index, id) {
  const plans = readPlanIndex();
  const seen = new Set();
  const files = [];
  let walks = 0;
  for (const testId of testIdsFor(index, id)) {
    const plan = plans[testId] || { level: '', patterns: [] };
    const caseRel = findCaseFile(testId, plan.level);
    const sources = [];
    if (caseRel) sources.push(...productionImports(caseRel));
    for (const name of plan.patterns) {
      const rel = patternFile(name);
      if (rel) sources.push(...productionImports(rel));
    }
    for (const file of sources) {
      if (!file?.path || seen.has(file.path) || !isAllowedRel(file.path)) continue;
      seen.add(file.path);
      files.push(file);
    }
    walks += 1;
    if (walks >= MAX_CHAINS) break;
  }
  return files;
}

export function traceSource(id) {
  const index = buildNeighborhoodIndex();
  const graph = focusGraph(index, id);
  const grain = grainOf(id);
  return {
    id,
    grain,
    functions: slim(graph.rings.FNC),
    components: slim(graph.rings.CMP),
    interfaces: slim(graph.rings.API),
    units: slim(graph.rings.UNT),
    requirements: slim(graph.rings.REQ),
    files: grain === 'unit' ? collectUnitFiles(index, id) : [],
  };
}

function snippetWindow(lines, symbol) {
  if (!symbol) {
    return { start: 1, slice: lines.slice(0, MAX_SNIPPET_LINES) };
  }
  const needle = new RegExp(`(?:export\\s+(?:async\\s+)?(?:function|const|class|let|var)\\s+${symbol}\\b|function\\s+${symbol}\\b|const\\s+${symbol}\\s*=)`);
  let index = lines.findIndex((line) => needle.test(line));
  if (index < 0) index = lines.findIndex((line) => line.includes(symbol));
  if (index < 0) return { start: 1, slice: lines.slice(0, MAX_SNIPPET_LINES) };
  const start = Math.max(0, index);
  return { start: start + 1, slice: lines.slice(start, start + MAX_SNIPPET_LINES) };
}

export function readSourceSnippet(rel, symbol) {
  const found = resolveUnderRepo(rel);
  if (!found) return { error: 'not_allowed', path: rel };
  const text = fs.readFileSync(found.abs, 'utf8');
  const lines = text.split(/\r?\n/);
  const { start, slice } = snippetWindow(lines, symbol);
  let body = slice.join('\n');
  if (body.length > MAX_SNIPPET_CHARS) body = body.slice(0, MAX_SNIPPET_CHARS);
  return {
    path: found.rel,
    symbol: symbol || null,
    start,
    end: start + slice.length - 1,
    text: body,
  };
}

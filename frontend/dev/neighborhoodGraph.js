import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HTML_PATH = path.join(repoRoot, 'docs/strictdoc/trace/neighborhood.html');

const KINDS = new Set(['USR', 'REQ', 'FNC', 'API', 'INT', 'CMP', 'UNT', 'TST']);

export function kindOf(id, fallback = 'REQ') {
  const prefix = String(id || '').split('-')[0];
  if (KINDS.has(prefix)) return prefix;
  return fallback;
}

export function ringKind(kind) {
  if (kind === 'INT') return 'API';
  if (kind === 'USR') return 'REQ';
  return kind;
}

function readNeighborhoodData() {
  const text = fs.readFileSync(HTML_PATH, 'utf8');
  const start = text.indexOf('const DATA = ');
  if (start < 0) throw new Error('neighborhood DATA missing');
  const brace = text.indexOf('{', start);
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = brace; i < text.length; i += 1) {
    const char = text[i];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (char === '\\') {
        esc = true;
        continue;
      }
      if (char === '"') inStr = false;
      continue;
    }
    if (char === '"') {
      inStr = true;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return JSON.parse(text.slice(brace, i + 1));
    }
  }
  throw new Error('neighborhood DATA unclosed');
}

function remember(nodes, item, fallbackKind) {
  if (!item?.id) return;
  const kind = ringKind(item.kind || kindOf(item.id, fallbackKind));
  const prev = nodes[item.id];
  if (prev) {
    if (!prev.label && item.label) prev.label = item.label;
    return;
  }
  nodes[item.id] = {
    id: item.id,
    kind,
    label: item.label || item.id,
    part_of: item.part_of || undefined,
    links: Array.isArray(item.links) ? item.links : undefined,
  };
}

export function buildNeighborhoodIndex() {
  const data = readNeighborhoodData();
  const nodes = {};
  const functions = [];

  for (const fn of data.functions || []) {
    remember(nodes, fn, 'FNC');
    for (const item of fn.requirements || []) remember(nodes, item, 'REQ');
    for (const item of fn.interfaces || []) remember(nodes, item, 'API');
    for (const item of fn.components || []) remember(nodes, item, 'CMP');
    for (const item of fn.units || []) remember(nodes, item, 'UNT');
    for (const item of fn.tests || []) remember(nodes, item, 'TST');
    functions.push({
      id: fn.id,
      requirements: (fn.requirements || []).map((item) => item.id),
      interfaces: (fn.interfaces || []).map((item) => item.id),
      components: (fn.components || []).map((item) => item.id),
      units: (fn.units || []).map((item) => item.id),
      tests: (fn.tests || []).map((item) => ({
        id: item.id,
        links: Array.isArray(item.links) ? item.links : [],
      })),
    });
  }

  return {
    generated_at: data.generated_at || null,
    source_tip: data.source_tip || null,
    default: data.default || null,
    nodes,
    functions,
  };
}

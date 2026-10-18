import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HTML_PATH = path.join(repoRoot, 'docs/strictdoc/trace/neighborhood.html');
export const SSOT_PATH = path.join(repoRoot, 'docs/strictdoc/trace/ssot.json');

const KINDS = new Set(['USR', 'REQ', 'FNC', 'API', 'INT', 'CMP', 'UNT', 'TST']);
const CENSUS_KINDS = ['USR', 'REQ', 'FNC', 'API', 'INT', 'CMP', 'UNT', 'TST'];

export function kindOf(id, fallback = 'REQ') {
  const prefix = String(id || '').split('-')[0];
  if (KINDS.has(prefix)) return prefix;
  return fallback;
}

export function ringKind(kind) {
  if (kind === 'INT') return 'API';
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

function censusFrom(data) {
  return {
    project: data.project || 'ROO',
    generated_at: data.generated_at || null,
    source_tip: data.source_tip || null,
    graph_version: data.graph_version || null,
    nodes: Array.isArray(data.nodes) ? data.nodes : [],
    edges: Array.isArray(data.edges) ? data.edges : [],
  };
}

export function extractSsot() {
  const ssot = censusFrom(readNeighborhoodData());
  fs.mkdirSync(path.dirname(SSOT_PATH), { recursive: true });
  fs.writeFileSync(SSOT_PATH, `${JSON.stringify(ssot)}\n`);
  return ssot;
}

export function readSsotData() {
  if (fs.existsSync(SSOT_PATH)) {
    return censusFrom(JSON.parse(fs.readFileSync(SSOT_PATH, 'utf8')));
  }
  return extractSsot();
}

export function ssotArtifacts() {
  const artifacts = {};
  for (const node of readSsotData().nodes) {
    if (!node?.id) continue;
    artifacts[node.id] = {
      id: node.id,
      title: node.title || node.id,
      statement: String(node.statement || node.desire || node.responsibility || '').trim(),
      domain: node.domain || '',
      acceptance: String(node.acceptance_criteria || '').trim(),
      linked_from: node.linked_from || '',
    };
  }
  return artifacts;
}

function unique(ids) {
  return [...new Set((ids || []).filter(Boolean))];
}

function indexEdges(edges) {
  const out = {};
  const inn = {};
  for (const edge of edges || []) {
    if (!edge?.from || !edge?.to) continue;
    (out[edge.from] ||= []).push(edge);
    (inn[edge.to] ||= []).push(edge);
  }
  return { out, inn };
}

function remember(nodes, item, fallbackKind) {
  if (!item?.id) return;
  const kind = item.kind || kindOf(item.id, fallbackKind);
  const label = item.title || item.label || item.id;
  const links = Array.isArray(item.verifies) ? item.verifies : (Array.isArray(item.links) ? item.links : undefined);
  const prev = nodes[item.id];
  if (prev) {
    if ((!prev.label || prev.label === prev.id) && label) prev.label = label;
    if (!prev.part_of && item.part_of) prev.part_of = item.part_of;
    if (!prev.links && links) prev.links = links;
    if (!prev.level && item.level) prev.level = item.level;
    if (!prev.kind && kind) prev.kind = kind;
    if (!prev.linked_from && item.linked_from) prev.linked_from = item.linked_from;
    return;
  }
  nodes[item.id] = {
    id: item.id,
    kind,
    label,
    part_of: item.part_of || undefined,
    links,
    level: item.level || undefined,
    linked_from: item.linked_from || undefined,
  };
}

function functionsFromNodes(data, out, inn) {
  const raw = data.nodes || [];
  const byId = Object.fromEntries(raw.filter((item) => item?.id).map((item) => [item.id, item]));
  const functions = [];

  for (const fn of raw) {
    if (!fn?.id || (fn.kind || kindOf(fn.id)) !== 'FNC') continue;
    const fid = fn.id;
    const requirements = unique([
      ...(fn.implements || []),
      ...(out[fid] || []).filter((edge) => edge.type === 'implements' && kindOf(edge.to) === 'REQ').map((edge) => edge.to),
    ]);
    const users = [];
    for (const reqId of requirements) {
      const req = byId[reqId];
      if (req?.linked_from) users.push(req.linked_from);
      for (const edge of out[reqId] || []) {
        if (edge.type === 'linked_from' && kindOf(edge.to) === 'USR') users.push(edge.to);
      }
    }
    const interfaces = unique([
      ...(inn[fid] || []).filter((edge) => edge.type === 'depends_on' && (kindOf(edge.from) === 'API' || kindOf(edge.from) === 'INT')).map((edge) => edge.from),
      ...(inn[fid] || []).filter((edge) => edge.type === 'implements_fnc').map((edge) => edge.from),
      ...raw.filter((item) => item.kind === 'INT' && item.implements_fnc === fid).map((item) => item.id),
    ]);
    const components = unique(
      (out[fid] || []).filter((edge) => edge.type === 'allocated_to' && kindOf(edge.to) === 'CMP').map((edge) => edge.to),
    );
    const units = unique([
      ...(inn[fid] || []).filter((edge) => edge.type === 'refines' && kindOf(edge.from) === 'UNT').map((edge) => edge.from),
      ...raw.filter((item) => item.kind === 'UNT' && (item.refines || []).includes(fid)).map((item) => item.id),
    ]);
    const okTargets = new Set([fid, ...requirements, ...units, ...components]);
    const tests = [];
    for (const test of raw) {
      if ((test.kind || kindOf(test.id)) !== 'TST') continue;
      const targets = new Set([...(test.verifies || [])]);
      for (const edge of out[test.id] || []) {
        if (edge.type === 'verifies') targets.add(edge.to);
      }
      if (![...targets].some((target) => okTargets.has(target))) continue;
      tests.push({ id: test.id, links: [...targets] });
    }
    functions.push({
      id: fid,
      requirements: unique([...requirements, ...users]),
      interfaces,
      components,
      units,
      tests,
    });
  }

  return functions;
}

function functionsFromLegacy(data, nodes) {
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
  return functions;
}

function countKinds(nodes) {
  const kinds = Object.fromEntries(CENSUS_KINDS.map((kind) => [kind, 0]));
  for (const node of nodes) {
    const kind = node?.kind || kindOf(node?.id);
    if (kinds[kind] != null) kinds[kind] += 1;
  }
  return kinds;
}

export function buildNeighborhoodIndex() {
  const data = readSsotData();
  const nodes = {};
  let functions = [];

  if (Array.isArray(data.nodes) && data.nodes.length) {
    for (const item of data.nodes) remember(nodes, item);
    const { out, inn } = indexEdges(data.edges);
    functions = functionsFromNodes(data, out, inn);
  } else {
    functions = functionsFromLegacy(data, nodes);
  }

  const defaultId = data.default
    || Object.keys(nodes).find((id) => id.startsWith('FNC-'))
    || Object.keys(nodes).find((id) => id.startsWith('REQ-'))
    || Object.keys(nodes)[0]
    || null;

  return {
    generated_at: data.generated_at || null,
    source_tip: data.source_tip || null,
    graph_version: data.graph_version || null,
    default: defaultId && nodes[defaultId] ? defaultId : null,
    nodes,
    functions,
    census: countKinds(Object.values(nodes)),
  };
}

function isCli() {
  const invoked = process.argv[1];
  if (!invoked) return false;
  return path.resolve(invoked) === fileURLToPath(import.meta.url);
}

if (isCli()) {
  const extracted = !fs.existsSync(SSOT_PATH);
  const data = readSsotData();
  const graph = buildNeighborhoodIndex();
  const census = countKinds(data.nodes);
  const nodeCount = data.nodes.length;
  if (extracted) console.log(`wrote ${path.relative(repoRoot, SSOT_PATH)}`);
  console.log(`source ${graph.source_tip || 'unknown'}`);
  console.log(`generated ${graph.generated_at || 'unknown'}`);
  if (graph.graph_version != null) console.log(`graph ${graph.graph_version}`);
  console.log(`default ${graph.default || '(none)'}`);
  console.log(`nodes ${nodeCount}`);
  console.log(`functions ${graph.functions.length}`);
  for (const kind of CENSUS_KINDS) {
    console.log(`${kind} ${census[kind] || 0}`);
  }
  if (!nodeCount || !graph.default) {
    console.error('World graph is empty. Globe stays disabled.');
    process.exit(1);
  }
}

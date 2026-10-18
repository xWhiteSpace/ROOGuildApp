import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readSsotData, SSOT_PATH } from './neighborhoodGraph.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HTML_PATH = path.join(repoRoot, 'docs/strictdoc/trace/neighborhood.html');

const VAL_DOMAINS = new Set([
  'Platform/Auth',
  'Tenant/Workspace',
  'Games catalog',
  'Billing/Capacity',
  'Discord bot/Channels',
  'Discord',
  'Frontend shell/UX',
  'Data isolation/Storage',
  'Data isolation',
]);

const LINEAGE = new Set(['USR', 'REQ', 'FNC', 'API', 'CMP', 'INT', 'UNT', 'TST']);
const ID_TOKEN = /\b((?:USR|REQ|FNC|API|CMP|INT|UNT|TST)-ROO-\d+)\b/g;

const TEXT_FILES = [
  'docs/strictdoc/requirements/usr.sdoc',
  'docs/strictdoc/requirements/req.sdoc',
  'docs/strictdoc/verification/tests.sdoc',
  'docs/strictdoc/design/summary.sdoc',
  'docs/strictdoc/design/onboarding.sdoc',
  'docs/strictdoc/design/gvg-readiness.sdoc',
  'docs/strictdoc/deep_learn.sdoc',
  'docs/strictdoc/MANIFEST.json',
  'docs/strictdoc/DELIVERABLES.md',
  'docs/strictdoc/README.md',
  'AGENTS.md',
];

export function buildRenameMap(data = readSsotData()) {
  const map = {};
  const byKind = {};
  const flagged = [];
  for (const node of data.nodes || []) {
    const id = node?.id;
    if (!id || !LINEAGE.has(node.kind || id.split('-')[0])) continue;
    if (!VAL_DOMAINS.has(node.domain || '')) continue;
    const next = id.replace('-ROO-', '-VAL-');
    if (next === id) continue;
    map[id] = next;
    const kind = node.kind || id.split('-')[0];
    byKind[kind] = (byKind[kind] || 0) + 1;
    if (id === 'TST-ROO-061') {
      flagged.push({
        id,
        next,
        domain: node.domain,
        verifies: node.verifies || [],
      });
    }
  }
  return { map, byKind, flagged, total: Object.keys(map).length };
}

function rewriteTokens(text, map) {
  return String(text).replace(ID_TOKEN, (match) => map[match] || match);
}

function rewriteValue(value, map) {
  if (typeof value === 'string') {
    if (map[value]) return map[value];
    return rewriteTokens(value, map);
  }
  if (Array.isArray(value)) return value.map((item) => rewriteValue(item, map));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = rewriteValue(item, map);
    }
    return out;
  }
  return value;
}

function rewriteSsot(map) {
  const raw = JSON.parse(fs.readFileSync(SSOT_PATH, 'utf8'));
  const next = rewriteValue(raw, map);
  fs.writeFileSync(SSOT_PATH, `${JSON.stringify(next)}\n`);
}

function rewriteTextFile(rel, map) {
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) return 0;
  const before = fs.readFileSync(abs, 'utf8');
  const after = rewriteTokens(before, map);
  if (after === before) return 0;
  fs.writeFileSync(abs, after);
  return 1;
}

function listCaseFiles() {
  const roots = ['unit', 'integration', 'system', 'acceptance'].map((dir) => (
    path.join(repoRoot, 'tests/cases', dir)
  ));
  const files = [];
  for (const dir of roots) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!/^TST-ROO-\d+\.(test|spec)\.js$/.test(name)) continue;
      files.push(path.join(dir, name));
    }
  }
  return files;
}

function renameTestFiles(map) {
  const moved = [];
  for (const abs of listCaseFiles()) {
    const name = path.basename(abs);
    const id = name.replace(/\.(test|spec)\.js$/, '');
    const nextId = map[id];
    if (!nextId) continue;
    const dest = path.join(path.dirname(abs), name.replace(id, nextId));
    const relFrom = path.relative(repoRoot, abs);
    const relTo = path.relative(repoRoot, dest);
    const result = spawnSync('git', ['mv', relFrom, relTo], { cwd: repoRoot, encoding: 'utf8' });
    if (result.status !== 0) {
      throw new Error(`git mv failed ${relFrom} -> ${relTo}: ${result.stderr || result.stdout}`);
    }
    const body = fs.readFileSync(dest, 'utf8');
    const rewritten = rewriteTokens(body, map);
    if (rewritten !== body) fs.writeFileSync(dest, rewritten);
    moved.push({ from: relFrom, to: relTo });
  }
  return moved;
}

function printReport({ map, byKind, flagged, total }) {
  console.log(`VAL rename map: ${total} ids`);
  for (const kind of ['USR', 'REQ', 'FNC', 'API', 'CMP', 'INT', 'UNT', 'TST']) {
    console.log(`  ${kind} ${byKind[kind] || 0}`);
  }
  if (flagged.length) {
    for (const item of flagged) {
      console.log(`flagged ${item.id} -> ${item.next} domain=${item.domain}`);
      console.log(`  verifies ${JSON.stringify(item.verifies)}`);
    }
  } else {
    console.log('flagged TST-ROO-061: not in VAL map');
  }
  const collisions = Object.values(map).filter((id, index, all) => all.indexOf(id) !== index);
  console.log(`collisions ${collisions.length}`);
}

function isCli() {
  const invoked = process.argv[1];
  if (!invoked) return false;
  return path.resolve(invoked) === fileURLToPath(import.meta.url);
}

if (isCli()) {
  const dry = process.argv.includes('--dry-run');
  const report = buildRenameMap();
  printReport(report);
  if (dry) process.exit(0);
  const { map } = report;
  rewriteSsot(map);
  console.log(`rewrote ${path.relative(repoRoot, SSOT_PATH)}`);
  if (rewriteTextFile(path.relative(repoRoot, HTML_PATH), map)) {
    console.log(`rewrote ${path.relative(repoRoot, HTML_PATH)}`);
  }
  for (const rel of TEXT_FILES) {
    if (rewriteTextFile(rel, map)) console.log(`rewrote ${rel}`);
  }
  const moved = renameTestFiles(map);
  console.log(`moved ${moved.length} test files`);
}

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const LEVELS = ['acceptance', 'system', 'integration', 'unit'];

function blankCounts() {
  return { passed: 0, failed: 0, skipped: 0, notRun: 0 };
}

function addCount(bucket, status) {
  if (status === 'passed') bucket.passed += 1;
  else if (status === 'failed') bucket.failed += 1;
  else if (status === 'skipped') bucket.skipped += 1;
  else bucket.notRun += 1;
}

function field(block, name) {
  const match = String(block || '').match(new RegExp(`^${name}:[ \\t]*(.*)$`, 'm'));
  return match ? match[1].trim() : '';
}

function parseCases(statement) {
  const match = String(statement || '').match(/^cases:[ \t]*$/m);
  if (!match) return [];
  const cases = [];
  for (const raw of statement.slice(match.index + match[0].length).split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.trim() === '') continue;
    if (line.startsWith('  - ')) {
      cases.push(line.slice(4));
      continue;
    }
    break;
  }
  return cases;
}

function parseCatalog(relPath) {
  const filePath = path.join(repoRoot, relPath);
  if (!fs.existsSync(filePath)) return {};
  const text = fs.readFileSync(filePath, 'utf8');
  const items = {};
  let current = null;
  let mode = null;
  let buffer = [];

  function closeMode() {
    if (current && mode) current[mode] = buffer.join('\n');
    mode = null;
    buffer = [];
  }

  function flush() {
    closeMode();
    if (!current?.id) return;
    let title = current.title || current.id;
    if (title.startsWith(`${current.id}:`)) title = title.slice(current.id.length + 1).trim();
    items[current.id] = {
      id: current.id,
      title,
      statement: String(current.statement || '').trim(),
      domain: field(current.comment, 'domain'),
    };
    current = null;
  }

  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.startsWith('[REQUIREMENT]')) {
      flush();
      current = { id: '', title: '', statement: '', comment: '' };
      continue;
    }
    if (!current) continue;
    if (!mode && line.startsWith('UID:')) {
      current.id = line.slice('UID:'.length).trim();
      continue;
    }
    if (!mode && line.startsWith('TITLE:')) {
      current.title = line.slice('TITLE:'.length).trim();
      continue;
    }
    if (line.trim() === 'STATEMENT: >>>') {
      closeMode();
      mode = 'statement';
      continue;
    }
    if (line.trim() === 'COMMENT: >>>') {
      closeMode();
      mode = 'comment';
      continue;
    }
    if (line.trim() === '<<<') {
      closeMode();
      continue;
    }
    if (mode) buffer.push(line);
  }
  flush();
  return items;
}

function parseDomain(comment, sectionTitle) {
  let domain = field(comment, 'domain');
  if (!domain && sectionTitle) domain = sectionTitle.split('—')[0].trim();
  if (domain === 'Platform/Auth gaps' || String(sectionTitle || '').startsWith('Platform/Auth gaps')) {
    domain = 'Platform/Auth';
  }
  return domain;
}

function readPlans() {
  const text = fs.readFileSync(path.join(repoRoot, 'docs/strictdoc/verification/tests.sdoc'), 'utf8');
  const plans = [];
  let sectionTitle = '';
  let plan = null;
  let mode = null;
  let buffer = [];

  function closeMode() {
    if (plan && mode) plan[mode] = buffer.join('\n');
    mode = null;
    buffer = [];
  }

  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.startsWith('[[SECTION]]')) {
      closeMode();
      plan = null;
      continue;
    }
    if (line.startsWith('[REQUIREMENT]')) {
      closeMode();
      plan = { sectionTitle, id: '', title: '', statement: '', comment: '' };
      plans.push(plan);
      continue;
    }
    if (!plan && line.startsWith('TITLE:')) {
      sectionTitle = line.slice('TITLE:'.length).trim();
      continue;
    }
    if (plan && !mode && line.startsWith('UID:')) {
      plan.id = line.slice('UID:'.length).trim();
      continue;
    }
    if (plan && !mode && line.startsWith('TITLE:')) {
      plan.title = line.slice('TITLE:'.length).trim();
      continue;
    }
    if (line.trim() === 'STATEMENT: >>>') {
      closeMode();
      mode = 'statement';
      continue;
    }
    if (line.trim() === 'COMMENT: >>>') {
      closeMode();
      mode = 'comment';
      continue;
    }
    if (line.trim() === '<<<') {
      closeMode();
      continue;
    }
    if (mode) buffer.push(line);
  }
  closeMode();

  return plans.filter((item) => item.id).map((item) => ({
    id: item.id,
    title: item.title || item.id,
    level: field(item.statement, 'level'),
    domain: parseDomain(item.comment, item.sectionTitle),
    verifies: field(item.statement, 'verifies').split(',').map((part) => part.trim()).filter(Boolean),
    cases: parseCases(item.statement),
  }));
}

function readLatest() {
  const filePath = path.join(repoRoot, 'tests/results/latest.json');
  if (!fs.existsSync(filePath)) return { commit: null, time: null, cases: [] };
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return {
    commit: parsed.commit ?? null,
    time: parsed.time ?? null,
    cases: Array.isArray(parsed.cases) ? parsed.cases : [],
  };
}

function planStatus(plan, cases) {
  const match = cases.find((entry) => String(entry.file || '').includes(plan.id));
  if (!match) return 'notRun';
  if (match.status === 'passed' || match.status === 'failed' || match.status === 'skipped') return match.status;
  return 'notRun';
}

export function buildDebugReport() {
  const latest = readLatest();
  const plans = readPlans();
  const totals = blankCounts();
  const grouped = new Map(LEVELS.map((id) => [id, { id, counts: blankCounts(), checks: [] }]));

  for (const plan of plans) {
    const status = planStatus(plan, latest.cases);
    addCount(totals, status);
    let bucket = grouped.get(plan.level);
    if (!bucket) {
      bucket = { id: plan.level || 'unknown', counts: blankCounts(), checks: [] };
      grouped.set(bucket.id, bucket);
    }
    addCount(bucket.counts, status);
    bucket.checks.push({
      id: plan.id,
      title: plan.title,
      status,
      domain: plan.domain,
      verifies: plan.verifies,
      cases: plan.cases,
    });
  }

  const levels = LEVELS.map((id) => grouped.get(id)).filter(Boolean);
  for (const [id, bucket] of grouped) {
    if (!LEVELS.includes(id)) levels.push(bucket);
  }

  return {
    commit: latest.commit,
    time: latest.time,
    totals,
    levels,
    artifacts: {
      ...parseCatalog('docs/strictdoc/requirements/usr.sdoc'),
      ...parseCatalog('docs/strictdoc/requirements/req.sdoc'),
    },
  };
}

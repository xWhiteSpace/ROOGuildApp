import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const latestPath = path.join(root, 'tests/results/latest.json');
const vitestPath = path.join(root, 'tests/results/raw/vitest.json');
const playwrightPath = path.join(root, 'tests/results/raw/playwright.json');

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function repoRelative(filePath) {
  if (!filePath) return filePath;
  const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(root, filePath);
  return path.relative(root, absolute).split(path.sep).join('/');
}

function vitestCases(report) {
  if (!report?.testResults) return [];
  return report.testResults.map((result) => ({
    file: repoRelative(result.name),
    status: result.status === 'passed' ? 'passed' : result.status === 'skipped' ? 'skipped' : 'failed',
  }));
}

function playwrightFile(filePath) {
  if (!filePath) return filePath;
  const relative = repoRelative(filePath);
  if (relative.startsWith('tests/')) return relative;
  return `tests/${relative}`;
}

function walkPlaywrightSuites(suites, filePath, cases) {
  for (const suite of suites || []) {
    const nextFile = suite.file ? playwrightFile(suite.file) : filePath;
    for (const spec of suite.specs || []) {
      const test = spec.tests?.[0];
      const outcome = test?.status;
      let status = 'failed';
      if (spec.ok && (outcome === 'expected' || outcome === 'flaky')) status = 'passed';
      else if (outcome === 'skipped') status = 'skipped';
      cases.push({ file: nextFile || spec.title, status });
    }
    walkPlaywrightSuites(suite.suites, nextFile, cases);
  }
}

function playwrightCases(report) {
  const cases = [];
  walkPlaywrightSuites(report?.suites, null, cases);
  return cases;
}

function commitSha() {
  try {
    return execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

export function writeLatest() {
  const previous = readJson(latestPath);
  const byFile = new Map();
  for (const entry of previous?.cases || []) {
    if (entry?.file) byFile.set(entry.file, entry.status);
  }
  for (const entry of [
    ...vitestCases(readJson(vitestPath)),
    ...playwrightCases(readJson(playwrightPath)),
  ]) {
    byFile.set(entry.file, entry.status);
  }
  const cases = [...byFile.entries()]
    .map(([file, status]) => ({ file, status }))
    .sort((a, b) => a.file.localeCompare(b.file));
  const payload = {
    commit: commitSha(),
    time: new Date().toISOString(),
    cases,
  };
  fs.mkdirSync(path.dirname(latestPath), { recursive: true });
  fs.writeFileSync(latestPath, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeLatest();
}

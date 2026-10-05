import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:3000';
const LEVELS = [
  { needle: 'Acceptance test', title: 'Acceptance test' },
  { needle: 'System test', title: 'System test' },
  { needle: 'Integration', title: 'Integration' },
  { needle: 'Unit test', title: 'Unit test' },
];

async function ping() {
  try {
    const response = await fetch(`${BASE}/debug`);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitFor(fn, ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await fn()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function launchBrowser() {
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ channel: 'chrome' });
  }
}

const started = [];
if (!(await ping())) {
  const child = spawn('npm', ['--prefix', 'frontend', 'run', 'dev', '--', '--host', '127.0.0.1', '--port', '3000'], {
    stdio: 'ignore',
  });
  started.push(child);
  if (!(await waitFor(ping, 30_000))) {
    for (const child of started) child.kill();
    console.error('Frontend did not start on :3000.');
    process.exit(1);
  }
}

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
let failed = 0;

function check(ok, label) {
  console.log(`${ok ? 'ok' : 'FAIL'}  ${label}`);
  if (!ok) failed += 1;
}

try {
  await page.goto(`${BASE}/debug`, { waitUntil: 'networkidle' });
  const nodes = page.locator('button.dbg-v-node');
  check(await nodes.count() === 8, 'eight V-model nodes');
  check(await page.locator('polyline.dbg-v-rail').count() === 2, 'two rails');
  check(await page.locator('button.dbg-v-row').count() === 0, 'no leftover bar cards');
  check(await page.locator('.dbg-v-coding').count() === 1, 'coding tip');
  check(await page.locator('.dbg-v-floor').count() === 1, 'infinite floor grid');

  const spec = page.locator('button.dbg-v-node[aria-label*="Requirements"]');
  const specBox = await spec.boundingBox();
  if (specBox) {
    await page.mouse.click(specBox.x + specBox.width / 2, specBox.y + specBox.height / 2);
    await page.getByRole('button', { name: 'Back' }).waitFor({ timeout: 5000 });
    check(await page.locator('h1').first().innerText() === 'Requirements', 'left node opens Requirements');
    await page.getByRole('button', { name: 'Back' }).click();
    await nodes.first().waitFor({ timeout: 5000 });
    await page.waitForTimeout(700);
  } else {
    check(false, 'left node opens Requirements');
  }

  for (const level of LEVELS) {
    const btn = page.locator(`button.dbg-v-node[aria-label*="${level.needle}"]`);
    const box = await btn.boundingBox();
    if (!box) {
      check(false, `click ${level.title}`);
      continue;
    }
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const back = page.getByRole('button', { name: 'Back' });
    await back.waitFor({ timeout: 5000 });
    const title = await page.locator('h1').first().innerText();
    check(title === level.title, `dolly into ${level.title}`);
    await back.click();
    await nodes.first().waitFor({ timeout: 5000 });
    await page.waitForTimeout(700);
    check(await nodes.count() === 8, `back from ${level.title}`);
  }
} catch (err) {
  console.error(err.message);
  failed += 1;
} finally {
  await browser.close();
  for (const child of started) child.kill();
}

process.exit(failed ? 1 : 0);

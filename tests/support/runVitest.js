import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeLatest } from './writeLatest.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rawDir = path.join(root, 'tests/results/raw');
fs.mkdirSync(rawDir, { recursive: true });

const child = spawn(process.execPath, [
  path.join(root, 'node_modules/vitest/vitest.mjs'),
  'run',
  '--reporter=default',
  '--reporter=json',
  '--outputFile=tests/results/raw/vitest.json',
], { cwd: root, stdio: 'inherit' });

child.on('exit', (code) => {
  try {
    writeLatest();
  } catch (err) {
    console.error(err);
  }
  process.exit(code ?? 1);
});

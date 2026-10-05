import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeLatest } from './writeLatest.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
fs.mkdirSync(path.join(root, 'tests/results/raw'), { recursive: true });

const child = spawn(process.execPath, [
  path.join(root, 'node_modules/playwright/cli.js'),
  'test',
], { cwd: root, stdio: 'inherit' });

child.on('exit', (code) => {
  try {
    writeLatest();
  } catch (err) {
    console.error(err);
  }
  process.exit(code ?? 1);
});

import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { query } from './pool.js';
import { migrate } from './migrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function makeCode() {
  const raw = crypto.randomBytes(9).toString('hex').toUpperCase();
  return `VH-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

async function main() {
  await migrate();
  const { rows } = await query('SELECT COUNT(*)::int AS n FROM invite_codes');
  const existing = rows[0]?.n || 0;
  if (existing > 0) {
    console.log(`invite_codes already has ${existing} row(s). Not minting more.`);
    return;
  }
  const codes = Array.from({ length: 10 }, makeCode);
  for (const code of codes) {
    await query('INSERT INTO invite_codes (code) VALUES ($1)', [code]);
  }
  console.log('Created 10 invite codes. Save these privately (not git, not Stripe):');
  for (const code of codes) console.log(code);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

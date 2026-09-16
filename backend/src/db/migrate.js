import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool } from './pool.js';
import { revertAutomaticFoundingSeatsOnce } from './billing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await getPool().query(sql);
  const reverted = await revertAutomaticFoundingSeatsOnce();
  if (reverted > 0) {
    console.log(`SUCCESS: PostgreSQL schema is ready. Cleared ${reverted} automatic founding seat(s). Grant the ones you want with: npm --prefix backend run founding-seat -- grant <guildId>`);
  } else {
    console.log('SUCCESS: PostgreSQL schema is ready.');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  import('dotenv').then((dotenv) => {
    dotenv.default.config({ path: path.resolve(__dirname, '../../.env') });
    migrate()
      .then(() => process.exit(0))
      .catch((err) => {
        console.error(err);
        process.exit(1);
      });
  });
}

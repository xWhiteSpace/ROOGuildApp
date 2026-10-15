import { getTenantStore } from '../../../db/database.js';
import { resolveDiscordCardCopy } from '../defaults.js';

export async function loadDiscordCardCopy() {
  const db = getTenantStore();
  const snap = await db.ref('settings/configuration').once('value');
  return resolveDiscordCardCopy(snap.exists() ? snap.val() : {});
}

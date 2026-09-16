/**
 * Operator-only: choose which Discord servers get a founding (permanent free) seat.
 *
 *   npm --prefix backend run founding-seat
 *   npm --prefix backend run founding-seat -- grant <discordGuildId>
 *   npm --prefix backend run founding-seat -- revoke <discordGuildId>
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { query } from './pool.js';
import { migrate } from './migrate.js';
import {
  activateTenantBilling,
  countOccupyingGuilds,
  tenantHasAccess,
  withBillingLock,
} from './billing.js';
import { billingEnv } from '../config/billingEnv.js';
import { getTenant } from './tenants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function usage() {
  console.log(`Founding seats are chosen by you, not granted automatically.

  npm --prefix backend run founding-seat
  npm --prefix backend run founding-seat -- grant <discordGuildId>
  npm --prefix backend run founding-seat -- revoke <discordGuildId>
`);
}

async function listTenants() {
  const { rows } = await query(
    `SELECT id, display_name, onboarded, subscription_status, billing_source
     FROM tenants
     ORDER BY created_at ASC`
  );
  if (!rows.length) {
    console.log('No tenants yet.');
    return;
  }
  console.log('id\tonboarded\tstatus\tsource\tname');
  for (const row of rows) {
    console.log(
      [
        row.id,
        row.onboarded ? 'yes' : 'no',
        row.subscription_status || 'inactive',
        row.billing_source || '-',
        row.display_name || '',
      ].join('\t')
    );
  }
  const occupying = await countOccupyingGuilds();
  const { maxActiveGuilds } = billingEnv();
  console.log(`\n${occupying}/${maxActiveGuilds} seats claimed.`);
}

async function grantFoundingSeat(tenantId) {
  const result = await withBillingLock(async (client) => {
    const tenantRes = await client.query('SELECT * FROM tenants WHERE id = $1 FOR UPDATE', [tenantId]);
    const tenant = tenantRes.rows[0];
    if (!tenant) return { error: `Unknown tenant ${tenantId}` };
    if (tenantHasAccess(tenant) && tenant.billing_source === 'grandfathered') {
      return { error: `${tenantId} already has a founding seat.` };
    }
    if (tenantHasAccess(tenant)) {
      return { error: `${tenantId} already has an active seat (${tenant.billing_source || tenant.subscription_status}).` };
    }
    const { maxActiveGuilds } = billingEnv();
    const occupying = await countOccupyingGuilds(client);
    if (occupying >= maxActiveGuilds) {
      return { error: `Capacity reached (${maxActiveGuilds}/${maxActiveGuilds}).` };
    }
    await activateTenantBilling(client, tenantId, {
      subscriptionStatus: 'active',
      billingSource: 'grandfathered',
    });
    return { ok: true, name: tenant.display_name };
  });
  if (result.error) {
    console.error(result.error);
    process.exitCode = 1;
    return;
  }
  console.log(`Founding seat granted to ${tenantId}${result.name ? ` (${result.name})` : ''}. Permanent, no $1/mo.`);
}

async function revokeFoundingSeat(tenantId) {
  const tenant = await getTenant(tenantId);
  if (!tenant) {
    console.error(`Unknown tenant ${tenantId}`);
    process.exitCode = 1;
    return;
  }
  if (tenant.billing_source !== 'grandfathered') {
    console.error(`${tenantId} is not a founding seat (source=${tenant.billing_source || 'none'}).`);
    process.exitCode = 1;
    return;
  }
  await query(
    `UPDATE tenants
     SET subscription_status = 'inactive',
         billing_source = NULL,
         grace_until = NULL
     WHERE id = $1 AND billing_source = 'grandfathered'`,
    [tenantId]
  );
  console.log(`Founding seat revoked from ${tenantId}${tenant.display_name ? ` (${tenant.display_name})` : ''}.`);
}

async function main() {
  await migrate();
  const [command, tenantId] = process.argv.slice(2);
  if (!command || command === 'list') {
    usage();
    await listTenants();
    return;
  }
  if (!tenantId) {
    usage();
    process.exitCode = 1;
    return;
  }
  if (command === 'grant') {
    await grantFoundingSeat(String(tenantId));
    return;
  }
  if (command === 'revoke') {
    await revokeFoundingSeat(String(tenantId));
    return;
  }
  usage();
  process.exitCode = 1;
}

main()
  .then(() => process.exit(process.exitCode || 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

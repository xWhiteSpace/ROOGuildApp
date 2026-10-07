import { vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { runWithGame, runWithTenant, clearTenantCaches } from '../../backend/src/db/tenantContext.js';
import { RAGNAROK_3_ID, RAGNAROK_ORIGIN_ID } from '../../backend/src/games/catalog.js';
import { gameIdForPath } from '../../frontend/src/games/catalog.js';
import { CONTRIBUTORS } from '../../backend/src/games/scheduleContributors.js';

patterns.r3_game_required = 'used';
patterns.r3_dual_roster = 'used';
patterns.r3_settings_split = 'used';
patterns.r3_game_id_stamp = 'used';
patterns.r3_path_catalog = 'used';
patterns.r3_no_schedule_contributor = 'used';

const hold = vi.hoisted(() => ({ writes: [] }));

vi.mock('../../backend/src/db/pool.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    query: async (sql, params = []) => {
      hold.writes.push({ sql: String(sql), params: [...params] });
      if (/SELECT configuration FROM tenant_settings/i.test(String(sql))) {
        return { rows: [{ configuration: { timezone: 'Asia/Manila', guildDisplayName: 'Guild' } }] };
      }
      if (/SELECT configuration FROM game_settings/i.test(String(sql))) {
        return { rows: [] };
      }
      return { rows: [], rowCount: 1 };
    },
  };
});

const { getTenantStore } = await import('../../backend/src/db/database.js');

const SCHEMA_PATH = join(dirname(fileURLToPath(import.meta.url)), '../../backend/src/db/schema.sql');

export async function dualRosterSameDiscordId() {
  return withEnv({}, async () => {
    hold.writes = [];
    clearTenantCaches();
    await runWithTenant('T', async () => {
      await runWithGame(RAGNAROK_ORIGIN_ID, async () => {
        await getTenantStore().ref('auction/members/u1').set({ jobCode: 'KN', inGameName: 'OriginKnight' });
      });
      await runWithGame(RAGNAROK_3_ID, async () => {
        await getTenantStore().ref('auction/members/u1').set({ jobCode: 'WI', inGameName: 'R3Wizard' });
      });
    });
    const inserts = hold.writes.filter((w) => /INSERT INTO members/i.test(w.sql));
    return {
      count: inserts.length,
      games: inserts.map((w) => w.params[1]),
      discordIds: inserts.map((w) => w.params[2]),
    };
  });
}

export async function r3SettingsSaveDoesNotTouchOrigin() {
  return withEnv({}, async () => {
    hold.writes = [];
    clearTenantCaches();
    await runWithTenant('T', async () => {
      await runWithGame(RAGNAROK_3_ID, async () => {
        await getTenantStore().ref('settings/configuration').set({
          jobs: { job_001: { name: 'Wizard' } },
          timezone: 'Asia/Tokyo',
          guildDisplayName: 'Should Not Write',
        });
      });
    });
    const gameWrites = hold.writes.filter((w) => /INSERT INTO game_settings/i.test(w.sql));
    const workspaceWrites = hold.writes.filter((w) => /INSERT INTO tenant_settings/i.test(w.sql));
    const originGameWrites = gameWrites.filter((w) => w.params[1] === RAGNAROK_ORIGIN_ID);
    const r3GameWrites = gameWrites.filter((w) => w.params[1] === RAGNAROK_3_ID);
    const r3Payload = r3GameWrites[0] ? JSON.parse(r3GameWrites[0].params[2]) : {};
    return {
      workspaceWrites: workspaceWrites.length,
      originGameWrites: originGameWrites.length,
      r3GameWrites: r3GameWrites.length,
      r3HasJobs: Boolean(r3Payload.jobs?.job_001),
      r3HasTimezone: Object.prototype.hasOwnProperty.call(r3Payload, 'timezone'),
    };
  });
}

export async function originJsonDocsUnreadableFromR3Context() {
  return withEnv({}, async () => {
    hold.writes = [];
    clearTenantCaches();
    await runWithTenant('T', async () => {
      await runWithGame(RAGNAROK_3_ID, async () => {
        await getTenantStore().ref('attendance/compositions/board1').set({ slots: { a: 1 } });
      });
    });
    const writes = hold.writes.filter((w) => /INSERT INTO json_docs/i.test(w.sql));
    return {
      count: writes.length,
      gameId: writes[0]?.params?.[1] || null,
      path: writes[0]?.params?.[2] || null,
    };
  });
}

export function schemaStampsGameId() {
  const sql = readFileSync(SCHEMA_PATH, 'utf8');
  return {
    hasGameSettings: /CREATE TABLE IF NOT EXISTS game_settings/i.test(sql),
    membersGameId: /ALTER TABLE members ADD COLUMN IF NOT EXISTS game_id/i.test(sql)
      && /PRIMARY KEY \(tenant_id, game_id, discord_id\)/i.test(sql),
    originBackfill: /INSERT INTO game_settings \(tenant_id, game_id, configuration, updated_at\)/i.test(sql),
    agJsonDocs: /SET game_id = 'adventurer-guild'/i.test(sql),
  };
}

export function r3PathCatalog() {
  return {
    home: gameIdForPath('/games/ragnarok-3'),
    nested: gameIdForPath('/games/ragnarok-3/war-room'),
    originRoot: gameIdForPath('/attendance/masterlist'),
    ag: gameIdForPath('/games/adventurer-guild/events'),
  };
}

export function r3NotInScheduleContributors() {
  return {
    ids: Object.keys(CONTRIBUTORS || {}),
    hasR3: Object.prototype.hasOwnProperty.call(CONTRIBUTORS || {}, RAGNAROK_3_ID),
  };
}

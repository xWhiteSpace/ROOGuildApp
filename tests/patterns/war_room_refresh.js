import { vi } from 'vitest';
import { runWithTenant } from '../../backend/src/db/tenantContext.js';

const hold = vi.hoisted(() => ({
  docs: {},
  anchor: null,
  anchorWrites: 0,
  calls: [],
}));

function mockQuery(sql, params = []) {
  const text = String(sql);
  const bound = [...params];
  hold.calls.push({ sql: text, params: bound });
  if (text.includes("data->>'status'") && text.includes('attendance/live_session')) {
    const live = hold.docs['attendance/live_session'];
    if (!live) return { rows: [], rowCount: 0 };
    return { rows: [{ status: live.status ?? null }], rowCount: 1 };
  }
  if (text.includes('data #>') && text.includes('json_docs')) {
    const path = bound[2];
    const keyPath = JSON.parse(bound[3]);
    const doc = hold.docs[path];
    if (!doc || typeof doc !== 'object') return { rows: [], rowCount: 0 };
    const value = keyPath.reduce((cur, key) => (cur == null ? undefined : cur[key]), doc);
    return { rows: [{ data: value === undefined ? null : value }], rowCount: 1 };
  }
  if (text.includes('jsonb_set') && text.includes('attendance/published')) {
    const publishedId = bound[2];
    const doc = hold.docs['attendance/published'];
    if (!doc || !Object.prototype.hasOwnProperty.call(doc, publishedId)) {
      return { rows: [], rowCount: 0 };
    }
    doc[publishedId] = {
      ...doc[publishedId],
      grids: JSON.parse(bound[3]),
      selectedGridIds: JSON.parse(bound[4]),
      configId: bound[5],
      configTitle: bound[6],
      lastUpdated: Number(bound[7]),
    };
    return { rows: [], rowCount: 1 };
  }
  if (text.includes('attendance/published_anchor') && /^\s*SELECT/i.test(text)) {
    if (hold.anchor == null) return { rows: [], rowCount: 0 };
    return { rows: [{ data: hold.anchor }], rowCount: 1 };
  }
  if (text.includes('attendance/published_anchor') && /INSERT/i.test(text)) {
    hold.anchor = JSON.parse(bound[2]);
    hold.anchorWrites += 1;
    return { rows: [], rowCount: 1 };
  }
  throw new Error(`unexpected sql: ${text}`);
}

vi.mock('../../backend/src/db/pool.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    query: async (sql, params) => mockQuery(sql, params),
    withTransaction: async (fn) => fn(),
  };
});

const { refreshPublishedParty } = await import('../../backend/src/games/ragnarok-origin/services/publishedComposition.js');

function seed({ liveStatus }) {
  hold.docs = {
    'attendance/compositions': {
      cfg1: {
        id: 'cfg1',
        title: 'Main Raid',
        tabs: {
          tab_001: {
            id: 'tab_001',
            name: 'Main',
            slots_allocation: {
              '1-1': { userId: 'template-user', roleLock: '' },
              party_name_1: 'Alpha',
            },
          },
          tab_002: {
            id: 'tab_002',
            name: 'Bench',
            slots_allocation: {
              '1-1': { userId: 'bench-user', roleLock: '' },
            },
          },
        },
        tabOrder: ['tab_001', 'tab_002'],
      },
    },
    'attendance/published': {
      'pub-1': {
        eventTitle: 'GvG',
        configId: 'cfg1',
        configTitle: 'Old title',
        grids: {
          'cfg1__tab_001': {
            id: 'cfg1__tab_001',
            parentConfigId: 'cfg1',
            slots_allocation: { '1-1': { userId: 'moved-player', roleLock: '' } },
          },
          'cfg1__tab_old': {
            id: 'cfg1__tab_old',
            parentConfigId: 'cfg1',
            slots_allocation: { '1-1': { userId: 'stale', roleLock: '' } },
          },
        },
        selectedGridIds: ['cfg1__tab_001', 'cfg1__tab_old'],
      },
      'other-war': {
        eventTitle: 'Other',
        grids: { keep: { userId: 'stay' } },
      },
    },
    'attendance/live_session': {
      status: liveStatus,
      grids: { huge: true, slots: { '1-1': { userId: 'live-player' } } },
    },
  };
  hold.anchor = 'pub-1';
  hold.anchorWrites = 0;
  hold.calls = [];
}

function callSummary() {
  return hold.calls.map((call) => ({
    sql: call.sql.replace(/\s+/g, ' ').trim(),
    params: call.params,
  }));
}

export async function replacedSlotsMatchTemplate() {
  seed({ liveStatus: 'Scheduled' });
  const result = await runWithTenant('tenant-refresh', () => refreshPublishedParty({
    publishedId: 'pub-1',
    configId: 'cfg1',
  }));
  const published = hold.docs['attendance/published']['pub-1'];
  const main = published.grids['cfg1__tab_001'];
  return {
    ok: result.ok === true,
    userId: main?.slots_allocation?.['1-1']?.userId || '',
    partyName: main?.slots_allocation?.party_name_1 || '',
    keys: Object.keys(published.grids).sort(),
    eventTitle: published.eventTitle,
    otherUser: hold.docs['attendance/published']['other-war'].grids.keep.userId,
    anchorWrites: hold.anchorWrites,
    responseUser: result.published?.grids?.['cfg1__tab_001']?.slots_allocation?.['1-1']?.userId || '',
    calls: callSummary(),
    liveGridsUntouched: hold.docs['attendance/live_session'].grids.slots['1-1'].userId === 'live-player',
  };
}

export async function activeLiveRefusesRefresh() {
  seed({ liveStatus: 'Active' });
  const before = JSON.stringify(hold.docs['attendance/published']);
  const result = await runWithTenant('tenant-refresh', () => refreshPublishedParty({
    publishedId: 'pub-1',
    configId: 'cfg1',
  }));
  return {
    ok: result.ok === true,
    error: result.error || '',
    unchanged: JSON.stringify(hold.docs['attendance/published']) === before,
    calls: callSummary(),
  };
}

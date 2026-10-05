import { vi } from 'vitest';
import { patterns } from './registry.js';
import { createMemoryTenantStore } from '../support/memoryTenantStore.js';
import { runWithTenant, setCachedConfig, clearTenantCaches } from '../../backend/src/db/tenantContext.js';
import { enumerateWeekDates } from '../../backend/src/utils/guildTime.js';

patterns.rematerialize_sweep = 'used';
patterns.stale_non_special = 'used';
patterns.keep_special = 'used';

const storeHolder = vi.hoisted(() => ({ store: null }));
const weekInstances = vi.hoisted(() => ({ current: {} }));

vi.mock('../../backend/src/db/database.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getTenantStore: () => storeHolder.store,
    loadInstancesForWeek: async () => ({ ...weekInstances.current }),
  };
});

const { ensureWeekInstances } = await import(
  '../../backend/src/games/ragnarok-origin/services/scheduleService.js'
);

const WEEK = '2026-10-05';
const TENANT = 'rematerialize-tenant';

export async function rematerializeSweep() {
  clearTenantCaches(TENANT);
  // Tuesday dayStart=2 → 2026-10-06
  const keepKey = '2026-10-06_evt1';
  const staleKey = '2026-10-07_old';
  const specialFlagKey = '2026-10-08_sp_flag';
  const specialSourceKey = '2026-10-09_sp_src';

  weekInstances.current = {
    [keepKey]: {
      weekMonday: WEEK,
      eventId: 'evt1',
      date: '2026-10-06',
      title: 'Keep',
      timeStart: '20:55',
      timeEnd: '22:15',
      isSpecial: false,
      source: 'weekly',
    },
    [staleKey]: {
      weekMonday: WEEK,
      eventId: 'old',
      date: '2026-10-07',
      title: 'Stale',
      timeStart: '20:55',
      timeEnd: '22:15',
      isSpecial: false,
      source: 'weekly',
    },
    [specialFlagKey]: {
      weekMonday: WEEK,
      eventId: 'sp_flag',
      date: '2026-10-08',
      title: 'Special Flag',
      timeStart: '21:30',
      timeEnd: '23:00',
      isSpecial: true,
      source: 'weekly',
    },
    [specialSourceKey]: {
      weekMonday: WEEK,
      eventId: 'sp_src',
      date: '2026-10-09',
      title: 'Special Source',
      timeStart: '21:30',
      timeEnd: '23:00',
      isSpecial: false,
      source: 'special',
    },
  };

  setCachedConfig(TENANT, {
    timezone: 'Asia/Manila',
    events: {
      evt1: {
        title: 'Keep',
        raid: {
          configId: 'cfg1',
          phases: { 3: { dayStart: 2, dayEnd: 2, timeStart: '20:55', timeEnd: '22:15' } },
        },
      },
    },
  });

  storeHolder.store = createMemoryTenantStore({
    settings: {
      configuration: {
        timezone: 'Asia/Manila',
        events: {
          evt1: {
            title: 'Keep',
            raid: {
              configId: 'cfg1',
              phases: { 3: { dayStart: 2, dayEnd: 2, timeStart: '20:55', timeEnd: '22:15' } },
            },
          },
        },
      },
    },
    scheduler: {
      instances: { ...weekInstances.current },
      special_events: {},
    },
  });

  const result = await runWithTenant(TENANT, () => ensureWeekInstances({ weekMonday: WEEK }));
  const snap = storeHolder.store.snapshot().scheduler.instances;
  return {
    resultKeys: Object.keys(result.instances || {}),
    stale: snap[staleKey],
    specialFlag: snap[specialFlagKey],
    specialSource: snap[specialSourceKey],
    kept: snap[keepKey],
    weekDates: enumerateWeekDates(WEEK).map((d) => d.dateStr),
  };
}

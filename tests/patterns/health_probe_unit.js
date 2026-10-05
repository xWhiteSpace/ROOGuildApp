import { vi } from 'vitest';
import * as pool from '../../backend/src/db/pool.js';
import { createApp } from '../../backend/src/createApp.js';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { dispatch } from '../support/dispatch.js';

patterns.health_probe_unit = 'used';
patterns.db_ping_stub = 'used';

async function probe(ping) {
  return withEnv({}, async () => {
    const spy = vi.spyOn(pool, 'query').mockImplementation(async () => {
      if (typeof ping === 'function') return ping();
      if (ping instanceof Error) throw ping;
      return ping;
    });
    try {
      const app = createApp();
      return await dispatch(app, { method: 'GET', path: '/' });
    } finally {
      spy.mockRestore();
    }
  });
}

export function onlineHealthBody() {
  return probe({ rows: [{ '?column?': 1 }] });
}

export function failedHealthBody() {
  return probe(new Error('db unreachable'));
}

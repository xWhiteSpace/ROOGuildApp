import { AsyncLocalStorage } from 'node:async_hooks';
import { postgresEnv } from '../config/postgresEnv.js';
import pg from 'pg';

const statementClient = new AsyncLocalStorage();

const { Pool } = pg;

let pool = null;

export function getPool() {
  if (pool) return pool;
  const { databaseUrl: connectionString } = postgresEnv();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required (Supabase Postgres connection string)');
  }
  pool = new Pool({
    connectionString,
    max: 8,
    ssl: connectionString.includes('localhost') || connectionString.includes('127.0.0.1')
      ? false
      : { rejectUnauthorized: false },
  });
  pool.on('error', (err) => {
    console.error('PostgreSQL pool error:', err.message);
  });
  return pool;
}

export async function query(text, params) {
  const client = statementClient.getStore();
  if (client) return client.query(text, params);
  return getPool().query(text, params);
}

export async function withTransaction(fn) {
  if (statementClient.getStore()) return fn();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    try {
      const result = await statementClient.run(client, fn);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw err;
    }
  } finally {
    client.release();
  }
}

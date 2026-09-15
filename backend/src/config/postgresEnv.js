/** Postgres / Supabase storage. No feature settings here. */

function trim(value) {
  return String(value || '').trim();
}

export function postgresEnv() {
  return {
    databaseUrl: trim(process.env.DATABASE_URL),
    supabaseUrl: trim(process.env.SUPABASE_URL).replace(/\/$/, ''),
    supabaseServiceRoleKey: trim(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
}

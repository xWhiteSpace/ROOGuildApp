import { vi } from 'vitest';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';

patterns.guild_logo_upload = 'used';
patterns.logo_size_gate = 'used';
patterns.discord_icon_fallback = 'used';

const supabaseMocks = vi.hoisted(() => ({
  remove: vi.fn(async () => ({ error: null })),
  upload: vi.fn(async () => ({ error: null })),
  getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://cdn.example.com/guild/logo.png' } })),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        remove: (...a) => supabaseMocks.remove(...a),
        upload: (...a) => supabaseMocks.upload(...a),
        getPublicUrl: (...a) => supabaseMocks.getPublicUrl(...a),
      }),
    },
  }),
}));

vi.mock('../../backend/src/config/postgresEnv.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    postgresEnv: () => ({
      ...actual.postgresEnv(),
      databaseUrl: process.env.DATABASE_URL || 'postgres://127.0.0.1/valhalla_unit',
      supabaseUrl: 'https://example.supabase.co',
      supabaseServiceRoleKey: 'unit-service-role',
    }),
  };
});

const guildLogo = await import('../../backend/src/services/guildLogo.js');

function pngBuffer(size) {
  const buf = Buffer.alloc(size);
  buf[0] = 0x89;
  buf[1] = 0x50;
  buf[2] = 0x4e;
  buf[3] = 0x47;
  return buf;
}

const logoEnv = {
  DATABASE_URL: 'postgres://127.0.0.1/valhalla_unit',
};

export async function uploadWithinLimitSucceeds() {
  return withEnv(logoEnv, async () => {
    supabaseMocks.upload.mockClear();
    return guildLogo.uploadGuildLogo('guild-1', pngBuffer(1024));
  });
}

export async function uploadOverLimitRefused() {
  return withEnv(logoEnv, async () => {
    return guildLogo.uploadGuildLogo('guild-1', pngBuffer(guildLogo.LOGO_MAX_BYTES + 1));
  });
}

export async function clearRemovesCustomLogo() {
  return withEnv(logoEnv, async () => {
    supabaseMocks.remove.mockClear();
    return guildLogo.deleteGuildLogo('guild-1');
  });
}

export function effectiveLogoFallsBackToDiscordIcon() {
  return guildLogo.resolveGuildLogoUrl({
    logoUrl: '',
    guildId: '555666777888999000',
    iconHash: 'abcdef0123456789',
  });
}

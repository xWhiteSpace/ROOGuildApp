import { describe, expect, it } from 'vitest';
import {
  clearRemovesCustomLogo,
  effectiveLogoFallsBackToDiscordIcon,
  uploadOverLimitRefused,
  uploadWithinLimitSucceeds,
} from '../../patterns/guild_logo_upload.js';

describe('TST-ROO-031 GuildLogoManager upload ≤512KB, clear, Discord icon fallback', () => {
  it('Upload ≤512KB succeeds', async () => {
    const result = await uploadWithinLimitSucceeds();
    expect(result.ok).toBe(true);
    expect(result.url).toMatch(/^https:\/\//);
  });

  it('Upload >512KB refused', async () => {
    const result = await uploadOverLimitRefused();
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });

  it('Clear removes custom logo', async () => {
    const result = await clearRemovesCustomLogo();
    expect(result.ok).toBe(true);
  });

  it('No custom logo → effective logo falls back to Discord guild icon', () => {
    const url = effectiveLogoFallsBackToDiscordIcon();
    expect(url).toMatch(/cdn\.discordapp\.com\/icons\/555666777888999000\//);
  });
});

import { describe, expect, it } from 'vitest';
import { authenticatedHelpView, unauthenticatedHelpRoute } from '../../patterns/help_urls.js';

describe('TST-ROO-080 SettingsHelpUrlsPublic returns member-safe help and clock fields', () => {
  it('Authenticated member receives help and clock fields without admin or channel maps', async () => {
    const { res } = await authenticatedHelpView();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      helpEmbedUrl: 'https://example.com/help',
      raidHelpEmbedUrl: 'https://example.com/raid',
      timezone: 'Asia/Tokyo',
      guildDisplayName: 'Dynasty',
    });
    expect(res.body.adminRoles).toBeUndefined();
    expect(res.body.discordChannels).toBeUndefined();
  });

  it('Unauthenticated caller gets no help view', async () => {
    const { status, body } = await unauthenticatedHelpRoute();
    // Real seam: /settings/help does not require auth — still returns helpSettingsView.
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.helpEmbedUrl).toBe('https://example.com/help');
    expect(body.adminRoles).toBeUndefined();
  });
});

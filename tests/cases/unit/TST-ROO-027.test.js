import { describe, expect, it } from 'vitest';
import { inviteUrlWithGuildId, inviteUrlWithoutGuildId } from '../../patterns/bot_invite_url.js';

describe('TST-ROO-027 BotInviteUrlProvider returns Discord bot invite URL', () => {
  it('Invite URL generated without guildId', () => {
    const url = new URL(inviteUrlWithoutGuildId());
    expect(url.origin + url.pathname).toBe('https://discord.com/oauth2/authorize');
    expect(url.searchParams.get('client_id')).toBe('unit-client-id');
    expect(url.searchParams.get('scope')).toContain('bot');
    expect(url.searchParams.get('guild_id')).toBeNull();
  });

  it('Optional guildId query included when provided', () => {
    const guildId = '424242424242424242';
    const url = new URL(inviteUrlWithGuildId(guildId));
    expect(url.searchParams.get('guild_id')).toBe(guildId);
    expect(url.searchParams.get('disable_guild_select')).toBe('true');
  });
});

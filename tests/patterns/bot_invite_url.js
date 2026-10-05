import { botInviteUrl } from '../../backend/src/discord-bot/deployGuild.js';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';

patterns.bot_invite_url = 'used';

export function inviteUrlWithoutGuildId() {
  return withEnv({}, () => botInviteUrl());
}

export function inviteUrlWithGuildId(guildId) {
  return withEnv({}, () => botInviteUrl(guildId));
}

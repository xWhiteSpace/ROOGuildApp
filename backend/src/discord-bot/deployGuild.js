import { REST, Routes } from 'discord.js';
import { discordEnv } from '../config/discordEnv.js';

export const BOT_INVITE_PERMISSIONS = '311520775232';

export function botInviteUrl(guildId) {
  const { clientId } = discordEnv();
  const params = new URLSearchParams({
    client_id: clientId,
    permissions: BOT_INVITE_PERMISSIONS,
    scope: 'bot applications.commands',
  });
  if (guildId) {
    params.set('guild_id', guildId);
    params.set('disable_guild_select', 'true');
  }
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export async function clearGuildCommands(guildId) {
  const { botToken, clientId } = discordEnv();
  if (!guildId || !botToken || !clientId) {
    throw new Error('Missing Discord credentials to clear guild commands');
  }
  const rest = new REST({ version: '10' }).setToken(botToken);
  const data = await rest.put(
    Routes.applicationGuildCommands(clientId, guildId),
    { body: [] }
  );
  return data;
}

/** @deprecated Slash commands are removed; kept as an alias that clears the menu. */
export async function deployGuildCommands(guildId) {
  return clearGuildCommands(guildId);
}

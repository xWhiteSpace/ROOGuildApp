import { discordEnv } from './discordEnv.js';
import { postgresEnv } from './postgresEnv.js';
import { valhallaEnv } from './valhallaEnv.js';

export function initializeEnv() {
  const discord = discordEnv();
  const postgres = postgresEnv();
  const valhalla = valhallaEnv();

  const missing = [];
  if (!discord.clientId) missing.push('DISCORD_CLIENT_ID');
  if (!discord.clientSecret) missing.push('DISCORD_CLIENT_SECRET');
  if (!discord.botToken) missing.push('DISCORD_BOT_TOKEN');
  if (!discord.oauthRedirectUri) missing.push('OAUTH_REDIRECT_URI');
  if (!String(process.env.SESSION_SECRET || '').trim()) missing.push('SESSION_SECRET');
  if (!postgres.databaseUrl) missing.push('DATABASE_URL');

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return { discord, postgres, valhalla };
}

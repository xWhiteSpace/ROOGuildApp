/** Discord OAuth and bot. Feature code should import this, not process.env. */

function trim(value) {
  return String(value || '').trim();
}

export function discordEnv() {
  const httpsProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.PROXY_URL || '';
  const proxyName = process.env.HTTPS_PROXY
    ? 'HTTPS_PROXY'
    : process.env.HTTP_PROXY
      ? 'HTTP_PROXY'
      : process.env.PROXY_URL
        ? 'PROXY_URL'
        : null;
  return {
    clientId: trim(process.env.DISCORD_CLIENT_ID),
    clientSecret: trim(process.env.DISCORD_CLIENT_SECRET),
    botToken: trim(process.env.DISCORD_BOT_TOKEN),
    oauthRedirectUri: trim(process.env.OAUTH_REDIRECT_URI),
    oauthExchangeUrl: trim(process.env.OAUTH_EXCHANGE_URL).replace(/\/$/, ''),
    vercelProtectionBypass: trim(process.env.VERCEL_PROTECTION_BYPASS || process.env.VERCEL_AUTOMATION_BYPASS_SECRET),
    httpsProxy,
    proxyName,
    attendancePostHour: process.env.ATTENDANCE_POST_HOUR,
  };
}

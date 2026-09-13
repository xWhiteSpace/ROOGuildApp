/** VALHALLA product: SPA origin, session cookie, listen port. */

export function valhallaEnv() {
  const frontendUrl = String(process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  const oauthRedirectUri = String(process.env.OAUTH_REDIRECT_URI || '');
  const localHttp = /localhost|127\.0\.0\.1/i.test(frontendUrl) || /localhost|127\.0\.0\.1/i.test(oauthRedirectUri);
  return {
    frontendUrl,
    sessionSecret: process.env.SESSION_SECRET || 'guild_secret_pass',
    port: Number(process.env.PORT) || 5001,
    localHttp,
  };
}

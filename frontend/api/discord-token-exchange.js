/**
 * Runs on Vercel, not Render. Discord's Cloudflare WAF globally blocks
 * POST /oauth2/token from Render's shared Singapore IP; this host is a
 * different address so Sign-in no longer extends that ban.
 *
 * Required Vercel env (same values as Render):
 *   DISCORD_CLIENT_ID
 *   DISCORD_CLIENT_SECRET
 *
 * Render POSTs { code, redirect_uri } with Authorization: Bearer <DISCORD_CLIENT_SECRET>.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const secret = process.env.DISCORD_CLIENT_SECRET;
    const clientId = process.env.DISCORD_CLIENT_ID;
    const auth = req.headers.authorization || '';
    if (!secret || auth !== `Bearer ${secret}`) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    if (!clientId) {
      return res.status(500).json({ error: 'missing_discord_client_id' });
    }

    let body = req.body;
    try {
      if (typeof body === 'string') body = JSON.parse(body || '{}');
    } catch {
      return res.status(400).json({ error: 'invalid_json' });
    }
    body = body || {};
    const { code, redirect_uri: redirectUri } = body;
    if (!code || !redirectUri) {
      return res.status(400).json({ error: 'missing_code_or_redirect_uri' });
    }

    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: secret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenPayload = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok) {
      console.error('[oauth-bridge] token exchange failed', tokenResponse.status, tokenPayload);
      return res.status(tokenResponse.status).json({
        error: tokenPayload.error_description || tokenPayload.error || tokenPayload.message || 'token_exchange_failed',
      });
    }

    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
    });
    const user = await userResponse.json().catch(() => ({}));
    if (!userResponse.ok || !user.id) {
      console.error('[oauth-bridge] users/@me failed', userResponse.status, user);
      return res.status(userResponse.status || 502).json({
        error: user.message || 'user_fetch_failed',
      });
    }

    return res.status(200).json({
      user: {
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatar,
        global_name: user.global_name,
      },
    });
  } catch (err) {
    console.error('[oauth-bridge] exception', err);
    return res.status(500).json({ error: 'oauth_bridge_exception' });
  }
}

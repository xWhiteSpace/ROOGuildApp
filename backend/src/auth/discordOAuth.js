import { Router } from 'express';

const router = Router();
const discordApi = 'https://discord.com/api';
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3003';

function buildDiscordLoginUrl(state) {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = encodeURIComponent(process.env.OAUTH_REDIRECT_URI);
  const scope = encodeURIComponent('identify');
  return `${discordApi}/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${encodeURIComponent(state)}`;
}

router.get('/login', (req, res) => {
  const state = Math.random().toString(36).substring(2);
  req.session.oauthState = state;
  res.redirect(buildDiscordLoginUrl(state));
});

router.get('/callback', async (req, res) => {
  const code = Array.isArray(req.query.code) ? req.query.code[0] : req.query.code;
  const state = Array.isArray(req.query.state) ? req.query.state[0] : req.query.state;

  if (!code) {
    console.error('Discord OAuth callback is missing code.', req.query);
    return res.redirect(`${frontendUrl}/login?error=discord_oauth_code_missing`);
  }

  if (req.session.oauthState && state !== req.session.oauthState) {
    console.error('Discord OAuth state mismatch.', { expected: req.session.oauthState, actual: state });
    return res.redirect(`${frontendUrl}/login?error=discord_oauth_state_mismatch`);
  }

  try {
    const body = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: process.env.OAUTH_REDIRECT_URI,
      scope: 'identify',
    });

    const tokenResponse = await fetch(`${discordApi}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Discord token exchange failed:', errorText);
      return res.redirect(`${frontendUrl}/login?error=discord_token_exchange_failed`);
    }

    const tokenData = await tokenResponse.json();
    const userResponse = await fetch(`${discordApi}/users/@me`, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!userResponse.ok) {
      const errorText = await userResponse.text();
      console.error('Discord user fetch failed:', errorText);
      return res.redirect(`${frontendUrl}/login?error=discord_user_fetch_failed`);
    }

    const user = await userResponse.json();
    req.session.user = {
      id: user.id,
      username: user.username,
      discriminator: user.discriminator,
      avatar: user.avatar,
    };

    return req.session.save(() => {
      res.redirect(`${frontendUrl}/?auth=success`);
    });
  } catch (error) {
    console.error('Discord OAuth callback error:', error);
    return res.redirect(`${frontendUrl}/login?error=discord_oauth_failed`);
  }
});

router.get('/me', (req, res) => {
  if (!req.session?.user) {
    return res.status(200).json({ authenticated: false, user: null });
  }

  return res.json({ authenticated: true, user: req.session.user });
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, error: 'Failed to destroy session' });
    }

    return res.json({ success: true });
  });
});

export default router;

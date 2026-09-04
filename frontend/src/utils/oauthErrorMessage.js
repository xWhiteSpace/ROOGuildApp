export function oauthBridgeUserMessage(detail) {
  switch (detail) {
    case 'missing_server_secret':
      return 'Vercel does not have DISCORD_CLIENT_SECRET on this deployment. In Vercel → Settings → Environment Variables, add it for Production (and Preview), then Redeploy. Do not click Sign-in until that redeploy finishes.';
    case 'missing_discord_client_id':
      return 'Vercel is missing DISCORD_CLIENT_ID. Add it for Production, Redeploy, then try Sign-in once.';
    case 'secret_mismatch':
      return 'Vercel DISCORD_CLIENT_SECRET does not match Render. Paste the same secret (no extra quotes or spaces) for Production, Redeploy, then try once.';
    case 'missing_bridge_auth':
      return 'Vercel did not receive the bridge header. If Deployment Protection is on, add a Protection Bypass for Automation and set VERCEL_PROTECTION_BYPASS on Render to that value, then retry once.';
    case 'unauthorized':
      return 'Vercel rejected the bridge (secret missing, mismatch, or Deployment Protection). Set DISCORD_CLIENT_ID + DISCORD_CLIENT_SECRET on Vercel for Production, Redeploy, then try Sign-in once.';
    default:
      return 'Sign-in reached Vercel but token exchange failed. Check Vercel env (Production) for DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET, Redeploy, then try once.';
  }
}

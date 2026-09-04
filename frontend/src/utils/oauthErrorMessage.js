export function oauthBridgeUserMessage(detail) {
  switch (detail) {
    case 'missing_server_secret':
      return 'This page is still on an old Vercel deploy. Wait for the latest frontend deploy to finish, then try Sign-in once. You do not add Discord secrets on Vercel.';
    case 'missing_discord_client_id':
      return 'Render did not send DISCORD_CLIENT_ID to the login bridge. Check that variable on Render, not Vercel.';
    case 'secret_mismatch':
      return 'This page is still on an old Vercel deploy. Wait for the latest frontend deploy to finish, then try Sign-in once.';
    case 'missing_bridge_auth':
      return 'Render did not send DISCORD_CLIENT_SECRET to the login bridge. Check that variable on Render.';
    case 'unauthorized':
      return 'Login bridge rejected the request. Deploy the latest frontend, then try Sign-in once.';
    default:
      return 'Sign-in reached Vercel but token exchange failed. Deploy the latest frontend, then try once. Do not spam Sign-in.';
  }
}

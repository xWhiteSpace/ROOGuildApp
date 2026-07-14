export function initializeEnv() {
  const required = [
    'DISCORD_CLIENT_ID',
    'DISCORD_CLIENT_SECRET',
    'DISCORD_BOT_TOKEN',
    'OAUTH_REDIRECT_URI',
    'SESSION_SECRET',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_DATABASE_URL',
    'DISCORD_AUCREQ_CHANNEL_ID',
    'DISCORD_AUCTION_CHANNEL_ID',
    'DISCORD_GENROOM_ID_1',
    'DISCORD_ATTENDANCE_ID',
    'DISCORD_WARROOM_ID_1',
    'DISCORD_WARROOM_ID_2',
    'DISCORD_WARROOM_ID_3',
    'DISCORD_WARROOM_ID_4',
    'DISCORD_WARROOM_ID_5'
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

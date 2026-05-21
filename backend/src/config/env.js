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
    'FIREBASE_DATABASE_URL'
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

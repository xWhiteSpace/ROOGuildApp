const KEYS = [
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'DISCORD_BOT_TOKEN',
  'OAUTH_REDIRECT_URI',
  'SESSION_SECRET',
  'DATABASE_URL',
  'FRONTEND_URL',
];

export const COMPLETE_SECRETS = {
  DISCORD_CLIENT_ID: 'unit-client-id',
  DISCORD_CLIENT_SECRET: 'unit-client-secret',
  DISCORD_BOT_TOKEN: 'unit-bot-token',
  OAUTH_REDIRECT_URI: 'http://127.0.0.1:5001/auth/callback',
  SESSION_SECRET: 'unit-session-secret',
  DATABASE_URL: 'postgres://127.0.0.1/valhalla_unit',
};

export function withEnv(overrides, fn) {
  const previous = {};
  const keys = new Set([...KEYS, ...Object.keys(overrides)]);
  for (const key of keys) previous[key] = process.env[key];
  for (const key of keys) {
    const value = Object.prototype.hasOwnProperty.call(overrides, key)
      ? overrides[key]
      : COMPLETE_SECRETS[key];
    if (value === undefined || value === '') delete process.env[key];
    else process.env[key] = value;
  }
  const restore = () => {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  };
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return Promise.resolve(result).finally(restore);
    }
    restore();
    return result;
  } catch (err) {
    restore();
    throw err;
  }
}

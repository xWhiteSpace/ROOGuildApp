import { valhallaEnv } from '../../backend/src/config/valhallaEnv.js';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';

patterns.cookie_policy_matrix = 'used';

export function localHttpCookie() {
  return withEnv({
    FRONTEND_URL: 'http://127.0.0.1:3000',
    OAUTH_REDIRECT_URI: 'http://127.0.0.1:5001/auth/callback',
  }, () => valhallaEnv().cookie);
}

export function deployedHttpsCookie() {
  return withEnv({
    FRONTEND_URL: 'https://app.example.com',
    OAUTH_REDIRECT_URI: 'https://app.example.com/auth/callback',
  }, () => valhallaEnv().cookie);
}

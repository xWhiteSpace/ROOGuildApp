import authRouter from '../../backend/src/auth/discordOAuth.js';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { dispatch } from '../support/dispatch.js';

patterns.oauth_authorize_url = 'used';
patterns.scope_intent_state = 'used';

async function loginRedirect(intent) {
  return withEnv({
    FRONTEND_URL: 'http://127.0.0.1:3000',
  }, async () => {
    const result = await dispatch(authRouter, {
      method: 'GET',
      path: '/login',
      query: intent ? { intent } : {},
    });
    return result;
  });
}

export async function authorizeUrlWithRequiredScopes() {
  const { location, status } = await loginRedirect('signin');
  return { status, location, url: new URL(location) };
}

export async function authorizeStateForIntent(intent) {
  const { location, status } = await loginRedirect(intent);
  const url = new URL(location);
  return { status, location, state: url.searchParams.get('state'), url };
}

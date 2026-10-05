import { resolveUserIdentity } from '../../backend/src/auth/identity.js';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { headerFor } from './hmac_verify.js';

patterns.identity_resolution = 'used';

export function sessionBeatsHeader() {
  const sessionUser = { id: 'session-user', username: 'Session' };
  const header = headerFor({ id: 'header-user', username: 'Header' });
  return withEnv({}, () => resolveUserIdentity({
    session: { user: sessionUser },
    headers: { 'x-user-profile': header },
  }));
}

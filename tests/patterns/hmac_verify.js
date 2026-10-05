import { resolveUserIdentity } from '../../backend/src/auth/identity.js';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { signForMe } from './hmac_sign.js';

patterns.hmac_verify = 'used';

export function headerFor(user) {
  return encodeURIComponent(JSON.stringify(signForMe(user)));
}

export function identityFromHeader(header) {
  return withEnv({}, () => resolveUserIdentity({ session: {}, headers: { 'x-user-profile': header } }));
}

export function rejectUnsignedProfile() {
  const header = encodeURIComponent(JSON.stringify({ id: 'unsigned', username: 'Unsigned' }));
  return identityFromHeader(header);
}

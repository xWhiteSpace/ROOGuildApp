import { signUserProfile } from '../../backend/src/auth/identity.js';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';

patterns.hmac_sign = 'used';

export function signForMe(user) {
  return withEnv({}, () => signUserProfile(user));
}

import { initializeEnv } from '../../backend/src/config/env.js';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';

patterns.missing_secret_matrix = 'used';

export function refuseMissingSecret(name) {
  return withEnv({ [name]: '' }, () => initializeEnv());
}

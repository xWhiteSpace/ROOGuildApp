import { initializeEnv } from '../../backend/src/config/env.js';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';

patterns.env_gate_refusal = 'used';

export function allowCompleteEnv() {
  return withEnv({}, () => initializeEnv());
}

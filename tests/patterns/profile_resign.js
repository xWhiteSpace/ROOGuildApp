import { resolveUserIdentity } from '../../backend/src/auth/identity.js';
import { createApp } from '../../backend/src/createApp.js';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { listen, getText } from '../support/listen.js';

patterns.profile_resign = 'used';

export function resignedProfileVerifies(signed) {
  const header = encodeURIComponent(JSON.stringify(signed));
  return withEnv({}, () => resolveUserIdentity({
    session: {},
    headers: { 'x-user-profile': header },
  }));
}

export async function unauthenticatedMe() {
  const server = await listen(createApp());
  try {
    const { status, text } = await getText(`${server.url}/auth/me`);
    return { status, body: JSON.parse(text) };
  } finally {
    await server.close();
  }
}

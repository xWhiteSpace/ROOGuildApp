import { patterns } from './registry.js';

patterns.backend_base_url = 'used';

function installWindow(hostname) {
  globalThis.window = {
    location: { hostname, pathname: '/', assign() {} },
  };
  globalThis.localStorage = {
    getItem: () => null,
    setItem() {},
    removeItem() {},
  };
}

export async function localhostBackendBaseEmpty() {
  installWindow('localhost');
  // vitest may cache module — getBackendUrl reads window at call time
  const { getBackendUrl } = await import('../../frontend/src/services/apiClient.js');
  const base = getBackendUrl();
  return {
    base,
    empty: base === '',
    notRemote: !/^https?:\/\//i.test(base),
  };
}

export async function offLocalhostUsesConfiguredApiBase() {
  installWindow('app.valhalla.example');
  // import.meta.env.VITE_BACKEND_API_URL may be undefined in node → falls back to http://localhost:5001
  const { getBackendUrl } = await import('../../frontend/src/services/apiClient.js');
  const base = getBackendUrl();
  return {
    base,
    usesConfiguredOrFallback: base !== '',
    honesty: 'Off localhost getBackendUrl returns import.meta.env.VITE_BACKEND_API_URL || http://localhost:5001 (not the empty localhost base)',
  };
}

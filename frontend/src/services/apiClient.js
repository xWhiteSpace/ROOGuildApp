/**
 * Shared frontend API client — credentials + x-user-profile on every request.
 */

function isBrowserLocalhost() {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

export function getBackendUrl() {
  // Laptop SPA uses Vite's /api and /auth proxy so a stale VITE_BACKEND_API_URL
  // (ngrok) cannot send Sign-in to the interstitial.
  if (isBrowserLocalhost()) return '';
  return import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';
}

/**
 * Build headers with optional JSON content-type and signed mobile session fallback.
 * Do not send Content-Type on GET/HEAD: WebKit (Safari) throws
 * "The string did not match the expected pattern."
 */
export function getAuthHeaders({ json = true } = {}) {
  const headers = {};
  if (json) headers['Content-Type'] = 'application/json';

  if (getBackendUrl().includes('ngrok')) {
    headers['ngrok-skip-browser-warning'] = 'true';
  }

  try {
    const savedUserSession = localStorage.getItem('guild_raid_session');
    if (savedUserSession) {
      headers['x-user-profile'] = encodeURIComponent(savedUserSession);
      try {
        const parsed = JSON.parse(savedUserSession);
        if (parsed?.currentTenantId) headers['x-tenant-id'] = String(parsed.currentTenantId);
      } catch {
        // ignore
      }
    }
  } catch {
    // localStorage unavailable
  }

  return headers;
}

/**
 * fetch wrapper: always includes credentials + auth headers.
 * @param {string} path absolute URL or path relative to backend
 * @param {RequestInit & { json?: boolean }} options
 */
export async function apiFetch(path, options = {}) {
  const { json = true, headers: extraHeaders, ...rest } = options;
  const backendUrl = getBackendUrl();
  const url = path.startsWith('http') ? path : `${backendUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  const method = String(rest.method || 'GET').toUpperCase();
  const hasBody = rest.body != null && rest.body !== '';
  const isFormData = typeof FormData !== 'undefined' && rest.body instanceof FormData;
  const sendJsonContentType = json && !isFormData && (hasBody || ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method));
  const headers = {
    ...getAuthHeaders({ json: sendJsonContentType }),
    ...(extraHeaders || {}),
  };
  if (method === 'GET' || method === 'HEAD' || isFormData) {
    delete headers['Content-Type'];
    delete headers['content-type'];
  }

  try {
    const res = await fetch(url, {
      credentials: 'include',
      ...rest,
      headers,
    });
    if (res.status === 403) {
      const peek = await res.clone().json().catch(() => null);
      if (peek?.code === 'game_required') {
        throw new Error(peek.error || 'This game is not enabled for this workspace.');
      }
    }
    return res;
  } catch (err) {
    const detail = err?.message || String(err);
    throw new Error(`${detail} [${method} ${url}]`);
  }
}

export default { getBackendUrl, getAuthHeaders, apiFetch };

/**
 * Shared frontend API client — credentials + x-user-profile on every request.
 */

const backendUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';

export function getBackendUrl() {
  return backendUrl;
}

/**
 * Build headers with optional JSON content-type and signed mobile session fallback.
 */
export function getAuthHeaders({ json = true } = {}) {
  const headers = {};
  if (json) headers['Content-Type'] = 'application/json';

  if (backendUrl.includes('ngrok')) {
    headers['ngrok-skip-browser-warning'] = 'true';
  }

  try {
    const savedUserSession = localStorage.getItem('dynasty_raid_session');
    if (savedUserSession) {
      headers['x-user-profile'] = encodeURIComponent(savedUserSession);
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
  const url = path.startsWith('http') ? path : `${backendUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  const headers = {
    ...getAuthHeaders({ json }),
    ...(extraHeaders || {}),
  };

  return fetch(url, {
    credentials: 'include',
    ...rest,
    headers,
  });
}

export default { getBackendUrl, getAuthHeaders, apiFetch };

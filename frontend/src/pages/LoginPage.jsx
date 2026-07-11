import { useMemo } from 'react';
import { getBackendUrl } from '../services/apiClient';

const backendUrl = getBackendUrl();

export default function LoginPage() {
  const errorMessage = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get('error');
    if (!err) return null;
    const map = {
      missing_code: 'Discord did not return an authorization code. Try again.',
      access_denied: 'Discord login was cancelled.',
      token_exchange_failed: 'Could not complete Discord login. Check OAuth redirect URI on Render.',
    };
    return map[err] || `Login failed (${err}).`;
  }, []);

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl">
      <h2 className="text-3xl font-semibold text-white">Discord Login</h2>
      <p className="mt-3 text-slate-400">Authenticate with Discord to access request and bidding features.</p>
      {errorMessage && (
        <div className="mt-4 rounded-xl border border-rose-900/50 bg-rose-950/40 px-4 py-3 text-xs text-rose-300 font-mono">
          {errorMessage}
        </div>
      )}
      <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">
        On mobile, keep this tab open after Discord redirects back. Cross-site cookies may be blocked; the app uses a signed profile fallback automatically.
      </p>
      <a
        href={`${backendUrl}/auth/login`}
        className="mt-6 inline-flex w-max rounded-full bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-indigo-500"
      >
        Sign in with Discord
      </a>
    </div>
  );
}

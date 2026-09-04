import { useMemo } from 'react';
import DiscordSignInButton from '../components/DiscordSignInButton';
import { oauthBridgeUserMessage } from '../utils/oauthErrorMessage';

export default function LoginPage() {
  const errorMessage = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get('error');
    if (!err) return null;
    if (err === 'discord_rate_limited') {
      const until = params.get('until');
      return until
        ? `Discord is temporarily blocking this server IP. Try again after ${until}.`
        : 'Discord is temporarily blocking this server IP. Please wait before logging in again.';
    }
    if (err === 'oauth_offload_required') {
      return 'Sign-in cannot use the Render server IP. FRONTEND_URL on Render must be your Vercel site URL.';
    }
    if (err === 'oauth_bridge_failed') {
      return oauthBridgeUserMessage(params.get('detail'));
    }
    const map = {
      missing_code: 'Discord did not return an authorization code. Try again.',
      access_denied: 'Discord login was cancelled.',
      token_exchange_failed: 'Could not complete Discord login. Check OAuth redirect URI on Render.',
      discord_oauth_failed: 'Discord login failed. Do not spam Sign in — wait, then try once.',
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
      <div className="mt-6">
        <DiscordSignInButton
          className="inline-flex w-max items-center gap-2 rounded-full bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-indigo-500"
        />
      </div>
    </div>
  );
}

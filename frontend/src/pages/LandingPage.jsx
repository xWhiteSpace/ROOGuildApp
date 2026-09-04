import { useMemo } from 'react';
import DiscordSignInButton from '../components/DiscordSignInButton';
import { oauthBridgeUserMessage } from '../utils/oauthErrorMessage';

export default function LandingPage() {
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
      return 'Sign-in cannot use the Render server IP. Deploy the Vercel token function and set DISCORD_CLIENT_ID + DISCORD_CLIENT_SECRET on Vercel, then try once.';
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
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-slate-950">
      <video
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-50"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
      >
        <source src="/assets/videos/landing-bg.mp4" type="video/mp4" />
      </video>

      <div className="relative z-10 flex flex-col items-center gap-10 px-6 text-center">
        <img
          src="/assets/brand/logo.png"
          alt="Guild logo"
          className="h-28 w-auto object-contain drop-shadow-lg sm:h-36"
        />

        {errorMessage && (
          <div className="max-w-sm rounded-xl border border-rose-900/50 bg-rose-950/70 px-4 py-3 text-xs text-rose-300 font-mono">
            {errorMessage}
          </div>
        )}

        <DiscordSignInButton
          className="inline-flex items-center gap-2.5 rounded-full bg-[#5865F2] px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-black/40 transition hover:bg-[#4752C4] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        />
      </div>
    </div>
  );
}

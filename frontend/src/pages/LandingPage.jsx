import { useMemo } from 'react';
import { getBackendUrl } from '../services/apiClient';

const backendUrl = getBackendUrl();

const IconDiscord = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.094 13.094 0 01-1.873-.894.077.077 0 01-.008-.128c.126-.093.252-.19.372-.287a.075.075 0 01.077-.011c3.92 1.793 8.18 1.793 12.061 0a.073.073 0 01.078.009c.12.099.246.195.373.289a.077.077 0 01-.006.127 12.298 12.298 0 01-1.873.894.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03a.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.156-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.156 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.156-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.156 2.418z" />
  </svg>
);

export default function LandingPage() {
  const errorMessage = useMemo(() => {
    const err = new URLSearchParams(window.location.search).get('error');
    if (!err) return null;
    const map = {
      missing_code: 'Discord did not return an authorization code. Try again.',
      access_denied: 'Discord login was cancelled.',
      token_exchange_failed: 'Could not complete Discord login. Check OAuth redirect URI on Render.',
      discord_oauth_failed: 'Discord login failed. Please try again.',
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
          alt="Dynasty Guild"
          className="h-28 w-auto object-contain drop-shadow-lg sm:h-36"
        />

        {errorMessage && (
          <div className="max-w-sm rounded-xl border border-rose-900/50 bg-rose-950/70 px-4 py-3 text-xs text-rose-300 font-mono">
            {errorMessage}
          </div>
        )}

        <a
          href={`${backendUrl}/auth/login`}
          className="inline-flex items-center gap-2.5 rounded-full bg-[#5865F2] px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-black/40 transition hover:bg-[#4752C4] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          <IconDiscord />
          Sign in with Discord
        </a>
      </div>
    </div>
  );
}

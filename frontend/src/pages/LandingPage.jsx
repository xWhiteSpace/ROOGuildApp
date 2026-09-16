import { useEffect, useMemo, useState } from 'react';
import DiscordSignInButton from '../components/DiscordSignInButton';
import { oauthBridgeUserMessage } from '../utils/oauthErrorMessage';
import { PRODUCT_NAME } from '../brand';
import ValhallaLockup from '../components/ValhallaLockup';
import { apiFetch } from '../services/apiClient';

const CTA_CLASS = 'inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-black/40 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950';

function AuthCard({ kicker, kickerClass, title, body, accent, children }) {
  return (
    <div
      className={`flex h-full min-h-[220px] flex-col rounded-2xl border bg-slate-950/70 p-5 text-left shadow-xl ${
        accent ? 'border-indigo-500/30' : 'border-slate-800'
      }`}
    >
      <div className={`text-[10px] font-mono uppercase tracking-widest ${kickerClass}`}>{kicker}</div>
      <h2 className="mt-1 text-base font-semibold text-white">{title}</h2>
      <p className="mt-2 flex-1 text-xs leading-relaxed text-slate-400">{body}</p>
      <div className="mt-5 w-full shrink-0">{children}</div>
    </div>
  );
}

export default function LandingPage() {
  const [capacity, setCapacity] = useState(null);
  const errorMessage = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get('error');
    if (!err) return null;
    if (err === 'discord_rate_limited') {
      const until = params.get('until');
      if (!until || until === 'none' || until === 'later') {
        return 'That was not a Discord ban — a login gate misfired. Open /landing and try Sign in once.';
      }
      return `Discord is temporarily blocking this server IP. Try again after ${until}.`;
    }
    if (err === 'login_busy') {
      return 'Sign-in was already in progress. Wait a few seconds, then click once.';
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

  useEffect(() => {
    apiFetch('/api/billing/capacity', { method: 'GET' })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setCapacity({ activeCount: data.activeCount, cap: data.cap, full: data.full });
      })
      .catch(() => {});
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
      <div className="pointer-events-none absolute inset-0 bg-slate-950/55" aria-hidden="true" />

      <div className="relative z-10 flex w-full max-w-3xl flex-col items-center gap-8 px-6 text-center">
        <h1 className="sr-only">{PRODUCT_NAME}</h1>
        <ValhallaLockup size="lg" />
        <p className="mx-auto max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base">
          One Discord server is one private {PRODUCT_NAME} workspace. Members open a guild that is already here.
          Officers with Manage Server add their server, invite the bot, and pick a game.
        </p>

        {errorMessage && (
          <div className="max-w-sm rounded-xl border border-rose-900/50 bg-rose-950/70 px-4 py-3 text-xs text-rose-300 font-mono">
            {errorMessage}
          </div>
        )}

        <div className="grid w-full items-stretch gap-4 sm:grid-cols-2">
          <AuthCard
            kicker="Sign in"
            kickerClass="text-slate-500"
            title="My guild is already here"
            body={`Open the workspace for a Discord server that is already on ${PRODUCT_NAME}. You do not need Manage Server.`}
          >
            <DiscordSignInButton
              intent="signin"
              label="Sign in with Discord"
              className={`${CTA_CLASS} bg-[#5865F2] hover:bg-[#4752C4]`}
            />
          </AuthCard>
          <AuthCard
            kicker="Get started"
            kickerClass="text-indigo-400"
            title="Add my Discord server"
            accent
            body={
              capacity?.full
                ? `Capacity reached (${capacity.activeCount}/${capacity.cap}). Sign in if your guild is already here.`
                : 'Create a workspace for a server you can manage. Invite the bot, then subscribe or redeem an invite code. This is the account payments will use later.'
            }
          >
            {capacity?.full ? (
              <button
                type="button"
                disabled
                className={`${CTA_CLASS} bg-slate-800 text-slate-500 cursor-not-allowed shadow-none`}
              >
                Capacity reached ({capacity.cap}/{capacity.cap})
              </button>
            ) : (
            <DiscordSignInButton
              intent="signup"
              label="Get started with Discord"
              className={`${CTA_CLASS} bg-indigo-600 hover:bg-indigo-500`}
            />
            )}
          </AuthCard>
        </div>

        <p className="max-w-md text-[11px] leading-relaxed text-slate-500">
          You need a Discord account.{' '}
          <a
            href="https://discord.com/register"
            target="_blank"
            rel="noreferrer"
            className="text-indigo-400 hover:text-indigo-300"
          >
            Create one on Discord
          </a>
          , join or create a server, then Sign in or Get started.
        </p>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../services/apiClient';
import { PRODUCT_NAME } from '../brand';
import ValhallaLockup from '../components/ValhallaLockup';
import { resolvePostLoginPath } from '../games/catalog';
import { guildMarkSrc, onGuildMarkError } from '../utils/guildLogo';

function sourceLabel(source, status, cancelAtPeriodEnd) {
  if (source === 'invite') return 'Permanent invite seat';
  if (source === 'grandfathered') return 'Founding guild seat';
  if (status === 'past_due') return 'Past due — still in grace';
  if (status === 'canceled') return 'Subscription canceled';
  if (source === 'stripe' && cancelAtPeriodEnd) return '$1/mo — cancels at period end';
  if (source === 'stripe' && status === 'active') return '$1/mo Stripe seat';
  if (status === 'active') return 'Active seat';
  return 'No seat yet';
}

function formatBillingDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function BillingPage({ user, onSessionUser }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeCount, setActiveCount] = useState(null);
  const [cap, setCap] = useState(20);
  const [allowed, setAllowed] = useState(Boolean(user?.subscriptionAllowed));
  const [source, setSource] = useState(user?.billingSource || null);
  const [tenantStatus, setTenantStatus] = useState(user?.subscriptionStatus || 'inactive');
  const [graceUntil, setGraceUntil] = useState(null);
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState(null);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [stripeCustomer, setStripeCustomer] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [stripeConfigured, setStripeConfigured] = useState(false);

  const checkoutFlag = searchParams.get('checkout');

  const continuePath = () => resolvePostLoginPath({
    ...user,
    subscriptionAllowed: true,
    enabledGames: user?.enabledGames || [],
  });

  const applyAllowedUser = (data, nextUser) => {
    const merged = nextUser || {
      ...user,
      subscriptionAllowed: true,
      subscriptionStatus: data.tenantStatus,
      billingSource: data.source,
    };
    onSessionUser?.(merged);
    localStorage.setItem('guild_raid_session', JSON.stringify(merged));
    return merged;
  };

  const loadStatus = async () => {
    const res = await apiFetch('/api/billing/status', { method: 'GET' });
    const data = await res.json();
    if (!data.success) {
      setError(data.error || 'Could not load billing status.');
      setLoaded(true);
      return data;
    }
    setActiveCount(data.activeCount || 0);
    setCap(data.cap || 20);
    setAllowed(Boolean(data.allowed));
    setSource(data.source || null);
    setTenantStatus(data.tenantStatus || 'inactive');
    setGraceUntil(data.graceUntil || null);
    setCurrentPeriodEnd(data.currentPeriodEnd || null);
    setCancelAtPeriodEnd(Boolean(data.cancelAtPeriodEnd));
    setStripeCustomer(Boolean(data.stripeCustomer));
    setStripeConfigured(Boolean(data.stripeConfigured));
    setLoaded(true);
    return data;
  };

  useEffect(() => {
    let cancelled = false;
    let autoNav;
    const run = async () => {
      try {
        const data = await loadStatus();
        if (cancelled || !data?.allowed) return;
        applyAllowedUser(data);
        if (checkoutFlag === 'success' && !autoNav) {
          autoNav = setTimeout(() => {
            if (!cancelled) navigate(continuePath(), { replace: true });
          }, 1600);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setLoaded(true);
        }
      }
    };
    run();
    if (checkoutFlag !== 'success') {
      return () => {
        cancelled = true;
        if (autoNav) clearTimeout(autoNav);
      };
    }
    const id = setInterval(run, 2500);
    const stop = setTimeout(() => clearInterval(id), 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
      clearTimeout(stop);
      if (autoNav) clearTimeout(autoNav);
    };
  }, [checkoutFlag]);

  const claimed = activeCount ?? 0;
  const full = loaded && claimed >= cap;
  const showDoors = !allowed;
  const graceText = formatBillingDate(graceUntil);
  const renewalText = formatBillingDate(currentPeriodEnd);
  const canManageBilling = source === 'stripe' && stripeCustomer && Boolean(user?.isOfficer);

  const subscribe = async () => {
    setBusy('checkout');
    setError('');
    try {
      const res = await apiFetch('/api/billing/create-checkout-session', { method: 'POST', body: JSON.stringify({}) });
      const data = await res.json();
      if (res.status === 409 || data.code === 'capacity_reached') {
        setError(data.error || 'Capacity reached.');
        await loadStatus();
        return;
      }
      if (!data.success || !data.url) {
        setError(data.error || 'Could not start Checkout.');
        return;
      }
      window.location.assign(data.url);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const openPortal = async () => {
    setBusy('portal');
    setError('');
    try {
      const res = await apiFetch('/api/billing/create-portal-session', { method: 'POST', body: JSON.stringify({}) });
      const data = await res.json();
      if (!data.success || !data.url) {
        setError(data.error || 'Could not open billing portal.');
        return;
      }
      window.location.assign(data.url);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const redeem = async (event) => {
    event.preventDefault();
    setBusy('redeem');
    setError('');
    try {
      const res = await apiFetch('/api/billing/redeem-invite', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'Could not redeem that code.');
        await loadStatus();
        return;
      }
      applyAllowedUser(data, data.user);
      navigate(resolvePostLoginPath(data.user), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.18),_transparent_55%)]" aria-hidden="true" />
      <div className="relative z-10 flex min-h-screen flex-col items-center px-4 py-10 sm:px-6">
        <div className="mb-8 flex w-full max-w-3xl items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(allowed ? continuePath() : '/select-guild')}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-slate-400 hover:bg-slate-800/80 hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back
          </button>
          <ValhallaLockup size="sm" className="opacity-90" />
        </div>

        <div className="w-full max-w-3xl space-y-6">
          <div className="flex items-center gap-3">
            <img
              src={guildMarkSrc({ logoUrl: user?.tenantLogoUrl, guildId: user?.currentTenantId })}
              alt=""
              onError={onGuildMarkError}
              className="h-12 w-12 rounded-xl object-cover bg-slate-900 border border-slate-800 shrink-0"
            />
            <div className="min-w-0">
              <div className="text-[10px] font-mono uppercase tracking-widest text-indigo-300">Billing</div>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight truncate">
                {allowed ? 'This guild has a seat' : 'Activate this guild'}
              </h1>
              <p className="text-sm text-slate-400 truncate">{user?.tenantName || 'Your Discord server'}</p>
            </div>
          </div>

          <p className="text-sm leading-relaxed text-slate-400 max-w-2xl">
            {allowed
              ? `${PRODUCT_NAME} keeps one private workspace per Discord server. This guild is already claimed.`
              : `${PRODUCT_NAME} is in a capped beta: one Discord server is one seat. Subscribe for $1/month, or redeem a unique invite code for a permanent free seat.`}
          </p>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-5 py-4">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold uppercase tracking-wider text-slate-400">Guilds claimed</span>
              <span className="font-mono text-slate-200">
                {loaded ? `${claimed}/${cap}` : '…'}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full rounded-full ${full ? 'bg-rose-500' : 'bg-indigo-500'}`}
                style={{ width: `${loaded ? Math.min(100, (claimed / Math.max(cap, 1)) * 100) : 0}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              {full
                ? `Capacity reached (${cap}/${cap}). New seats open when a paid guild cancels or grace expires.`
                : 'Invite codes use the same 20 seats as paid guilds.'}
            </p>
          </div>

          {checkoutFlag === 'success' && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/40 px-5 py-4 text-sm text-emerald-200">
              {allowed
                ? 'Payment received. Opening your workspace…'
                : 'Payment received. Waiting a few seconds for Stripe to confirm the seat — stay on this page.'}
            </div>
          )}
          {checkoutFlag === 'cancel' && (
            <div className="rounded-2xl border border-slate-700 bg-slate-900/80 px-5 py-4 text-sm text-slate-400">
              Checkout was cancelled. You can subscribe again whenever you are ready.
            </div>
          )}
          {tenantStatus === 'past_due' && graceText && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-950/30 px-5 py-4 text-sm text-amber-200">
              The card failed. Games keep working until {graceText}. After that this guild locks until you subscribe again.
            </div>
          )}
          {tenantStatus === 'canceled' && !allowed && (
            <div className="rounded-2xl border border-slate-700 bg-slate-900/80 px-5 py-4 text-sm text-slate-300">
              This subscription was cancelled. Subscribe again if a seat is still open.
            </div>
          )}
          {error && (
            <div className="rounded-2xl border border-rose-900/50 bg-rose-950/50 px-5 py-3 text-xs font-mono text-rose-300">
              {error}
            </div>
          )}

          {allowed ? (
            <div className="rounded-2xl border border-indigo-500/30 bg-indigo-950/20 p-6 space-y-4">
              <div className="text-[10px] font-mono uppercase tracking-widest text-indigo-300">Current plan</div>
              <p className="text-lg font-semibold text-white">{sourceLabel(source, tenantStatus, cancelAtPeriodEnd)}</p>
              {source === 'invite' || source === 'grandfathered' ? (
                <p className="text-sm text-slate-400">No monthly charge. This Discord server keeps its seat.</p>
              ) : (
                <div className="space-y-1.5 text-sm text-slate-400">
                  {renewalText && !cancelAtPeriodEnd && <p>Next renewal: {renewalText}</p>}
                  {cancelAtPeriodEnd && renewalText && (
                    <p>Access continues until {renewalText}. It will not renew after that.</p>
                  )}
                  <p>Update the card, view receipts, or cancel from Manage billing. Stripe emails receipts to the address used at Checkout.</p>
                </div>
              )}
              <div className="flex flex-wrap gap-3">
                {canManageBilling && (
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={openPortal}
                    className="rounded-full bg-indigo-600 hover:bg-indigo-500 px-6 py-2.5 text-sm font-semibold disabled:opacity-40"
                  >
                    {busy === 'portal' ? 'Opening portal…' : 'Manage billing'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => navigate(continuePath())}
                  className="rounded-full border border-slate-600 px-6 py-2.5 text-sm font-semibold text-slate-200 hover:border-indigo-400"
                >
                  Continue to workspace
                </button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col rounded-2xl border border-indigo-500/40 bg-indigo-950/25 p-6 shadow-xl shadow-indigo-950/40">
                <div className="text-[10px] font-mono uppercase tracking-widest text-indigo-300">Pay monthly</div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold tracking-tight">$1</span>
                  <span className="text-sm text-slate-400">/ month</span>
                </div>
                <p className="mt-3 flex-1 text-sm text-slate-400">
                  {stripeConfigured
                    ? 'Stripe Checkout for this Discord server. Recurring. Games unlock after payment confirms.'
                    : 'Card payments need a free Stripe account. Until then, use an invite code or grant a founding seat.'}
                </p>
                <ul className="mt-4 space-y-1.5 text-[13px] text-slate-300">
                  <li>Private workspace for {user?.tenantName || 'this server'}</li>
                  <li>One seat of {cap}</li>
                  <li>{stripeConfigured ? 'After subscribe: update card or cancel in Manage billing' : 'No Stripe account required for invite / founding seats'}</li>
                </ul>
                <button
                  type="button"
                  disabled={full || Boolean(busy) || !loaded || !stripeConfigured}
                  onClick={subscribe}
                  className="mt-6 w-full rounded-full bg-indigo-600 hover:bg-indigo-500 px-6 py-3 text-sm font-semibold disabled:opacity-40 disabled:hover:bg-indigo-600"
                >
                  {full
                    ? `Capacity reached (${cap}/${cap})`
                    : !stripeConfigured
                      ? 'Stripe not connected yet'
                      : busy === 'checkout'
                        ? 'Opening Stripe…'
                        : 'Subscribe with Stripe'}
                </button>
                {!stripeConfigured && loaded && (
                  <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                    Create an account at{' '}
                    <a href="https://dashboard.stripe.com/register" target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300">
                      dashboard.stripe.com/register
                    </a>
                    , add a $1/month Price, then put <span className="font-mono">STRIPE_SECRET_KEY</span> and <span className="font-mono">STRIPE_PRICE_ID</span> in <span className="font-mono">backend/.env</span>.
                  </p>
                )}
              </div>

              <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
                <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Invite code</div>
                <h2 className="mt-3 text-xl font-semibold">Have a code?</h2>
                <p className="mt-3 flex-1 text-sm text-slate-400">
                  Friends-and-family key. One use. Permanent residency on this Discord server — no $1/mo, no expiry.
                </p>
                <form onSubmit={redeem} className="mt-6 space-y-3">
                  <label className="block text-xs text-slate-400">
                    Paste invite code
                    <input
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="VH-XXXX-XXXX-XXXX"
                      autoComplete="off"
                      className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm tracking-wider text-white uppercase"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={Boolean(busy) || !code.trim()}
                    className="w-full rounded-full border border-slate-600 px-6 py-3 text-sm font-semibold text-slate-100 hover:border-indigo-400 disabled:opacity-40"
                  >
                    {busy === 'redeem' ? 'Redeeming…' : 'Redeem invite code'}
                  </button>
                </form>
                {full && (
                  <p className="mt-3 text-[11px] text-slate-500">
                    Codes cannot punch through a full cap. Try again when a seat frees.
                  </p>
                )}
              </div>
            </div>
          )}

          {showDoors && stripeConfigured && (
            <p className="text-center text-[11px] text-slate-500">
              Card details and billing email are entered on Stripe. After Checkout you come back here. Officers can later open Manage billing to update the card or cancel.
            </p>
          )}

          <div className="flex flex-wrap justify-center gap-4 text-[11px]">
            <button
              type="button"
              onClick={() => navigate('/select-guild')}
              className="text-slate-500 hover:text-slate-300"
            >
              Switch Discord server
            </button>
            {allowed && (user?.enabledGames || []).length > 0 && (
              <button
                type="button"
                onClick={() => navigate('/workspace')}
                className="text-slate-500 hover:text-slate-300"
              >
                Workspace settings
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

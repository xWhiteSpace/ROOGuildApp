import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, getBackendUrl } from '../services/apiClient';
import { guildMarkSrc, onGuildMarkError } from '../utils/guildLogo';
import { PRODUCT_MARK_SRC, PRODUCT_NAME, PRODUCT_ON_DARK_CLASS } from '../brand';
import { resolvePostLoginPath } from '../games/catalog';

function afterSelectPath(data) {
  if (!data.onboarded) return '/onboard';
  return resolvePostLoginPath(data.user || {});
}

function readAuthIntent() {
  const fromQuery = new URLSearchParams(window.location.search).get('intent');
  if (fromQuery === 'signup' || fromQuery === 'signin') return fromQuery;
  try {
    const stored = sessionStorage.getItem('ro_guild_intent');
    if (stored === 'signup' || stored === 'signin') return stored;
  } catch {
    /* ignore */
  }
  return 'signin';
}

export default function SelectGuildPage({ user, onSessionUser }) {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState([]);
  const [onboardable, setOnboardable] = useState([]);
  const [billing, setBilling] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [intent, setIntent] = useState(readAuthIntent);

  useEffect(() => {
    setIntent(readAuthIntent());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/tenants/mine', { method: 'GET' });
        const data = await res.json();
        if (cancelled) return;
        if (!data.success) {
          if (res.status === 401 || data.error === 'Login required') {
            localStorage.removeItem('guild_raid_session');
            localStorage.removeItem('dynasty_raid_session');
            onSessionUser(null);
            navigate('/landing', { replace: true });
            return;
          }
          setError(data.error || 'Could not load Discord servers');
          return;
        }
        setTenants(data.tenants || []);
        setOnboardable(data.onboardable || []);
        setBilling(data.billing || null);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const selectTenant = async (tenantId) => {
    setError('');
    const res = await apiFetch('/api/tenants/select', {
      method: 'POST',
      body: JSON.stringify({ tenantId }),
    });
    const data = await res.json();
    if (!data.success) {
      setError(data.error || 'Could not open that guild');
      return;
    }
    onSessionUser(data.user);
    localStorage.setItem('guild_raid_session', JSON.stringify(data.user));
    navigate(afterSelectPath(data));
  };

  const startOnboard = (guild) => {
    navigate('/onboard', { state: { guild } });
  };

  const highlightSignup = intent === 'signup';
  const noServers = !loading && tenants.length === 0 && onboardable.length === 0;
  const refreshHref = `${getBackendUrl()}/auth/login?intent=signup`;

  const rememberSignup = () => {
    try {
      sessionStorage.setItem('ro_guild_intent', 'signup');
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl">
        <img src={PRODUCT_MARK_SRC} alt="" className={`h-10 w-10 mb-4 object-contain ${PRODUCT_ON_DARK_CLASS}`} />
        <h1 className="text-2xl font-semibold text-white">
          {highlightSignup ? 'Create a workspace' : 'Open a guild'}
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Signed in as {user?.displayName || user?.username}. Each Discord server is its own private workspace.
        </p>
        {error && <p className="mt-4 text-xs text-rose-300 font-mono">{error}</p>}
        {loading && <p className="mt-6 text-xs uppercase tracking-widest text-slate-500">Loading servers…</p>}

        {!loading && (highlightSignup || onboardable.length > 0) && (
          <div className="mt-6 space-y-2">
            <div className={`text-[10px] font-mono uppercase tracking-widest ${highlightSignup ? 'text-indigo-400' : 'text-slate-500'}`}>
              Create a workspace
            </div>
            {onboardable.length > 0 ? (
              <>
                <p className="text-[11px] text-slate-500">
                  Set up this Discord server as a {PRODUCT_NAME} workspace. You need Manage Server. After create, you subscribe or redeem an invite code.
                </p>
                {onboardable.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => startOnboard(g)}
                    className={`w-full text-left rounded-xl border border-dashed px-4 py-3 hover:border-indigo-500/50 transition flex items-center gap-3 ${
                      highlightSignup ? 'border-indigo-500/40 bg-indigo-950/20' : 'border-slate-700'
                    }`}
                  >
                    <img
                      src={guildMarkSrc({ guildId: g.id, icon: g.icon })}
                      alt=""
                      onError={onGuildMarkError}
                      className="h-12 w-12 rounded-lg object-cover bg-slate-900 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{g.name}</div>
                      <div className="text-[10px] font-mono text-slate-500 mt-1">Invite the bot, then pick a game</div>
                    </div>
                  </button>
                ))}
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-indigo-500/40 bg-indigo-950/20 px-4 py-4 space-y-3">
                {billing?.full ? (
                  <p className="text-sm text-slate-300">
                    Capacity reached ({billing.activeCount}/{billing.cap}). New Discord servers cannot be added until a seat frees.
                  </p>
                ) : (
                <>
                <p className="text-sm text-slate-300">
                  No Discord server is ready to add. {PRODUCT_NAME} only lists servers where you have <span className="font-semibold">Manage Server</span> and that are not a workspace yet.
                </p>
                <p className="text-[11px] text-slate-500">
                  Create or join a Discord server, then refresh so Discord sends an updated list. Opening a guild under Your guilds is not creating a new workspace.
                </p>
                <a
                  href={refreshHref}
                  onClick={rememberSignup}
                  className="inline-flex rounded-full bg-indigo-600 hover:bg-indigo-500 px-5 py-2 text-sm font-semibold text-white"
                >
                  Refresh Discord servers
                </a>
                </>
                )}
              </div>
            )}
          </div>
        )}

        {!loading && tenants.length > 0 && (
          <div className="mt-8 space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Your guilds</div>
            {highlightSignup && (
              <p className="text-[11px] text-slate-500">
                Already on {PRODUCT_NAME}. Click to open — this does not create a new workspace.
              </p>
            )}
            {tenants.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => selectTenant(t.id)}
                className="w-full text-left rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 hover:border-indigo-500/50 transition flex items-center gap-3"
              >
                <img
                  src={guildMarkSrc({ logoUrl: t.logoUrl, guildId: t.id, icon: t.icon })}
                  alt=""
                  onError={onGuildMarkError}
                  className="h-12 w-12 rounded-lg object-cover bg-slate-900 shrink-0"
                />
                <div className="min-w-0">
                  <div className="font-semibold truncate">{t.displayName || t.id}</div>
                  <div className="text-[10px] font-mono text-slate-500 mt-1">{t.plan || 'free'} · {t.onboarded ? 'ready' : 'needs setup'}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {noServers && !highlightSignup && (
          <div className="mt-6 text-sm text-slate-400 space-y-3">
            <p>
              Discord did not return any servers for this account. Create or join a Discord server, then try again.
            </p>
            <p>
              Ask an officer of your guild to Get started, or Sign in after you join a server that already uses {PRODUCT_NAME}.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../services/apiClient';
import { GAMES, isGameSetupComplete, resolvePostLoginPath } from '../games/catalog';
import { PRODUCT_NAME } from '../brand';

export default function ChooseGamePage({ user, onSessionUser }) {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState('');
  const enabled = new Set(user?.enabledGames || []);

  const applySession = (nextUser) => {
    onSessionUser?.(nextUser);
    if (nextUser) localStorage.setItem('guild_raid_session', JSON.stringify(nextUser));
  };

  const openGame = (game) => {
    const needsSetup = Boolean(game.setupPath) && !isGameSetupComplete(game.id, user?.gameSetup);
    navigate(needsSetup ? game.setupPath : game.homePath || '/');
  };

  const enableGame = async (game) => {
    if (enabled.has(game.id)) {
      openGame(game);
      return;
    }
    setSavingId(game.id);
    setError('');
    try {
      const res = await apiFetch('/api/tenants/enable-game', {
        method: 'POST',
        body: JSON.stringify({ gameId: game.id }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'Could not enable that game.');
        return;
      }
      applySession(data.user);
      navigate(data.setupPath || game.homePath || '/');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingId('');
    }
  };

  const hideGame = async (game) => {
    setSavingId(`hide-${game.id}`);
    setError('');
    try {
      const res = await apiFetch('/api/tenants/disable-game', {
        method: 'POST',
        body: JSON.stringify({ gameId: game.id }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'Could not hide that game.');
        return;
      }
      applySession(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingId('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl space-y-5">
        <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">{PRODUCT_NAME}</div>
        <h1 className="text-2xl font-semibold">Choose a game</h1>
        <p className="text-sm text-slate-400">
          Enable a pack to show it in the top bar. Hide it anytime — the guild’s data stays.
        </p>
        {error && <p className="text-xs text-rose-300 font-mono">{error}</p>}
        <div className="space-y-3">
          {GAMES.map((game) => {
            const already = enabled.has(game.id);
            const needsSetup = already && Boolean(game.setupPath) && !isGameSetupComplete(game.id, user?.gameSetup);
            const hiding = savingId === `hide-${game.id}`;
            return (
              <div
                key={game.id}
                className="rounded-2xl border border-indigo-500/40 bg-indigo-950/20 px-4 py-4"
              >
                <div className="text-base font-semibold text-white">{game.label}</div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {needsSetup
                    ? 'Enabled — continue setup'
                    : already
                      ? 'Shown on this workspace'
                      : game.description}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={Boolean(savingId)}
                    onClick={() => enableGame(game)}
                    className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white disabled:opacity-50"
                  >
                    {savingId === game.id ? 'Enabling…' : needsSetup ? 'Continue' : already ? 'Open' : 'Enable'}
                  </button>
                  {already && (
                    <button
                      type="button"
                      disabled={Boolean(savingId)}
                      onClick={() => hideGame(game)}
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-300 hover:text-rose-300 disabled:opacity-50"
                    >
                      {hiding ? 'Hiding…' : 'Hide'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {(user?.enabledGames || []).length > 0 && (
          <button
            type="button"
            onClick={() => navigate(resolvePostLoginPath(user))}
            className="text-[11px] text-slate-500 hover:text-slate-300"
          >
            Back to workspace
          </button>
        )}
      </div>
    </div>
  );
}

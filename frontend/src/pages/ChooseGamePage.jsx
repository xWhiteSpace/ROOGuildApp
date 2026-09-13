import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../services/apiClient';
import { GAMES } from '../games/catalog';
import { PRODUCT_NAME } from '../brand';

export default function ChooseGamePage({ user, onSessionUser }) {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState('');
  const enabled = new Set(user?.enabledGames || []);

  const enableGame = async (gameId, setupPath) => {
    setSavingId(gameId);
    setError('');
    try {
      const res = await apiFetch('/api/tenants/enable-game', {
        method: 'POST',
        body: JSON.stringify({ gameId }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'Could not enable that game.');
        return;
      }
      onSessionUser?.(data.user);
      if (data.user) localStorage.setItem('guild_raid_session', JSON.stringify(data.user));
      navigate(setupPath || data.setupPath || '/');
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
          Workspace is ready. Enable a game pack to get its pages, Discord channels, and settings.
        </p>
        {error && <p className="text-xs text-rose-300 font-mono">{error}</p>}
        <div className="space-y-3">
          {GAMES.map((game) => {
            const already = enabled.has(game.id);
            return (
              <button
                key={game.id}
                type="button"
                disabled={Boolean(savingId)}
                onClick={() => enableGame(game.id, game.setupPath)}
                className="w-full text-left rounded-2xl border border-indigo-500/40 bg-indigo-950/20 px-4 py-4 hover:border-indigo-400 transition disabled:opacity-50"
              >
                <div className="text-base font-semibold text-white">{game.label}</div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {already ? 'Enabled — continue setup' : 'Auction, raid attendance, party grids, Mimic Book'}
                </div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-indigo-300 mt-3">
                  {savingId === game.id ? 'Enabling…' : already ? 'Continue' : 'Enable'}
                </div>
              </button>
            );
          })}
          <div className="rounded-2xl border border-dashed border-slate-800 px-4 py-4 opacity-60">
            <div className="text-base font-semibold text-slate-300">More games later</div>
            <div className="text-[11px] text-slate-500 mt-1">Additional titles will show up here when they ship.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

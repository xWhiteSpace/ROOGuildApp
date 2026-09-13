import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../services/apiClient';
import { guildMarkSrc, onGuildMarkError } from '../utils/guildLogo';
import { gamesForEnabled } from '../games/catalog';
import { PRODUCT_NAME, productTitle } from '../brand';

const COMMON_TIMEZONES = [
  { value: 'Asia/Manila', label: 'Manila (GMT+8)' },
  { value: 'Asia/Singapore', label: 'Singapore (GMT+8)' },
  { value: 'Asia/Taipei', label: 'Taipei (GMT+8)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (GMT+9)' },
  { value: 'America/New_York', label: 'New York (EST/EDT)' },
  { value: 'UTC', label: 'Coordinated Universal Time (UTC)' },
];

export default function WorkspaceSettingsPage({ user, onSessionUser }) {
  const logoInputRef = useRef(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [savingId, setSavingId] = useState('');
  const [discordRoles, setDiscordRoles] = useState([]);
  const [inviteUrl, setInviteUrl] = useState('');
  const [newRoleStr, setNewRoleStr] = useState('');
  const [form, setForm] = useState({
    guildDisplayName: user?.tenantName || '',
    timezone: user?.tenantTimezone || 'Asia/Manila',
    adminRoles: [],
    guildLogoUrl: user?.tenantLogoUrl || '',
    enabledGames: user?.enabledGames || [],
    discordGuildId: user?.currentTenantId || '',
  });

  const applySession = (nextUser) => {
    if (!nextUser) return;
    onSessionUser?.(nextUser);
    localStorage.setItem('guild_raid_session', JSON.stringify(nextUser));
  };

  useEffect(() => {
    apiFetch('/api/tenants/workspace', { method: 'GET' })
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) {
          setError(data.error || 'Could not load workspace.');
          return;
        }
        setForm((prev) => ({ ...prev, ...data.workspace }));
        setDiscordRoles(data.discordRoles || []);
        setInviteUrl(data.workspace?.inviteUrl || '');
      })
      .catch((err) => setError(err.message));
  }, []);

  const toggleRole = (name) => {
    setForm((prev) => {
      const current = prev.adminRoles || [];
      const exists = current.some((role) => role.toLowerCase() === name.toLowerCase());
      return {
        ...prev,
        adminRoles: exists
          ? current.filter((role) => role.toLowerCase() !== name.toLowerCase())
          : [...current, name],
      };
    });
  };

  const addTypedRole = () => {
    const name = newRoleStr.trim();
    if (!name) return;
    toggleRole(name);
    setNewRoleStr('');
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await apiFetch('/api/tenants/workspace', {
        method: 'POST',
        body: JSON.stringify({
          guildDisplayName: form.guildDisplayName,
          timezone: form.timezone,
          adminRoles: form.adminRoles,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'Could not save workspace.');
        return;
      }
      applySession(data.user);
      document.title = productTitle(form.guildDisplayName);
      setSuccess('Workspace saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleImportLogo = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setLogoBusy(true);
    setError('');
    setSuccess('');
    try {
      const body = new FormData();
      body.append('logo', file);
      const res = await apiFetch('/api/tenants/logo', { method: 'POST', body });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'Could not import logo.');
        return;
      }
      setForm((prev) => ({ ...prev, guildLogoUrl: data.guildLogoUrl || '' }));
      applySession(data.user);
      setSuccess('Guild logo imported.');
    } catch (err) {
      setError(err.message || 'Could not import logo.');
    } finally {
      setLogoBusy(false);
    }
  };

  const handleRemoveLogo = async () => {
    setLogoBusy(true);
    setError('');
    setSuccess('');
    try {
      const res = await apiFetch('/api/tenants/logo', { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'Could not remove logo.');
        return;
      }
      setForm((prev) => ({ ...prev, guildLogoUrl: '' }));
      applySession(data.user);
      setSuccess('Guild logo removed.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLogoBusy(false);
    }
  };

  const hideGame = async (gameId) => {
    setSavingId(gameId);
    setError('');
    setSuccess('');
    try {
      const res = await apiFetch('/api/tenants/disable-game', {
        method: 'POST',
        body: JSON.stringify({ gameId }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'Could not hide that game.');
        return;
      }
      applySession(data.user);
      setForm((prev) => ({ ...prev, enabledGames: data.enabledGames || [] }));
      setSuccess('Game hidden from this workspace. You can enable it again from Choose games.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingId('');
    }
  };

  const enabledGames = gamesForEnabled(form.enabledGames);

  return (
    <div className="space-y-6 max-w-3xl mx-auto p-2 font-sans">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
        <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">{PRODUCT_NAME}</div>
        <h1 className="text-lg font-bold tracking-wider text-slate-200 uppercase mt-1">Workspace</h1>
        <p className="text-[11px] text-slate-500 mt-1">
          Discord server, officers, timezone, and which games this guild uses.
        </p>
      </div>

      {error && <div className="bg-rose-950/30 border border-rose-500/30 text-rose-400 text-xs p-3.5 rounded-xl">{error}</div>}
      {success && <div className="bg-emerald-950/30 border border-emerald-500/30 text-emerald-400 text-xs p-3.5 rounded-xl">{success}</div>}

      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-3">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Connected Discord server</div>
        <p className="text-sm text-slate-200 font-mono">{form.discordGuildId}</p>
        {inviteUrl && (
          <a href={inviteUrl} target="_blank" rel="noreferrer" className="inline-flex text-[11px] text-indigo-400 hover:text-indigo-300">
            Re-invite bot
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="text-xs font-medium text-slate-300">Guild name</div>
          <p className="text-[11px] text-slate-500">Shown in the browser tab as “Name · {PRODUCT_NAME}”.</p>
          <input
            value={form.guildDisplayName || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, guildDisplayName: e.target.value }))}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200"
            maxLength={64}
          />
        </div>
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="text-xs font-medium text-slate-300">Time zone</div>
          <select
            value={form.timezone || 'Asia/Manila'}
            onChange={(e) => setForm((prev) => ({ ...prev, timezone: e.target.value }))}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200"
          >
            {COMMON_TIMEZONES.map((z) => (
              <option key={z.value} value={z.value}>{z.label}</option>
            ))}
            {!COMMON_TIMEZONES.find((z) => z.value === form.timezone) && form.timezone && (
              <option value={form.timezone}>{form.timezone} (Custom)</option>
            )}
          </select>
        </div>
      </div>

      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="text-xs font-medium text-slate-300">Guild logo</div>
        <div className="flex items-center gap-3">
          <img
            src={form.guildLogoUrl || user?.tenantLogoUrl || guildMarkSrc({ guildId: user?.currentTenantId })}
            alt=""
            onError={onGuildMarkError}
            className="h-16 w-16 rounded-xl object-cover bg-slate-950 border border-slate-800"
          />
          <div className="flex flex-col gap-2">
            <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" className="hidden" onChange={handleImportLogo} />
            <button type="button" disabled={logoBusy} onClick={() => logoInputRef.current?.click()} className="h-7 px-3 rounded-lg border border-slate-800 text-[10px] font-semibold text-slate-400">
              {logoBusy ? 'Working…' : 'Import logo'}
            </button>
            <button type="button" disabled={logoBusy || !form.guildLogoUrl} onClick={handleRemoveLogo} className="h-7 px-3 rounded-lg border border-slate-800 text-[10px] font-semibold text-slate-500">
              Remove
            </button>
          </div>
        </div>
      </div>

      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">Officer Discord roles</div>
        <div className="flex gap-2">
          <input
            value={newRoleStr}
            onChange={(e) => setNewRoleStr(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTypedRole()}
            placeholder="Or type a role name…"
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 flex-1"
          />
          <button type="button" onClick={addTypedRole} className="px-3 py-1.5 bg-indigo-600 rounded-xl text-[10px] font-semibold uppercase">
            Authorize
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {discordRoles.map((role) => {
            const selected = (form.adminRoles || []).some((name) => name.toLowerCase() === role.name.toLowerCase());
            return (
              <button
                key={role.id}
                type="button"
                onClick={() => toggleRole(role.name)}
                className={`px-2.5 py-1 rounded-lg text-[11px] border ${
                  selected ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-slate-800 bg-slate-950 text-slate-300'
                }`}
              >
                {role.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">Games</div>
        {enabledGames.length === 0 ? (
          <p className="text-sm text-slate-500">No game enabled yet.</p>
        ) : (
          <ul className="text-sm text-slate-200 space-y-2">
            {enabledGames.map((game) => (
              <li key={game.id} className="flex items-center justify-between gap-3">
                <span>{game.label}</span>
                <button
                  type="button"
                  disabled={Boolean(savingId)}
                  onClick={() => hideGame(game.id)}
                  className="text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-rose-300 disabled:opacity-40"
                >
                  {savingId === game.id ? 'Hiding…' : 'Hide'}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-slate-500">Hide removes the tab. Auction, raid, and hall data stay in this guild.</p>
        <Link to="/workspace/games" className="inline-flex text-[11px] text-indigo-400 hover:text-indigo-300">
          Choose games
        </Link>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-5 py-2 text-[10px] font-bold uppercase tracking-wider text-white disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save workspace'}
        </button>
      </div>
    </div>
  );
}

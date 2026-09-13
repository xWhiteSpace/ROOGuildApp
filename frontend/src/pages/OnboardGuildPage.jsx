import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiFetch } from '../services/apiClient';
import { PRODUCT_NAME } from '../brand';

export default function OnboardGuildPage({ onSessionUser }) {
  const navigate = useNavigate();
  const location = useLocation();
  const guild = location.state?.guild || null;
  const [inviteUrl, setInviteUrl] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [discordRoles, setDiscordRoles] = useState([]);
  const [adminRoles, setAdminRoles] = useState([]);
  const [form, setForm] = useState({
    guildName: guild?.name || '',
    timezone: 'Asia/Manila',
  });

  const guildId = guild?.id;

  useEffect(() => {
    if (!guildId) return undefined;
    apiFetch(`/api/tenants/invite-url?guildId=${encodeURIComponent(guildId)}`, { method: 'GET' })
      .then((r) => r.json())
      .then((data) => { if (data.url) setInviteUrl(data.url); })
      .catch(() => {});
    apiFetch(`/api/tenants/discord-roles?guildId=${encodeURIComponent(guildId)}`, { method: 'GET' })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setDiscordRoles(data.roles || []);
        if (data.inviteUrl) setInviteUrl(data.inviteUrl);
      })
      .catch(() => {});
    return undefined;
  }, [guildId]);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const toggleRole = (name) => {
    setAdminRoles((prev) => (
      prev.includes(name) ? prev.filter((r) => r !== name) : [...prev, name]
    ));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!guildId) {
      setError('Pick a Discord server from the previous screen.');
      return;
    }
    if (adminRoles.length === 0) {
      setError('Pick at least one Discord role that should be officers.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch('/api/tenants/onboard', {
        method: 'POST',
        body: JSON.stringify({
          guildId,
          guildName: form.guildName,
          timezone: form.timezone,
          adminRoles,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        if (data.inviteUrl) setInviteUrl(data.inviteUrl);
        setError(data.error || 'Setup failed');
        return;
      }
      onSessionUser(data.user);
      localStorage.setItem('guild_raid_session', JSON.stringify(data.user));
      navigate('/workspace/games');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl space-y-4">
        <h1 className="text-2xl font-semibold">Create a workspace for {guild?.name || 'your Discord server'}</h1>
        <p className="text-sm text-slate-400">
          This creates the {PRODUCT_NAME} workspace for that Discord server. Invite the bot, pick officer roles and a timezone. You will choose a game next.
        </p>
        {inviteUrl && (
          <a href={inviteUrl} target="_blank" rel="noreferrer" className="inline-flex rounded-full bg-[#5865F2] px-5 py-2 text-sm font-semibold">
            1. Invite bot to this server
          </a>
        )}
        {error && <p className="text-xs text-rose-300 font-mono">{error}</p>}
        <label className="block text-xs text-slate-400">
          Guild display name
          <input
            value={form.guildName}
            onChange={(e) => setField('guildName', e.target.value)}
            placeholder="Your guild name"
            className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="block text-xs text-slate-400">
          Timezone
          <input
            value={form.timezone}
            onChange={(e) => setField('timezone', e.target.value.trim())}
            placeholder="Asia/Manila"
            className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
          />
        </label>
        <div>
          <div className="text-xs text-slate-400 mb-2">Officer Discord roles</div>
          {discordRoles.length === 0 && (
            <p className="text-[11px] text-slate-500">Invite the bot first so we can list this server’s roles.</p>
          )}
          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
            {discordRoles.map((role) => (
              <button
                key={role.id}
                type="button"
                onClick={() => toggleRole(role.name)}
                className={`px-2.5 py-1 rounded-lg text-[11px] border ${
                  adminRoles.includes(role.name)
                    ? 'border-indigo-500 bg-indigo-600 text-white'
                    : 'border-slate-800 bg-slate-950 text-slate-300'
                }`}
              >
                {role.name}
              </button>
            ))}
          </div>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {saving ? 'Saving…' : '2. Create workspace'}
        </button>
      </form>
    </div>
  );
}

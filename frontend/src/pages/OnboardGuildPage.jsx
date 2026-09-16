import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiFetch } from '../services/apiClient';
import { PRODUCT_NAME } from '../brand';
import OfficerRolePicker from '../components/OfficerRolePicker';

export default function OnboardGuildPage({ onSessionUser }) {
  const navigate = useNavigate();
  const location = useLocation();
  const guild = location.state?.guild || null;
  const [inviteUrl, setInviteUrl] = useState('');
  const [error, setError] = useState('');
  const [roleHint, setRoleHint] = useState('');
  const [saving, setSaving] = useState(false);
  const [discordRoles, setDiscordRoles] = useState([]);
  const [adminRoles, setAdminRoles] = useState([]);
  const [form, setForm] = useState({
    guildName: guild?.name || '',
    timezone: 'Asia/Manila',
  });
  const gotRoles = useRef(false);

  const guildId = guild?.id;

  useEffect(() => {
    if (!guildId) return undefined;
    gotRoles.current = false;
    apiFetch(`/api/tenants/invite-url?guildId=${encodeURIComponent(guildId)}`, { method: 'GET' })
      .then((r) => r.json())
      .then((data) => { if (data.url) setInviteUrl(data.url); })
      .catch(() => {});

    const loadRoles = () => {
      if (gotRoles.current) return Promise.resolve();
      return apiFetch(`/api/tenants/discord-roles?guildId=${encodeURIComponent(guildId)}`, { method: 'GET' })
        .then((r) => r.json())
        .then((data) => {
          if (data.inviteUrl) setInviteUrl(data.inviteUrl);
          if (data.success && (data.roles || []).length > 0) {
            gotRoles.current = true;
            setDiscordRoles(data.roles);
            setRoleHint('');
            return;
          }
          setRoleHint(data.error || 'Waiting for the bot to join this server. After you authorize it, come back to this tab.');
        })
        .catch((err) => {
          setRoleHint(err.message || 'Could not load Discord roles.');
        });
    };

    loadRoles();
    const id = setInterval(loadRoles, 3000);
    const onShow = () => loadRoles();
    window.addEventListener('focus', onShow);
    document.addEventListener('visibilitychange', onShow);
    const stop = setTimeout(() => clearInterval(id), 120000);
    return () => {
      clearInterval(id);
      clearTimeout(stop);
      window.removeEventListener('focus', onShow);
      document.removeEventListener('visibilitychange', onShow);
    };
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
      navigate('/workspace/billing');
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
          This creates the {PRODUCT_NAME} workspace for that Discord server. Invite the bot, pick officer roles and a timezone. Next you subscribe or redeem an invite code.
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
        <OfficerRolePicker
          roles={discordRoles}
          selectedNames={adminRoles}
          onToggle={toggleRole}
          emptyHint={roleHint || 'Invite the bot, then return to this tab. Role chips load from the live bot — pausing Render does not refresh this page.'}
        />
        <button
          type="submit"
          disabled={saving || adminRoles.length === 0}
          title={adminRoles.length === 0 ? 'Click at least one officer role above' : undefined}
          className="rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {saving ? 'Saving…' : '2. Create workspace'}
        </button>
        {discordRoles.length > 0 && adminRoles.length === 0 && (
          <p className="text-[11px] text-amber-400">Create workspace stays off until you click a role.</p>
        )}
      </form>
    </div>
  );
}

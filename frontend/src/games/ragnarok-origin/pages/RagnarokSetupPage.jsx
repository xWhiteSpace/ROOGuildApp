import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../../services/apiClient';

const emptyRooms = {
  DISCORD_WARROOM_ID_1: '',
  DISCORD_WARROOM_ID_2: '',
  DISCORD_WARROOM_ID_3: '',
  DISCORD_WARROOM_ID_4: '',
  DISCORD_WARROOM_ID_5: '',
};

export default function RagnarokSetupPage({ onSessionUser }) {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    auctionChannelId: '',
    aucreqChannelId: '',
    genroomId: '',
    attendanceId: '',
    warAnnounceChannelId: '',
    warRooms: { ...emptyRooms },
  });

  useEffect(() => {
    apiFetch('/api/tenants/workspace', { method: 'GET' })
      .then((r) => r.json())
      .then((data) => {
        const channels = data.workspace?.discordChannels;
        if (!channels) return;
        setForm({
          auctionChannelId: channels.auctionChannelId || '',
          aucreqChannelId: channels.aucreqChannelId || '',
          genroomId: channels.genroomId || '',
          attendanceId: channels.attendanceId || '',
          warAnnounceChannelId: channels.warAnnounceChannelId || '',
          warRooms: { ...emptyRooms, ...(channels.warRooms || {}) },
        });
      })
      .catch(() => {});
  }, []);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch('/api/tenants/game-setup', {
        method: 'POST',
        body: JSON.stringify({ discordChannels: form }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'Could not save Ragnarok Origin channels.');
        return;
      }
      onSessionUser?.(data.user);
      if (data.user) localStorage.setItem('guild_raid_session', JSON.stringify(data.user));
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const field = (label, key, placeholder) => (
    <label className="block text-xs text-slate-400">
      {label}
      <input
        value={form[key]}
        onChange={(e) => setField(key, e.target.value.trim())}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
      />
    </label>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl space-y-4">
        <h1 className="text-2xl font-semibold">Ragnarok Origin setup</h1>
        <p className="text-sm text-slate-400">
          Paste Discord channel IDs (Developer Mode → right-click channel → Copy Channel ID). You can change these later in Game Settings.
        </p>
        {error && <p className="text-xs text-rose-300 font-mono">{error}</p>}
        {field('Auction announce channel ID', 'auctionChannelId', 'numbers only')}
        {field('Auction request / claim card channel ID', 'aucreqChannelId', '')}
        {field('General room channel ID', 'genroomId', '')}
        {field('Weekly attendance thread parent (one text channel)', 'attendanceId', '')}
        {field('War-announce (one text channel for cards)', 'warAnnounceChannelId', '')}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Object.keys(emptyRooms).map((key, idx) => (
            <label key={key} className="block text-xs text-slate-400">
              Voice war room {idx + 1}
              <input
                value={form.warRooms[key]}
                onChange={(e) => setForm((prev) => ({
                  ...prev,
                  warRooms: { ...prev.warRooms, [key]: e.target.value.trim() },
                }))}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>
          ))}
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save and open Ragnarok Origin'}
        </button>
      </form>
    </div>
  );
}

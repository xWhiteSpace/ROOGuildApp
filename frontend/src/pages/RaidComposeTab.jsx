import { useEffect, useMemo, useState } from 'react';
import { Megaphone, Send } from 'lucide-react';
import { upcomingDatesForWeekday, DEFAULT_TZ } from '../utils/guildTime';
import { apiFetch } from '../services/apiClient';

function formatTimeDigits(raw) {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 4);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return digits;
  if (digits.length === 3) return `${digits[0]}:${digits.slice(1)}`;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function normalizeTimeValue(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  const withColon = trimmed.match(/^(\d{1,2}):(\d{1,2})(?::\d{2})?$/);
  if (withColon) {
    const hh = Math.min(23, parseInt(withColon[1], 10));
    const mm = Math.min(59, parseInt(withColon[2], 10));
    if (Number.isNaN(hh) || Number.isNaN(mm)) return '';
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 3) {
    const hh = Math.min(23, parseInt(digits.slice(0, 1), 10));
    const mm = Math.min(59, parseInt(digits.slice(1), 10));
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  if (digits.length === 4) {
    const hh = Math.min(23, parseInt(digits.slice(0, 2), 10));
    const mm = Math.min(59, parseInt(digits.slice(2), 10));
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  return '';
}

export default function RaidComposeTab({ user }) {
  const isOfficer = user?.isOfficer === true;
  const [loading, setLoading] = useState(true);
  const [eventsCatalog, setEventsCatalog] = useState({});
  const [guildTimezone, setGuildTimezone] = useState(DEFAULT_TZ);
  const [published, setPublished] = useState({});

  const [selectedEventKey, setSelectedEventKey] = useState('');
  const [selectedEventDate, setSelectedEventDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [sending, setSending] = useState(false);
  const [announcing, setAnnouncing] = useState(false);
  const [lastSentId, setLastSentId] = useState('');
  const [statusMsg, setStatusMsg] = useState(null);

  const loadWorkspace = async () => {
    try {
      setLoading(true);
      const configRes = await apiFetch('/api/requests/settings/get');
      const configData = await configRes.json();
      if (configData.success && configData.config) {
        setEventsCatalog(configData.config.events || {});
        if (configData.config.timezone) setGuildTimezone(configData.config.timezone);
      }
      const pubRes = await apiFetch('/api/attendance/published', { method: 'GET' });
      const pubData = await pubRes.json();
      if (pubData.success) {
        setPublished(pubData.published || {});
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadWorkspace(); }, [user]);

  const computedEventDates = useMemo(() => {
    if (!selectedEventKey || !eventsCatalog[selectedEventKey]) return [];
    const p3 = eventsCatalog[selectedEventKey].phases?.[3];
    if (!p3) return [];
    const targetDayOfWeek = parseInt(p3.dayStart, 10);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return upcomingDatesForWeekday(targetDayOfWeek, guildTimezone || DEFAULT_TZ, 1).map((dateStr) => ({
      dateVal: dateStr,
      label: `${dateStr} (${dayNames[targetDayOfWeek]})`,
    }));
  }, [selectedEventKey, eventsCatalog, guildTimezone]);

  useEffect(() => {
    if (computedEventDates.length > 0) setSelectedEventDate(computedEventDates[0].dateVal);
    else setSelectedEventDate('');
  }, [computedEventDates]);

  useEffect(() => {
    if (!selectedEventKey) return;
    const p3 = eventsCatalog[selectedEventKey]?.phases?.[3];
    const fallback = p3?.timeStart || '20:55';
    const existingId = selectedEventDate ? `${selectedEventDate}_${selectedEventKey}` : '';
    const existing = existingId ? published[existingId] : null;
    setSelectedTime(existing?.timeStart || fallback);
  }, [selectedEventKey, selectedEventDate, eventsCatalog, published]);

  const matchingPublishedId = selectedEventDate && selectedEventKey
    ? `${selectedEventDate}_${selectedEventKey}`
    : '';
  const sentId = published[matchingPublishedId] ? matchingPublishedId : lastSentId;
  const canAnnounce = Boolean(sentId && published[sentId]);

  const handleSend = async () => {
    const timeStart = normalizeTimeValue(selectedTime);
    if (!selectedEventKey || !selectedEventDate || !timeStart) {
      return alert('Select event, date, and time.');
    }
    setSending(true);
    setStatusMsg(null);
    try {
      const res = await apiFetch('/api/attendance/compose/send', {
        method: 'POST',
        body: JSON.stringify({
          eventKey: selectedEventKey,
          eventDate: selectedEventDate,
          timeStart,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.error || 'Failed to send raid.');
        return;
      }
      const id = data.published?.id || matchingPublishedId;
      setLastSentId(id);
      setPublished((prev) => ({ ...prev, [id]: data.published }));
      setStatusMsg({ ok: true, text: 'Sent to Live Raid → Active Compositions.' });
    } catch (err) {
      alert(err.message);
    } finally {
      setSending(false);
    }
  };

  const handleAnnounce = async () => {
    if (!sentId) return alert('Send the raid first.');
    setAnnouncing(true);
    setStatusMsg(null);
    try {
      const res = await apiFetch(`/api/attendance/published/${encodeURIComponent(sentId)}/announce-attendance`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Announce failed');
      setStatusMsg({ ok: true, text: 'Announced to GEN Room. Members confirm attendance in war-announce.' });
    } catch (err) {
      alert(err.message || 'Announce failed');
    } finally {
      setAnnouncing(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-xs font-mono uppercase text-slate-500 animate-pulse">Loading raid compose…</div>;
  }

  return (
    <div className="mx-auto max-w-2xl p-6 font-sans animate-fadeIn space-y-5">
      <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 space-y-5 shadow-xl">
        <div>
          <h1 className="text-sm font-black uppercase tracking-wider text-slate-100">Raid Compose</h1>
          <p className="text-[11px] text-slate-500 mt-1">
            Pick event, date, and time. Send publishes the raid to Live Raid → Active Compositions.
            Announce tells GEN to confirm attendance in war-announce.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">1. Event</label>
          <select
            value={selectedEventKey}
            onChange={(e) => setSelectedEventKey(e.target.value)}
            disabled={!isOfficer}
            className="w-full bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-3.5 py-2.5 text-xs outline-none cursor-pointer disabled:opacity-50"
          >
            <option value="" disabled>-- Select Event --</option>
            {Object.entries(eventsCatalog).map(([key, ev]) => (
              <option key={key} value={key}>{ev.title || key}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">2. Date</label>
          <select
            value={selectedEventDate}
            onChange={(e) => setSelectedEventDate(e.target.value)}
            disabled={!isOfficer || !selectedEventKey}
            className="w-full bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-3.5 py-2.5 text-xs outline-none cursor-pointer disabled:opacity-50"
          >
            <option value="" disabled>-- Select Date --</option>
            {computedEventDates.map((opt) => (
              <option key={opt.dateVal} value={opt.dateVal}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">3. Time</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="2055 → 20:55"
            maxLength={5}
            disabled={!isOfficer || !selectedEventKey}
            value={selectedTime}
            onChange={(e) => setSelectedTime(formatTimeDigits(e.target.value))}
            onBlur={() => {
              const normalized = normalizeTimeValue(selectedTime);
              if (normalized) setSelectedTime(normalized);
            }}
            className="w-full bg-slate-950 border border-slate-800 text-amber-300 font-mono font-bold rounded-xl px-3.5 py-2.5 text-xs outline-none text-center disabled:opacity-50"
          />
        </div>

        {statusMsg && (
          <p className={`text-[11px] font-mono font-semibold ${statusMsg.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
            {statusMsg.text}
          </p>
        )}

        {isOfficer ? (
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <button
              type="button"
              disabled={sending}
              onClick={handleSend}
              className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
            >
              <Send size={14} /> {sending ? 'Sending…' : 'Send'}
            </button>
            <button
              type="button"
              disabled={announcing || !canAnnounce}
              onClick={handleAnnounce}
              className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-slate-200 hover:text-white text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Megaphone size={14} /> {announcing ? 'Announcing…' : 'Announce'}
            </button>
          </div>
        ) : (
          <p className="text-[11px] text-slate-500">Officers send and announce raids.</p>
        )}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { apiFetch } from '../../../services/apiClient';

const SOURCE_COLORS = {
  'adventurer-guild': '#6366f1',
  'ragnarok-origin': '#f59e0b',
};

function formatRange(info) {
  const from = info.startStr.slice(0, 10);
  const end = new Date(`${info.endStr.slice(0, 10)}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  const to = end.toISOString().slice(0, 10);
  return { from, to };
}

const emptyForm = {
  title: '',
  date: '',
  timeStart: '18:00',
  timeEnd: '19:00',
  allDay: false,
  description: '',
};

export default function GuildEventsPage({ user }) {
  const navigate = useNavigate();
  const calendarRef = useRef(null);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const officer = Boolean(user?.isOfficer);

  const load = async (from, to) => {
    if (!from || !to) return;
    const res = await apiFetch(`/api/adventurer-guild/events?from=${from}&to=${to}`, { method: 'GET' });
    const data = await res.json();
    if (!data.success) {
      setError(data.error || 'Could not load events.');
      return;
    }
    setError('');
    setEvents(data.events || []);
  };

  useEffect(() => {
    if (!range) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await load(range.from, range.to);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [range?.from, range?.to]);

  const calendarEvents = useMemo(
    () => events.map((event) => ({
      id: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      allDay: Boolean(event.allDay),
      backgroundColor: SOURCE_COLORS[event.sourceGameId] || '#64748b',
      borderColor: SOURCE_COLORS[event.sourceGameId] || '#64748b',
      extendedProps: event,
    })),
    [events],
  );

  const openCreate = (dateStr) => {
    if (!officer) return;
    setForm({ ...emptyForm, date: dateStr });
    setModal({ mode: 'create' });
  };

  const openEdit = (event) => {
    const startDay = String(event.start || '').slice(0, 10);
    const startTime = event.allDay ? '18:00' : String(event.start || '').slice(11, 16);
    const endTime = event.allDay ? '19:00' : String(event.end || '').slice(11, 16);
    setForm({
      title: event.title || '',
      date: event.date || startDay,
      timeStart: event.timeStart || startTime || '18:00',
      timeEnd: event.timeEnd || endTime || '19:00',
      allDay: Boolean(event.allDay),
      description: event.description || '',
    });
    setModal({ mode: 'edit', id: event.id });
  };

  const handleEventClick = (info) => {
    const event = info.event.extendedProps;
    if (event.readOnly && event.href) {
      navigate(event.href);
      return;
    }
    if (event.native && officer) openEdit(event);
  };

  const persist = async () => {
    if (!form.title.trim() || !form.date) {
      setError('Title and date are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        title: form.title,
        date: form.date,
        timeStart: form.timeStart,
        timeEnd: form.timeEnd,
        allDay: form.allDay,
        description: form.description,
      };
      const editing = modal?.mode === 'edit';
      const res = await apiFetch(
        editing ? `/api/adventurer-guild/events/${modal.id}` : '/api/adventurer-guild/events',
        { method: editing ? 'PUT' : 'POST', body: JSON.stringify(payload) },
      );
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'Could not save event.');
        return;
      }
      setModal(null);
      if (range) await load(range.from, range.to);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (modal?.mode !== 'edit') return;
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch(`/api/adventurer-guild/events/${modal.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'Could not delete event.');
        return;
      }
      setModal(null);
      if (range) await load(range.from, range.to);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto font-sans">
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Adventurer Guild</div>
        <h1 className="text-2xl font-semibold text-white mt-1">Guild Events</h1>
        <p className="text-sm text-slate-400 mt-1">
          Hall calendar. Native guild events stay here. Enabled games can contribute their own schedules.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 text-[10px] font-mono uppercase tracking-widest text-slate-400">
        <span className="inline-flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-indigo-500" /> Hall</span>
        <span className="inline-flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-amber-500" /> Ragnarok Origin</span>
      </div>

      {error && <p className="text-xs text-rose-300 font-mono">{error}</p>}
      {loading && <p className="text-xs uppercase tracking-widest text-slate-500">Loading calendar…</p>}

      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 text-slate-200">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          height="auto"
          events={calendarEvents}
          dateClick={(info) => openCreate(info.dateStr)}
          eventClick={handleEventClick}
          datesSet={(info) => setRange(formatRange(info))}
          headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
        />
      </div>

      {officer && (
        <p className="text-xs text-slate-500">Click a day to add a hall event. Game-contributed rows open that game’s scheduler.</p>
      )}

      {modal && (
        <div className="fixed inset-0 z-[90] bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white">
              {modal.mode === 'edit' ? 'Edit hall event' : 'New hall event'}
            </h2>
            <input
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="Title"
              className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
            />
            <input
              type="date"
              value={form.date}
              onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
              className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
            />
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={form.allDay}
                onChange={(event) => setForm((prev) => ({ ...prev, allDay: event.target.checked }))}
              />
              All day
            </label>
            {!form.allDay && (
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="time"
                  value={form.timeStart}
                  onChange={(event) => setForm((prev) => ({ ...prev, timeStart: event.target.value }))}
                  className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
                />
                <input
                  type="time"
                  value={form.timeEnd}
                  onChange={(event) => setForm((prev) => ({ ...prev, timeEnd: event.target.value }))}
                  className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
                />
              </div>
            )}
            <textarea
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Notes"
              rows={3}
              className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
            />
            <div className="flex justify-between gap-2">
              {modal.mode === 'edit' ? (
                <button type="button" onClick={remove} disabled={saving} className="text-xs text-rose-300">
                  Delete
                </button>
              ) : <span />}
              <div className="flex gap-2">
                <button type="button" onClick={() => setModal(null)} className="text-xs text-slate-400">Cancel</button>
                <button
                  type="button"
                  onClick={persist}
                  disabled={saving}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-white disabled:opacity-40"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

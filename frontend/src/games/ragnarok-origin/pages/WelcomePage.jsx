import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Globe, History, Minus, Pencil, Percent, Plus, Search, Swords, Trash2, User, Users, X } from 'lucide-react';
import { apiFetch } from '../../../services/apiClient';
import { queryClient } from '../../../query/client';
import {
  invalidateAnnouncements,
  invalidateAttendanceMe,
  invalidateCommitments,
  invalidateMembers,
  invalidatePeakHours,
  queryKeys,
  useAnnouncements,
  useAttendanceMe,
  useCommitments,
  useMemberAuctionStats,
  useMembers,
  usePeakHours,
  useProfile,
  useSettings,
  useWeekInstances,
  useWinRate,
} from '../../../query/hooks';
import StatisticsTab from './StatisticsTab';
import { buildCompositeKey, DEFAULT_TZ, getWeekMonday, guildWallTimeToUtcMs } from '../../../utils/guildTime';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const ANNOUNCEMENT_MAX = 4000;
const ANNOUNCEMENT_TITLE_MAX = 80;

function gvgResultClass(value) {
  if (value === 'Win') return 'text-emerald-300';
  if (value === 'Lose') return 'text-rose-300';
  if (value) return 'text-amber-200';
  return 'text-slate-100';
}

function GvgStat({ icon: Icon, label, value, valueClassName = 'text-slate-100' }) {
  const shown = value || '—';
  return (
    <div className="flex h-full min-w-0 flex-col items-center rounded-xl border border-slate-800 bg-slate-950/40 px-2 py-2.5 text-center" title={label} aria-label={value ? `${label} ${value}` : label}>
      <Icon size={14} className="shrink-0 text-slate-500" aria-hidden="true" />
      <span className="mt-1 flex h-8 w-full items-center justify-center text-[10px] font-normal uppercase leading-tight tracking-wider text-slate-500">{label}</span>
      <span className={`flex h-6 w-full items-center justify-center text-lg font-medium uppercase tabular-nums leading-none ${valueClassName}`}>{shown}</span>
    </div>
  );
}

function DriftingMessage({ text }) {
  const frameRef = useRef(null);
  const textRef = useRef(null);
  const [drift, setDrift] = useState(0);

  useEffect(() => {
    const frame = frameRef.current;
    const body = textRef.current;
    if (!frame || !body) return undefined;
    const measure = () => {
      const extra = body.scrollHeight - frame.clientHeight;
      setDrift(extra > 2 ? extra : 0);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(body);
    return () => observer.disconnect();
  }, [text]);

  const seconds = Math.max(8, (drift / 14) * 2);

  return (
    <div
      ref={frameRef}
      className={`group mt-1 max-h-16 overflow-x-hidden ${drift ? 'overflow-y-hidden motion-reduce:overflow-y-auto' : 'overflow-y-auto'}`}
    >
      <p
        ref={textRef}
        className="break-words text-xs leading-relaxed text-slate-300 whitespace-pre-wrap motion-reduce:animate-none group-hover:[animation-play-state:paused]"
        style={drift ? { '--drift': `${drift}px`, animation: `welcome-drift ${seconds}s ease-in-out infinite` } : undefined}
      >
        {text}
      </p>
    </div>
  );
}

function announcementParts(post) {
  const stored = String(post?.title || '').trim();
  if (stored) return { title: stored, body: String(post?.body || '') };
  const lines = String(post?.body || '').split('\n');
  return { title: (lines.shift() || '').trim(), body: lines.join('\n').trim() };
}
const ITEM_THEME_MAP = {
  purple: 'text-violet-300 border-violet-500/40 bg-violet-950/30',
  yellow: 'text-yellow-300 border-yellow-500/40 bg-yellow-950/20',
  slate: 'text-slate-100 border-slate-700 bg-slate-900/40',
  red: 'text-red-400 border-red-900 bg-black/50',
};

function emptyHours() {
  return { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
}

function hoursFromMine(mine) {
  const next = emptyHours();
  if (!mine?.hours) return next;
  for (const key of DAY_KEYS) {
    next[key] = Array.isArray(mine.hours[key]) ? [...mine.hours[key]] : [];
  }
  return next;
}

function hasAnyHour(hours) {
  return DAY_KEYS.some((key) => (hours[key] || []).length > 0);
}

function cellTone(count, max) {
  if (!count) return { className: 'bg-slate-950', style: undefined };
  const t = max ? count / max : 1;
  const opacity = 0.07 + Math.pow(t, 1.5) * 0.93;
  return { className: '', style: { backgroundColor: `rgba(52, 211, 153, ${opacity.toFixed(3)})` } };
}

function chipTheme(colorTheme) {
  if (typeof colorTheme === 'string' && colorTheme.startsWith('#')) {
    return {
      className: 'border',
      style: {
        color: colorTheme,
        borderColor: `${colorTheme}66`,
        backgroundColor: `${colorTheme}22`,
      },
    };
  }
  const preset = ITEM_THEME_MAP[colorTheme] || 'text-slate-300 border-slate-700 bg-slate-950/50';
  return { className: `border ${preset}`, style: {} };
}

function eventDateParts(dateStr) {
  const date = new Date(`${dateStr}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return { weekday: '', day: dateStr };
  return {
    weekday: date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
    day: date.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' }),
  };
}

function commitmentStatus(commitments, compositeKey, userId) {
  const bucket = commitments?.[compositeKey];
  if (!bucket || userId == null) return null;
  const entry = bucket[userId] || bucket[String(userId)];
  return entry?.status || null;
}

function headcount(commitments, compositeKey) {
  const bucket = commitments?.[compositeKey];
  if (!bucket || typeof bucket !== 'object') return { present: 0, leave: 0 };
  let present = 0;
  let leave = 0;
  for (const entry of Object.values(bucket)) {
    if (entry?.status === 'Confirmed') present += 1;
    else if (entry?.status === 'Leave') leave += 1;
  }
  return { present, leave };
}

function pastDeadline(item, timezone) {
  const startMs = guildWallTimeToUtcMs(item.timeStart || '20:55', timezone, item.dateStr);
  if (!Number.isFinite(startMs)) return false;
  return Date.now() > startMs - 24 * 60 * 60 * 1000;
}

function Card({ title, action, children, className = '', bodyClassName = '' }) {
  const fill = className.includes('h-full') || className.includes('flex-1');
  const body = bodyClassName || (fill ? 'min-h-0 flex-1 overflow-hidden' : 'overflow-hidden');
  return (
    <section className={`flex min-h-0 flex-col rounded-2xl border border-slate-800 bg-slate-900/40 ${className}`}>
      <header className="relative z-20 flex h-10 shrink-0 items-center justify-between gap-2 border-b border-slate-800/80 px-3">
        <h2 className="shrink-0 text-[10px] font-normal uppercase tracking-wider text-slate-400">{title}</h2>
        {action}
      </header>
      <div className={body}>{children}</div>
    </section>
  );
}

function Band({ label, children, className = '' }) {
  return (
    <section className={`flex min-h-0 flex-col ${className}`}>
      <h2 className="mb-1.5 shrink-0 text-[10px] font-normal uppercase tracking-widest text-slate-500">{label}</h2>
      {children}
    </section>
  );
}

function WelcomePeak() {
  const peakQuery = usePeakHours();
  const data = peakQuery.data;
  const [mode, setMode] = useState('guild');
  const [hours, setHours] = useState(emptyHours);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const paintRef = useRef(null);
  const heatmap = Array.isArray(data?.heatmap) ? data.heatmap : [];
  const peak = data?.peak || null;

  useEffect(() => {
    if (!data) return;
    setHours(hoursFromMine(data.mine || null));
  }, [data]);

  useEffect(() => {
    const stopPaint = () => { paintRef.current = null; };
    window.addEventListener('pointerup', stopPaint);
    window.addEventListener('pointercancel', stopPaint);
    return () => {
      window.removeEventListener('pointerup', stopPaint);
      window.removeEventListener('pointercancel', stopPaint);
    };
  }, []);

  const maxCount = useMemo(() => {
    let max = 0;
    for (const row of heatmap) {
      for (const n of row || []) if (n > max) max = n;
    }
    return max;
  }, [heatmap]);

  const setCell = (dayKey, hour, on) => {
    setHours((prev) => {
      const current = new Set(prev[dayKey] || []);
      if (on) current.add(hour);
      else current.delete(hour);
      return { ...prev, [dayKey]: [...current].sort((a, b) => a - b) };
    });
  };

  const saveHours = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch('/api/attendance/peak-hours/me', {
        method: 'PUT',
        body: JSON.stringify({ hours }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        setError(payload.error || 'Could not save Peak Hours.');
        return;
      }
      await invalidatePeakHours();
    } catch (err) {
      setError(err.message || 'Could not save Peak Hours.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = (
    <div className="flex items-center gap-0.5 rounded-xl border border-slate-800 bg-slate-950 p-0.5 shadow-inner">
      <button
        type="button"
        onClick={() => setMode('guild')}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer ${mode === 'guild' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
      >
        <Globe size={14} />
        See All
      </button>
      <button
        type="button"
        onClick={() => setMode('mine')}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer ${mode === 'mine' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
      >
        <User size={14} />
        See Mine
      </button>
    </div>
  );

  return (
    <Card className="h-[12.5rem] lg:h-full" title="Peak Hours" action={toggle}>
      <div className="flex h-full min-h-0 flex-col px-3 py-2">
        <div className="mb-1 flex h-7 shrink-0 items-center gap-2">
          <p className={`min-w-0 flex-1 truncate text-[10px] font-normal ${(error || peakQuery.error) ? 'text-rose-400' : 'text-white'}`}>
            {error || peakQuery.error?.message || (mode === 'guild' && peak?.label) || ''}
          </p>
          {mode === 'mine' && (
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={() => setHours(emptyHours())} className="rounded-lg border border-slate-800 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 hover:text-white cursor-pointer">
                Clear
              </button>
              <button type="button" disabled={saving || !hasAnyHour(hours)} onClick={saveHours} className="rounded-lg bg-indigo-600 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white disabled:opacity-40 cursor-pointer">
                {saving ? 'Saving' : 'Save'}
              </button>
            </div>
          )}
        </div>
        <div className="mx-auto grid w-full max-w-[26rem] shrink-0 grid-cols-[2rem_repeat(24,minmax(0,1fr))] gap-x-0.5">
          <div />
          {Array.from({ length: 24 }, (_, hour) => (
            <div key={hour} className="relative h-3">
              {hour % 6 === 0 && (
                <span className="absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] leading-none text-slate-500">
                  {String(hour).padStart(2, '0')}
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="mx-auto mt-1 grid min-h-0 w-full max-w-[26rem] flex-1 grid-rows-7 gap-0.5">
          {DAY_KEYS.map((key, dayIndex) => (
            <div key={key} className="grid min-h-[0.7rem] grid-cols-[2rem_repeat(24,minmax(0,1fr))] gap-x-0.5">
              <div className="self-center truncate font-mono text-[10px] leading-none text-slate-400">{DAY_SHORT[dayIndex]}</div>
              {Array.from({ length: 24 }, (_, hour) => {
                if (mode === 'mine') {
                  const on = (hours[key] || []).includes(hour);
                  return (
                    <button
                      key={`${key}-${hour}`}
                      type="button"
                      aria-label={`${DAY_SHORT[dayIndex]} ${String(hour).padStart(2, '0')}:00`}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        const nextOn = !on;
                        paintRef.current = { on: nextOn };
                        setCell(key, hour, nextOn);
                      }}
                      onPointerEnter={() => {
                        if (!paintRef.current) return;
                        setCell(key, hour, paintRef.current.on);
                      }}
                      className={`h-full min-h-0 w-full rounded-[2px] touch-none cursor-pointer ${on ? 'bg-emerald-500' : 'bg-slate-950'}`}
                    />
                  );
                }
                const count = heatmap[dayIndex]?.[hour] || 0;
                const tone = cellTone(count, maxCount);
                return (
                  <div
                    key={`${dayIndex}-${hour}`}
                    title={`${DAY_SHORT[dayIndex]} ${String(hour).padStart(2, '0')}:00 · ${count}`}
                    className={`h-full min-h-0 rounded-[2px] ${tone.className}`}
                    style={tone.style}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function WelcomeBoard({ user }) {
  const boardQuery = useAnnouncements();
  const posts = boardQuery.data || [];
  const isOfficer = user?.isOfficer === true;
  const [editor, setEditor] = useState(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const saveDraft = async () => {
    setSaving(true);
    setError('');
    try {
      const editing = editor && editor !== 'create';
      const path = editing
        ? `/api/attendance/announcements/${encodeURIComponent(editor)}`
        : '/api/attendance/announcements';
      const res = await apiFetch(path, {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify({ title: draftTitle, body: draft }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Could not save the announcement.');
        return;
      }
      setEditor(null);
      setDraftTitle('');
      setDraft('');
      await invalidateAnnouncements();
    } catch (err) {
      setError(err.message || 'Could not save the announcement.');
    } finally {
      setSaving(false);
    }
  };

  const removePost = async (item) => {
    if (!item || saving) return;
    if (!window.confirm('Delete this announcement?')) return;
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch(`/api/attendance/announcements/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Could not delete the announcement.');
        return;
      }
      if (editor === item.id) setEditor(null);
      await invalidateAnnouncements();
    } catch (err) {
      setError(err.message || 'Could not delete the announcement.');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (item) => {
    const parts = announcementParts(item);
    setDraftTitle(parts.title);
    setDraft(parts.body);
    setEditor(item.id);
    setError('');
  };

  const controls = isOfficer && !editor ? (
    <button
      type="button"
      aria-label="New announcement"
      onClick={() => { setEditor('create'); setDraftTitle(''); setDraft(''); setError(''); }}
      className="rounded-md p-1 text-slate-400 hover:text-white cursor-pointer"
    >
      <Plus size={14} />
    </button>
  ) : null;

  return (
    <Card className="h-[12.5rem] lg:h-full" title="Announcements" action={controls}>
      <div className="flex h-full min-h-0 flex-col">
        {error && <p className="px-3 pt-2 text-[10px] text-rose-400">{error}</p>}
        {editor ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
            <input
              value={draftTitle}
              maxLength={ANNOUNCEMENT_TITLE_MAX}
              onChange={(event) => setDraftTitle(event.target.value.slice(0, ANNOUNCEMENT_TITLE_MAX))}
              className="shrink-0 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-slate-600"
              placeholder="Title"
            />
            <textarea
              value={draft}
              maxLength={ANNOUNCEMENT_MAX}
              onChange={(event) => setDraft(event.target.value.slice(0, ANNOUNCEMENT_MAX))}
              className="min-h-0 flex-1 resize-none rounded-lg border border-slate-800 bg-slate-950 p-2 text-xs text-slate-200 outline-none focus:border-slate-600"
              placeholder="Message to the guild"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] text-slate-500">{draft.length}/{ANNOUNCEMENT_MAX}</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setEditor(null); setDraftTitle(''); setError(''); }} className="rounded-lg border border-slate-800 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 cursor-pointer">
                  Cancel
                </button>
                <button type="button" disabled={saving || (!draft.trim() && !draftTitle.trim())} onClick={saveDraft} className="rounded-lg bg-indigo-600 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white disabled:opacity-40 cursor-pointer">
                  {saving ? 'Saving' : editor === 'create' ? 'Post' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto p-2">
            {posts.length === 0 && (
              <p className="px-1 py-4 text-[11px] text-slate-500">No announcements yet.</p>
            )}
            {posts.map((item) => {
              const parts = announcementParts(item);
              return (
                <article key={item.id} className="min-w-0 shrink-0 rounded-xl border border-slate-800 bg-slate-950/50 px-2.5 py-2">
                  <div className="flex items-start gap-1">
                    <h3 className="min-w-0 flex-1 truncate pt-0.5 text-sm font-medium text-slate-100">{parts.title || 'Announcement'}</h3>
                    {isOfficer && (
                      <div className="flex shrink-0">
                        <button type="button" aria-label="Edit announcement" onClick={() => openEdit(item)} className="rounded-md p-1 text-slate-400 hover:text-white cursor-pointer">
                          <Pencil size={13} />
                        </button>
                        <button type="button" aria-label="Delete announcement" disabled={saving} onClick={() => removePost(item)} className="rounded-md p-1 text-slate-400 hover:text-rose-300 disabled:opacity-40 cursor-pointer">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                  {parts.body && (
                    <DriftingMessage text={parts.body} />
                  )}
                  <p className="mt-1.5 truncate text-right text-[10px] font-normal text-slate-500" title={item.authorName}>{item.authorName}</p>
                </article>
              );
            })}
          </div>
        )}
        {boardQuery.error && !error && (
          <p className="px-3 pb-2 text-[10px] text-rose-400">{boardQuery.error.message}</p>
        )}
      </div>
    </Card>
  );
}

export default function WelcomePage({ user }) {
  const [params, setParams] = useSearchParams();
  const isOfficer = user?.isOfficer === true;
  const requestedMember = params.get('member') || '';
  const targetUid = isOfficer && requestedMember ? requestedMember : user?.id;
  const isSelf = !requestedMember || String(requestedMember) === String(user?.id) || !isOfficer;
  const profileQuery = useProfile(targetUid, { isSelf: String(targetUid) === String(user?.id), enabled: Boolean(targetUid) });
  const statsQuery = useMemberAuctionStats(targetUid, { enabled: Boolean(targetUid) });
  const winQuery = useWinRate();
  const rosterQuery = useMembers('card', { enabled: isOfficer });
  const settingsQuery = useSettings('timezone');
  const meQuery = useAttendanceMe();
  const timezone = settingsQuery.data?.timezone || DEFAULT_TZ;
  const weekMonday = getWeekMonday(timezone);
  const weekQuery = useWeekInstances(weekMonday);
  const commitQuery = useCommitments(weekQuery.data?.weekMonday || weekMonday);
  const member = profileQuery.data?.member || null;
  const jobsCatalog = profileQuery.data?.config?.jobs || {};
  const rolesCatalog = profileQuery.data?.config?.roles || {};
  const job = member ? jobsCatalog[member.jobCode] : null;
  const role = member ? rolesCatalog[member.roleCode] : null;
  const credits = member && Number.isInteger(member.leaveCreditsRemaining) ? member.leaveCreditsRemaining : 0;
  const noConfirms = member ? (parseInt(member.noConfirmCount, 10) || 0) : 0;
  const myCredits = Number.isInteger(meQuery.data?.leaveCreditsRemaining) ? meQuery.data.leaveCreditsRemaining : null;
  const auction = statsQuery.data || { totalItemsAcquired: 0, items: [] };
  const win = winQuery.data;
  const [memberSearch, setMemberSearch] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const [rsvpKey, setRsvpKey] = useState('');
  const [weekError, setWeekError] = useState('');

  const memberSearchResults = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return [];
    return Object.entries(rosterQuery.data || {})
      .map(([uid, profile]) => ({
        uid,
        displayName: profile.displayName || profile.username || uid,
      }))
      .filter((row) => row.displayName.toLowerCase().includes(q))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
      .slice(0, 8);
  }, [rosterQuery.data, memberSearch]);

  const weekRows = useMemo(() => {
    const instances = weekQuery.data?.instances || {};
    return Object.values(instances)
      .filter((item) => item && item.isCancelled !== true)
      .map((item) => ({
        id: item.eventId,
        title: item.title || 'Event',
        dateStr: item.date,
        timeStart: item.timeStart || '20:55',
        timeEnd: item.timeEnd || '22:15',
      }))
      .filter((item) => item.dateStr && item.id)
      .sort((a, b) => a.dateStr.localeCompare(b.dateStr) || a.timeStart.localeCompare(b.timeStart));
  }, [weekQuery.data]);

  const selectMember = (uid) => {
    setMemberSearch('');
    const next = new URLSearchParams(params);
    if (!uid || String(uid) === String(user?.id)) next.delete('member');
    else next.set('member', uid);
    setParams(next, { replace: true });
  };

  const adjustCredits = async (delta) => {
    if (!isOfficer || !targetUid || adjusting) return;
    setAdjusting(true);
    try {
      const res = await apiFetch(`/api/attendance/members/${encodeURIComponent(targetUid)}/leave-credits`, {
        method: 'POST',
        body: JSON.stringify({ delta }),
      });
      const data = await res.json();
      if (!data.success) {
        setWeekError(data.error || 'Failed to adjust leave credits.');
        return;
      }
      queryClient.setQueryData(queryKeys.profile(targetUid), (prev) => (
        prev ? { ...prev, member: { ...prev.member, leaveCreditsRemaining: data.leaveCreditsRemaining } } : prev
      ));
      await invalidateMembers();
      if (String(targetUid) === String(user?.id)) await invalidateAttendanceMe();
    } catch (err) {
      setWeekError(err.message);
    } finally {
      setAdjusting(false);
    }
  };

  const commit = async (item, nextStatus) => {
    const key = buildCompositeKey(item.dateStr, item.id);
    setRsvpKey(key + nextStatus);
    setWeekError('');
    try {
      const res = await apiFetch('/api/attendance/commit-availability', {
        method: 'POST',
        body: JSON.stringify({ dateStr: item.dateStr, eventId: item.id, status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setWeekError(data.error || 'Could not update attendance.');
        return;
      }
      await Promise.all([invalidateCommitments(), invalidateAttendanceMe()]);
    } catch (err) {
      setWeekError(err.message || 'Could not update attendance.');
    } finally {
      setRsvpKey('');
    }
  };

  const viewedName = member?.displayName || 'Raider';
  const roleLine = [job?.name, role?.name].filter(Boolean).join(' · ');

  return (
    <div className="flex flex-col gap-3 font-sans lg:h-[calc(100dvh-9.25rem)] lg:overflow-hidden">
      <Band label="General" className="shrink-0">
        <div className="grid grid-cols-1 gap-3 lg:h-[12.5rem] lg:grid-cols-[16rem_minmax(0,1.2fr)_minmax(16.5rem,22rem)]">
          <Card
            className="h-[12.5rem] lg:h-full"
            title="Profile"
            action={isOfficer ? (
              <div className="relative w-32">
                <input
                  type="text"
                  value={memberSearch}
                  onChange={(event) => setMemberSearch(event.target.value)}
                  placeholder="Member"
                  className="h-7 w-full rounded-lg border border-slate-800 bg-slate-950 py-0 pl-7 pr-2 text-[11px] font-normal text-slate-200 outline-none"
                />
                <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                {memberSearchResults.length > 0 && (
                  <div className="absolute right-0 z-30 mt-1 max-h-48 w-52 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 shadow-xl">
                    {memberSearchResults.map((row) => (
                      <button key={row.uid} type="button" onClick={() => selectMember(row.uid)} className="block w-full truncate px-2 py-1.5 text-left text-[11px] font-normal text-slate-300 hover:bg-slate-900 hover:text-white cursor-pointer">
                        {row.displayName}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          >
            <div className="flex h-full flex-col gap-3 p-3">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-800 bg-slate-950 text-slate-400">
                  {job?.iconFile ? (
                    <img src={`/assets/icons/classes/${job.iconFile}`} alt="" className="h-6 w-6 object-contain" onError={(event) => { event.target.style.display = 'none'; }} />
                  ) : (
                    <User size={18} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-medium text-slate-100">{viewedName}</h3>
                    {!isSelf && (
                      <button type="button" onClick={() => selectMember(user?.id)} className="shrink-0 text-[11px] font-normal text-slate-400 hover:text-slate-200 cursor-pointer">
                        Me
                      </button>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[12px] font-normal text-slate-400">{roleLine || '—'}</p>
                  <p className="truncate font-mono text-[10px] font-normal text-slate-500" title={targetUid || ''}>{targetUid}</p>
                </div>
              </div>
              <div className="mt-auto grid grid-cols-2">
                <div className="flex min-w-0 flex-col items-center">
                  <div className="truncate text-[10px] font-normal uppercase tracking-wider text-slate-500">Leave credits</div>
                  <div className="mt-1 flex h-6 items-center justify-center gap-1">
                    <span className={`text-lg font-medium tabular-nums leading-none ${credits <= 0 ? 'text-rose-400' : 'text-slate-100'}`}>{credits}</span>
                    {isOfficer && (
                      <>
                        <button type="button" disabled={adjusting || credits <= 0} onClick={() => adjustCredits(-1)} className="rounded-md border border-slate-800 p-1 text-slate-400 hover:text-rose-400 disabled:opacity-30 cursor-pointer" aria-label="Take 1 credit"><Minus size={12} /></button>
                        <button type="button" disabled={adjusting} onClick={() => adjustCredits(1)} className="rounded-md border border-slate-800 p-1 text-slate-400 hover:text-emerald-400 disabled:opacity-30 cursor-pointer" aria-label="Give 1 credit"><Plus size={12} /></button>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex min-w-0 flex-col items-center">
                  <div className="truncate text-[10px] font-normal uppercase tracking-wider text-slate-500">No confirm</div>
                  <div className="mt-1 flex h-6 items-center justify-center">
                    <span className={`text-lg font-medium tabular-nums leading-none ${noConfirms > 0 ? 'text-amber-400' : 'text-slate-100'}`}>{noConfirms}</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
          <WelcomeBoard user={user} />
          <WelcomePeak />
        </div>
      </Band>

      <Band label="GvG" className="min-h-0 flex-1">
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[2fr_3fr]">
          <div className="flex min-h-0 min-w-0 flex-col gap-2 lg:h-full">
            <div className="grid grid-cols-3 items-stretch gap-2">
              <GvgStat icon={Percent} label="Win Rate" value={win?.percent == null ? '' : `${win.percent}%`} />
              <GvgStat icon={Swords} label="League Matches" value={win?.league ? String(win.league) : ''} />
              <GvgStat icon={History} label="Previous Match" value={win?.previous || ''} valueClassName={gvgResultClass(win?.previous)} />
            </div>
            <Card className="min-w-0 lg:min-h-0 lg:flex-1" bodyClassName="lg:min-h-0 lg:flex-1 lg:overflow-hidden" title="Guild Events">
            <div className="flex gap-3 overflow-x-auto p-3 lg:h-full lg:overflow-y-auto">
              {weekError && <p className="self-center px-1 text-xs text-rose-400">{weekError}</p>}
              {weekRows.length === 0 && (
                <p className="self-center px-1 text-sm font-normal text-slate-500">No events this week.</p>
              )}
              {weekRows.map((item) => {
                const compositeKey = buildCompositeKey(item.dateStr, item.id);
                const status = commitmentStatus(commitQuery.data, compositeKey, targetUid);
                const counts = headcount(commitQuery.data, compositeKey);
                const locked = pastDeadline(item, timezone);
                const leaveLocked = Number.isInteger(myCredits) && myCredits <= 0 && status !== 'Leave';
                const dateParts = eventDateParts(item.dateStr);
                const edge = status === 'Confirmed'
                  ? 'border-emerald-500'
                  : status === 'Leave'
                    ? 'border-rose-500'
                    : 'border-slate-800';
                return (
                  <div key={compositeKey} className={`flex w-[15rem] shrink-0 flex-col rounded-xl border bg-slate-950/40 px-3 py-3 lg:min-h-full ${edge}`}>
                    <p className="text-xs font-normal uppercase tracking-wider text-slate-500">{dateParts.weekday}</p>
                    <div className="flex flex-1 flex-col justify-center">
                      <p className="text-4xl font-medium leading-none text-slate-100">{dateParts.day}</p>
                      <p className="mt-2 line-clamp-2 text-sm font-normal text-slate-200">{item.title}</p>
                      <p className="mt-1 font-mono text-xs font-normal text-slate-500">{item.timeStart}–{item.timeEnd}</p>
                    </div>
                    <div className="mt-auto flex shrink-0 items-center gap-3 pt-3">
                      <span className="inline-flex items-center gap-1 text-emerald-400" title="Present">
                        <Users size={16} />
                        <span className="text-sm font-normal tabular-nums">{counts.present}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 text-rose-400" title="Leave">
                        <Users size={16} />
                        <span className="text-sm font-normal tabular-nums">{counts.leave}</span>
                      </span>
                      {isSelf && (
                        <span className="ml-auto flex items-center gap-1.5">
                          <button
                            type="button"
                            aria-label="Confirm"
                            disabled={locked || Boolean(rsvpKey)}
                            onClick={() => commit(item, status === 'Confirmed' ? 'None' : 'Confirmed')}
                            className={`rounded-md border p-1.5 cursor-pointer disabled:opacity-40 ${status === 'Confirmed' ? 'border-emerald-500 text-emerald-400' : 'border-slate-800 text-slate-500'}`}
                          >
                            <Check size={16} />
                          </button>
                          <button
                            type="button"
                            aria-label="Leave"
                            disabled={locked || leaveLocked || Boolean(rsvpKey)}
                            onClick={() => commit(item, status === 'Leave' ? 'None' : 'Leave')}
                            className={`rounded-md border p-1.5 cursor-pointer disabled:opacity-40 ${status === 'Leave' ? 'border-rose-500 text-rose-400' : 'border-slate-800 text-slate-500'}`}
                          >
                            <X size={16} />
                          </button>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
            <div className="shrink-0">
              <div className="mb-1.5 text-[10px] font-normal uppercase tracking-widest text-slate-500">Auction Bid History</div>
              <div className="flex gap-2 overflow-x-auto">
                {auction.items?.length ? auction.items.map((item) => {
                  const theme = chipTheme(item.colorTheme);
                  const name = item.name || item.itemId;
                  const quantity = item.quantity || 0;
                  return (
                    <div
                      key={item.itemId}
                      title={`${name} × ${quantity}`}
                      className={`flex h-[4.75rem] w-[4.75rem] shrink-0 flex-col items-center justify-center rounded-xl border px-1.5 text-center ${theme.className}`}
                      style={theme.style}
                    >
                      <span className="text-lg font-medium tabular-nums leading-none">{quantity}</span>
                      <span className="mt-1 line-clamp-2 text-[10px] font-normal leading-tight">{name}</span>
                    </div>
                  );
                }) : (
                  <span className="text-[11px] font-normal text-slate-500">No bid history yet</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex h-full min-h-[16rem] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40">
            <StatisticsTab
              user={user}
              embedded
              compact
              lockedMemberUid={targetUid}
              lockedMemberName={viewedName}
            />
          </div>
        </div>
      </Band>
    </div>
  );
}

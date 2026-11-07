import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Globe, History, Minus, Percent, Plus, Search, Swords, User, Users, X } from 'lucide-react';
import { apiFetch } from '../../../services/apiClient';
import { queryClient } from '../../../query/client';
import {
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
import AnnouncementFeed from '../components/AnnouncementFeed';
import { buildCompositeKey, DEFAULT_TZ, getWeekMonday, guildWallTimeToUtcMs } from '../../../utils/guildTime';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
function gvgResultClass(value) {
  if (value === 'Win') return 'text-emerald-300';
  if (value === 'Lose') return 'text-rose-300';
  if (value) return 'text-amber-200';
  return 'text-slate-100';
}

function GvgStat({ icon: Icon, label, value, valueClassName = 'text-slate-100' }) {
  const shown = value || '—';
  return (
    <div className="flex h-full min-w-0 flex-col items-center rounded-xl border border-slate-800 bg-slate-950/40 px-2 pt-2 pb-2.5 text-center" title={label} aria-label={value ? `${label} ${value}` : label}>
      <span className="flex w-full items-center justify-center gap-1.5 text-[10px] font-normal uppercase leading-tight tracking-wider text-slate-500">
        <Icon size={14} className="shrink-0" aria-hidden="true" />
        {label}
      </span>
      <span className={`mt-2 flex h-8 w-full items-center justify-center text-2xl font-medium uppercase tabular-nums leading-none ${valueClassName}`}>{shown}</span>
    </div>
  );
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

function PeakLens({ x, y, dayKey, hour, hoursMap }) {
  const dayIndex = Math.max(0, DAY_KEYS.indexOf(dayKey));
  const days = [];
  for (let index = dayIndex - 1; index <= dayIndex + 1; index += 1) {
    if (index >= 0 && index < DAY_KEYS.length) days.push(index);
  }
  const hourStart = Math.max(0, hour - 2);
  const hourEnd = Math.min(23, hour + 2);
  const hourList = [];
  for (let slot = hourStart; slot <= hourEnd; slot += 1) hourList.push(slot);
  const width = 32 + hourList.length * 32;
  let left = x - width / 2;
  let top = y - 28 - (36 + days.length * 32);
  left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
  if (top < 8) top = y + 28;

  return (
    <div className="pointer-events-none fixed z-[80]" style={{ left, top }} aria-hidden="true">
      <div className="rounded-2xl border border-slate-500 bg-slate-950/95 p-2 shadow-2xl">
        <div className="grid items-center gap-1" style={{ gridTemplateColumns: `2rem repeat(${hourList.length}, 1.75rem)` }}>
          <div />
          {hourList.map((slot) => (
            <div key={slot} className={`text-center font-mono text-[11px] leading-none ${slot === hour ? 'font-bold text-white' : 'text-slate-500'}`}>
              {String(slot).padStart(2, '0')}
            </div>
          ))}
          {days.map((index) => {
            const key = DAY_KEYS[index];
            return (
              <Fragment key={key}>
                <div className={`font-mono text-[11px] leading-none ${key === dayKey ? 'font-bold text-white' : 'text-slate-500'}`}>{DAY_SHORT[index]}</div>
                {hourList.map((slot) => {
                  const on = (hoursMap[key] || []).includes(slot);
                  const active = key === dayKey && slot === hour;
                  return (
                    <div key={slot} className={`h-7 w-7 rounded-md ${on ? 'bg-emerald-500' : 'bg-slate-900'} ${active ? 'ring-2 ring-white' : ''}`} />
                  );
                })}
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
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
  const [lens, setLens] = useState(null);
  const clearLensRef = useRef(() => {});
  clearLensRef.current = () => setLens(null);
  const heatmap = Array.isArray(data?.heatmap) ? data.heatmap : [];
  const peak = data?.peak || null;

  useEffect(() => {
    if (!data) return;
    setHours(hoursFromMine(data.mine || null));
  }, [data]);

  useEffect(() => {
    const stopPaint = () => {
      paintRef.current = null;
      clearLensRef.current();
    };
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

  const cellFromPoint = (event) => {
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const cell = hit?.closest?.('[data-peak-cell]');
    if (!cell) return null;
    const dayKey = cell.getAttribute('data-day');
    const hourText = cell.getAttribute('data-hour');
    const hour = Number(hourText);
    if (!dayKey || hourText == null || !Number.isInteger(hour)) return null;
    return { dayKey, hour };
  };

  const showLens = (event, dayKey, hour) => {
    if (event.pointerType !== 'touch') return;
    setLens({ x: event.clientX, y: event.clientY, dayKey, hour });
  };

  const startPaint = (event) => {
    const cell = event.target?.closest?.('[data-peak-cell]');
    if (!cell) return;
    const dayKey = cell.getAttribute('data-day');
    const hour = Number(cell.getAttribute('data-hour'));
    if (!dayKey || !Number.isInteger(hour)) return;
    event.preventDefault();
    const nextOn = cell.getAttribute('data-on') !== 'true';
    paintRef.current = { on: nextOn, last: `${dayKey}-${hour}` };
    setCell(dayKey, hour, nextOn);
    showLens(event, dayKey, hour);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* pointer already released */
    }
  };

  const paintAt = (event) => {
    const paint = paintRef.current;
    if (!paint) return;
    const cell = cellFromPoint(event);
    if (!cell) return;
    showLens(event, cell.dayKey, cell.hour);
    const mark = `${cell.dayKey}-${cell.hour}`;
    if (paint.last === mark) return;
    paint.last = mark;
    setCell(cell.dayKey, cell.hour, paint.on);
  };

  const stopPaint = (event) => {
    paintRef.current = null;
    setLens(null);
    if (event?.currentTarget?.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
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
    <>
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
        <div
          className={`mx-auto mt-1 grid min-h-0 w-full max-w-[26rem] flex-1 grid-rows-7 gap-0.5 ${mode === 'mine' ? 'touch-none' : ''}`}
          onPointerDown={mode === 'mine' ? startPaint : undefined}
          onPointerMove={mode === 'mine' ? paintAt : undefined}
          onPointerUp={stopPaint}
          onPointerCancel={stopPaint}
        >
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
                      data-peak-cell=""
                      data-day={key}
                      data-hour={hour}
                      data-on={on ? 'true' : 'false'}
                      aria-label={`${DAY_SHORT[dayIndex]} ${String(hour).padStart(2, '0')}:00`}
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
    {lens && mode === 'mine' && (
      <PeakLens x={lens.x} y={lens.y} dayKey={lens.dayKey} hour={lens.hour} hoursMap={hours} />
    )}
    </>
  );
}

function WelcomeBoard({ timezone }) {
  const boardQuery = useAnnouncements();

  return (
    <Card className="h-[12.5rem] lg:h-full" title="General announcements">
      <div className="flex h-full min-h-0 flex-col p-2">
        <AnnouncementFeed
          posts={boardQuery.data?.announcements || []}
          unmapped={boardQuery.data?.unmapped === true}
          pending={boardQuery.isPending}
          error={boardQuery.error?.message || ''}
          timezone={timezone}
        />
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
          <WelcomeBoard timezone={timezone} />
          <WelcomePeak />
        </div>
      </Band>

      <Band label="GvG" className="min-h-0 flex-1">
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[2fr_3fr]">
          <div className="flex min-h-0 min-w-0 flex-col gap-2 lg:h-full">
            <div className="grid grid-cols-3 items-stretch gap-2">
              <GvgStat icon={Percent} label="Win Rate" value={win?.percent == null ? '' : `${win.percent}%`} />
              <GvgStat icon={Swords} label="Matches" value={win?.league ? String(win.league) : ''} />
              <GvgStat icon={History} label="Last Match" value={win?.previous || ''} valueClassName={gvgResultClass(win?.previous)} />
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

import { keepPreviousData } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Image, ScanLine, Search, User, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  cohortStatAverage,
  formatDelta,
  formatStatValue,
  labelsMatch,
  parseStatKeywordList,
  SHOT_KINDS,
  SHOT_LABELS,
} from '@guildname/shared/gvgStatSheet';
import { apiFetch } from '../../../services/apiClient';
import { invalidateGvgStatProgression, useGvgStatProgression, useMembers, useSettings } from '../../../query/hooks';
import { getGuildTodayDateStr } from '../../../utils/guildTime';

const SHOT_HINTS = {
  general: 'Details tab, General Stats open. This shot includes STR through LUK.',
  quasi: 'Details tab, Quasi-Stats open.',
};

const COLUMN_LABEL = {
  left: 'Left',
  right: 'Right',
  stats: 'Stats',
  bonus: 'Bonus',
};

const controlClass = 'box-border h-8 rounded-xl border border-slate-800 bg-slate-950 px-2.5 text-xs text-slate-100 outline-none scheme-dark focus:border-slate-600';
const labelClass = 'mb-1.5 block text-[11px] font-medium text-slate-400';
const cardClass = 'flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40';
const cardHeader = 'flex h-10 shrink-0 items-center justify-between gap-2 border-b border-slate-800/80 px-3';
const cardTitle = 'shrink-0 text-[10px] font-normal uppercase tracking-wider text-slate-400';
const cardBody = 'p-5';
const primaryButton = 'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 text-[11px] font-bold uppercase tracking-wider text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40';
const quietButton = 'inline-flex h-8 shrink-0 items-center gap-1 rounded-xl border border-slate-800 bg-slate-950 px-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-200 hover:border-slate-600 disabled:opacity-40';
const generalTone = 'border border-emerald-400/80 bg-emerald-950 text-emerald-300 shadow-[0_0_14px_rgba(16,185,129,0.45)] [text-shadow:0_0_8px_rgba(52,211,153,0.85)]';
const quasiTone = 'border border-blue-400/80 bg-blue-950 text-blue-300 shadow-[0_0_14px_rgba(59,130,246,0.5)] [text-shadow:0_0_8px_rgba(96,165,250,0.85)]';

function reviewNote(row) {
  const parts = [];
  if (row.flag === 'conflict') parts.push(`Conflict: ${(row.alts || []).join(', ')}`);
  if (row.flag === 'unreadable') parts.push('Unreadable');
  if (row.flag === 'out_of_range') parts.push('Check this number');
  if (row.ocrLabel && row.ocrLabel !== row.label) parts.push(`Read as ${row.ocrLabel}`);
  return parts.join(' · ');
}

function monthBounds(day) {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(day || ''));
  if (!match) return { from: '', to: '' };
  const last = new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).getUTCDate();
  return {
    from: `${match[1]}-${match[2]}-01`,
    to: `${match[1]}-${match[2]}-${String(last).padStart(2, '0')}`,
  };
}

function catalogName(catalog, code) {
  return catalog?.[code]?.name || code || '';
}

function keywordColumn(readings, section, column, source) {
  const keywords = parseStatKeywordList(source);
  const cells = keywords.map((label) => ({
    label,
    reading: (readings || []).find((row) => row.section === section && row.column === column && labelsMatch(row.label, label)) || null,
  }));
  for (const row of readings || []) {
    if (row.section !== section || row.column !== column) continue;
    if (cells.some((cell) => labelsMatch(cell.label, row.label))) continue;
    cells.push({ label: row.label, reading: row });
  }
  return cells;
}

const SHEET_COLOR = '#818cf8';
const GROUP_COLOR = '#f59e0b';

function axisTick(value, unit) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  const text = Math.abs(number) >= 1000 ? number.toLocaleString() : String(number);
  return unit === 'percent' ? `${text}%` : text;
}

function AnalysisNote({ note, noteClass }) {
  return (
    <div className="border-t border-slate-800 pt-3">
      <p className={cardTitle}>Analysis</p>
      <p className={`mt-1.5 ${noteClass}`}>{note}</p>
    </div>
  );
}

function formatAnalysisGap(delta, unit) {
  const rounded = Math.round(Number(delta) * 100) / 100;
  const sign = rounded > 0 ? '+' : '';
  const text = `${sign}${rounded.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return unit === 'percent' ? `${text}%` : text;
}

function CompareBars({ memberName, memberValue, average, count, unit, peerLabel, statLabel }) {
  const who = memberName || 'This member';
  const peers = peerLabel || 'Same job and role';
  const stat = statLabel || 'this stat';
  const hasMember = memberValue != null && !Number.isNaN(memberValue);
  const hasGroup = count >= 2 && average != null && !Number.isNaN(average);
  if (!hasMember && !hasGroup) {
    return <AnalysisNote note={`No ${peers} sheet in this range has ${stat}.`} noteClass="text-xs text-slate-400" />;
  }
  const data = [
    { name: who, value: hasMember ? memberValue : null, fill: SHEET_COLOR },
    { name: peers, value: hasGroup ? average : null, fill: GROUP_COLOR },
  ];
  const samples = data.map((row) => row.value).filter((value) => value != null);
  const gap = hasMember && hasGroup ? Math.round((memberValue - average) * 100) / 100 : null;
  let note = `No ${peers} sheet in this range has ${stat}.`;
  let noteClass = 'text-xs text-slate-400';
  if (gap != null) {
    note = gap === 0
      ? `${who}'s ${stat} is the same as the ${peers} average.`
      : `${who}'s ${stat} is ${formatAnalysisGap(gap, unit)} ${gap > 0 ? 'above' : 'below'} the ${peers} average.`;
    noteClass = `text-xs font-medium ${gap > 0 ? 'text-emerald-400' : gap < 0 ? 'text-rose-400' : 'text-slate-400'}`;
  } else if (count === 1) {
    note = `Only one ${peers} sheet in this range has ${stat}, so there is no average.`;
  }
  return (
    <div className="space-y-2">
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 8 }}>
            <CartesianGrid stroke="#334155" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#475569' }} tickLine={{ stroke: '#475569' }} interval={0} />
            <YAxis
              domain={[Math.min(0, ...samples), 'auto']}
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              axisLine={{ stroke: '#475569' }}
              tickLine={{ stroke: '#475569' }}
              width={56}
              tickFormatter={(value) => axisTick(value, unit)}
            />
            <Tooltip
              cursor={{ fill: 'rgba(148,163,184,0.08)' }}
              contentStyle={{ background: '#020617', border: '1px solid #334155', borderRadius: 8, fontSize: 12, color: '#f8fafc' }}
              formatter={(value, _name, item) => [axisTick(value, unit), item?.payload?.name || '']}
            />
            <Bar dataKey="value" legendType="none" radius={[4, 4, 0, 0]} maxBarSize={48}>
              {data.map((row) => <Cell key={row.name} fill={row.fill} />)}
            </Bar>
            {hasGroup ? (
              <ReferenceLine
                y={average}
                stroke={GROUP_COLOR}
                strokeDasharray="5 4"
                strokeWidth={1.5}
                ifOverflow="extendDomain"
              />
            ) : null}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <AnalysisNote note={note} noteClass={noteClass} />
    </div>
  );
}

function ShotPicker({ kind, file, inputKey, onFile }) {
  const inputRef = useRef(null);
  return (
    <>
      <button
        type="button"
        title={SHOT_HINTS[kind]}
        onClick={() => inputRef.current?.click()}
        className={`${controlClass} inline-flex w-full items-center gap-1.5 text-left ${
          file ? 'border-slate-500 text-slate-50' : 'text-slate-300 hover:border-slate-600'
        }`}
      >
        <Image size={14} className="shrink-0 text-slate-400" />
        <span className="truncate">{file ? file.name : 'Select file'}</span>
      </button>
      <input
        key={`${kind}-${inputKey}`}
        ref={inputRef}
        type="file"
        accept="image/*"
        aria-label={`${SHOT_LABELS[kind]} screenshot`}
        className="hidden"
        onChange={(event) => onFile(event.target.files?.[0] || null)}
      />
    </>
  );
}

function sameStat(stat, section, column, label) {
  return Boolean(stat)
    && stat.section === section
    && stat.column === column
    && labelsMatch(stat.label, label);
}

function StatButton({ cell, section, column, deltas, selected, preview, onSelect, onPreview }) {
  if (!cell) return <div />;
  const reading = cell.reading;
  const delta = reading ? deltas?.[reading.key] : null;
  const change = reading ? formatDelta(delta, reading.unit) : '';
  const pinned = sameStat(selected, section, column, cell.label);
  const hot = sameStat(preview, section, column, cell.label);
  return (
    <button
      type="button"
      onMouseEnter={() => onPreview({ section, column, label: cell.label })}
      onClick={() => onSelect({ section, column, label: cell.label })}
      className={`flex min-h-9 w-full items-center justify-between gap-3 px-2.5 py-1.5 text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-400/40 ${
        hot ? 'bg-indigo-600/25' : pinned ? 'bg-indigo-950/50' : ''
      }`}
    >
      <span className="truncate text-sm text-slate-300">{cell.label}</span>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-50">
        {reading ? formatStatValue(reading) : ''}
        {change ? <span className={`ml-1 ${delta > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{change}</span> : null}
      </span>
    </button>
  );
}

function confidenceTone(confidence) {
  if (confidence >= 85) return 'text-emerald-400';
  if (confidence >= 70) return 'text-amber-400';
  return 'text-rose-400';
}

function recognitionConfidence(reading) {
  const number = Number(reading?.confidence);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function ReviewCell({ cell, readings, onChange }) {
  if (!cell) return <div />;
  const index = cell.reading ? readings.findIndex((row) => row.key === cell.reading.key) : -1;
  const note = cell.reading ? reviewNote(cell.reading) : '';
  const confidence = recognitionConfidence(cell.reading);
  return (
    <div className={`flex min-h-7 items-center justify-between gap-2 px-2 py-0.5 ${note ? 'bg-amber-950/30' : ''}`} title={note || undefined}>
      <span className="flex min-w-0 flex-1 items-center gap-1">
      {confidence != null ? (
        <span
          className={`inline-block shrink-0 origin-left font-normal tabular-nums leading-none ${confidenceTone(confidence)}`}
          style={{ fontSize: '10px', zoom: 0.5 }}
        >({confidence}%)</span>
      ) : null}
      <input
        value={cell.reading ? cell.reading.label : cell.label}
        disabled={index < 0}
        onChange={(event) => onChange(index, { label: event.target.value })}
        className="min-w-0 flex-1 truncate bg-transparent text-xs text-slate-300 outline-none"
      />
      </span>
      <input
        value={cell.reading ? cell.reading.raw : ''}
        disabled={index < 0}
        onChange={(event) => onChange(index, { raw: event.target.value })}
        className={`w-16 shrink-0 bg-transparent text-right text-xs font-semibold tabular-nums outline-none ${note ? 'text-amber-300' : 'text-slate-50'}`}
      />
    </div>
  );
}

function ReviewColumns({ left, right, readings, onChange, section }) {
  const count = Math.max(left.length, right.length);
  const quasi = section === 'quasi';
  return (
    <div className={`divide-y overflow-hidden rounded-lg border ${quasi ? 'divide-blue-500/25 border-blue-500/30' : 'divide-emerald-500/25 border-emerald-500/30'}`}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="grid grid-cols-2">
          <ReviewCell cell={left[index]} readings={readings} onChange={onChange} />
          <ReviewCell cell={right[index]} readings={readings} onChange={onChange} />
        </div>
      ))}
    </div>
  );
}

function StatColumns({ left, right, section, deltas, selected, preview, onSelect, onPreview }) {
  const count = Math.max(left.length, right.length);
  const quasi = section === 'quasi';
  return (
    <div className={`divide-y overflow-hidden rounded-lg border ${quasi ? 'divide-blue-500/25 border-blue-500/30' : 'divide-emerald-500/25 border-emerald-500/30'}`}>
      {Array.from({ length: count }, (_, index) => (
        <div key={`${section}-${index}`} className="grid grid-cols-2">
          <StatButton cell={left[index]} section={section} column="left" deltas={deltas} selected={selected} preview={preview} onSelect={onSelect} onPreview={onPreview} />
          <StatButton cell={right[index]} section={section} column="right" deltas={deltas} selected={selected} preview={preview} onSelect={onSelect} onPreview={onPreview} />
        </div>
      ))}
    </div>
  );
}

export default function GvgStatsTab() {
  const membersQuery = useMembers('list');
  const settingsQuery = useSettings();
  const jobs = settingsQuery.data?.jobs || {};
  const roles = settingsQuery.data?.roles || {};
  const [query, setQuery] = useState('');
  const [searchNote, setSearchNote] = useState('');
  const [memberUid, setMemberUid] = useState('');
  const [uploadUid, setUploadUid] = useState('');
  const [capturedAt, setCapturedAt] = useState(() => getGuildTodayDateStr());
  const [files, setFiles] = useState({});
  const [formKey, setFormKey] = useState(0);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [pickedDay, setPickedDay] = useState('');
  const [filters, setFilters] = useState({ jobCode: '', roleCode: '', pinned: false });
  const [compare, setCompare] = useState({ jobCode: '', roleCode: '', from: '', to: '', pinned: false });
  const [selectedStat, setSelectedStat] = useState(null);

  const members = membersQuery.data || {};
  const classFor = (uid, jobCode, roleCode) => {
    const member = members[uid] || {};
    return {
      jobCode: String(jobCode || member.jobCode || '').trim(),
      roleCode: String(roleCode || member.roleCode || '').trim(),
    };
  };
  const progressionQuery = useGvgStatProgression(memberUid);
  const cohortQuery = useGvgStatProgression(memberUid, {
    jobCode: compare.jobCode,
    roleCode: compare.roleCode,
    capturedAt: compare.to,
    from: compare.from,
  }, { placeholderData: keepPreviousData });

  const openMember = (row) => {
    setMemberUid(row.uid);
    if (members[row.uid]?.isRaidRoster === true) setUploadUid(row.uid);
    setQuery(row.displayName);
    setSearchNote('');
    setDraft(null);
    setPickedDay('');
    setFilters({ jobCode: '', roleCode: '', pinned: false });
    setCompare({ jobCode: '', roleCode: '', from: '', to: '', pinned: false });
    setSelectedStat(null);
  };

  const nameSuggestions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const selectedName = String(members[memberUid]?.displayName || members[memberUid]?.inGameName || '').toLowerCase();
    if (selectedName && selectedName === needle) return [];
    return Object.entries(members)
      .map(([uid, member]) => ({
        uid,
        displayName: member?.displayName || member?.inGameName || uid,
        inGameName: member?.inGameName || '',
        jobCode: member?.jobCode || '',
        roleCode: member?.roleCode || '',
      }))
      .filter((row) => {
        if (filters.jobCode && row.jobCode !== filters.jobCode) return false;
        if (filters.roleCode && row.roleCode !== filters.roleCode) return false;
        return `${row.displayName} ${row.inGameName}`.toLowerCase().includes(needle);
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
      .slice(0, 8);
  }, [members, memberUid, query, filters.jobCode, filters.roleCode]);

  const runSearch = (event) => {
    event.preventDefault();
    const needle = query.trim().toLowerCase();
    const found = Object.entries(members)
      .map(([uid, member]) => ({
        uid,
        displayName: member?.displayName || member?.inGameName || uid,
        inGameName: member?.inGameName || '',
        jobCode: member?.jobCode || '',
        roleCode: member?.roleCode || '',
      }))
      .filter((row) => {
        if (filters.jobCode && row.jobCode !== filters.jobCode) return false;
        if (filters.roleCode && row.roleCode !== filters.roleCode) return false;
        if (!needle) return true;
        return `${row.displayName} ${row.inGameName}`.toLowerCase().includes(needle);
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
    if (found.length === 1) {
      openMember(found[0]);
      return;
    }
    setSearchNote(found.length ? '' : 'No member matches.');
  };

  const roster = useMemo(() => (
    Object.entries(members)
      .filter(([, member]) => member?.isRaidRoster === true)
      .map(([uid, member]) => ({
        uid,
        displayName: member?.displayName || member?.inGameName || uid,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
  ), [members]);

  const readSheet = async (event) => {
    event.preventDefault();
    if (!uploadUid) {
      setError('Choose a name under Upload Stats.');
      return;
    }
    const picked = SHOT_KINDS.filter((kind) => files[kind]);
    if (!picked.length) {
      setError('Add at least one Character screenshot.');
      return;
    }
    setBusy('read');
    setError('');
    try {
      const body = new FormData();
      body.append('memberUid', uploadUid);
      body.append('capturedAt', capturedAt);
      body.append('kinds', JSON.stringify(picked));
      picked.forEach((kind) => body.append('files', files[kind]));
      const res = await apiFetch('/api/gvg-stats/drafts', { method: 'POST', body });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Could not read the sheet.');
      const member = members[uploadUid] || {};
      setDraft({
        ...data.draft,
        memberUid: uploadUid,
        jobCode: member.jobCode || '',
        roleCode: member.roleCode || '',
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const updateReading = (index, patch) => {
    setDraft((current) => {
      if (!current) return current;
      const readings = current.readings.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        const next = { ...row, ...patch };
        if (Object.prototype.hasOwnProperty.call(patch, 'raw')) next.flag = '';
        if (Object.prototype.hasOwnProperty.call(patch, 'label')) next.ocrLabel = '';
        return next;
      });
      return { ...current, readings };
    });
  };

  const updateCharacter = (patch) => {
    setDraft((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      if (patch.memberUid && patch.memberUid !== current.memberUid) {
        const member = members[patch.memberUid] || {};
        next.jobCode = member.jobCode || '';
        next.roleCode = member.roleCode || '';
      }
      return next;
    });
  };

  const confirmSheet = async () => {
    if (!draft) return;
    setBusy('confirm');
    setError('');
    try {
      const savedUid = draft.memberUid || uploadUid;
      const savedClass = classFor(savedUid, draft.jobCode, draft.roleCode);
      const res = await apiFetch(`/api/gvg-stats/drafts/${encodeURIComponent(draft.id)}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          memberUid: savedUid,
          jobCode: savedClass.jobCode,
          roleCode: savedClass.roleCode,
          capturedAt,
          shareCode: draft.shareCode || '',
          readings: draft.readings,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Could not confirm the sheet.');
      const uploaded = roster.find((row) => row.uid === savedUid);
      const savedMember = members[savedUid] || {};
      setMemberUid(savedUid);
      setUploadUid(savedUid);
      setQuery(uploaded?.displayName || savedMember.displayName || savedMember.inGameName || '');
      setPickedDay('');
      setFilters({ jobCode: '', roleCode: '', pinned: false });
      setCompare({ jobCode: '', roleCode: '', from: '', to: '', pinned: false });
      setSelectedStat(null);
      setDraft(null);
      setFiles({});
      setFormKey((key) => key + 1);
      await invalidateGvgStatProgression(savedUid);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const series = progressionQuery.data?.series || [];
  const cohort = cohortQuery.data?.cohort || [];
  const reviewed = classFor(draft?.memberUid, draft?.jobCode, draft?.roleCode);

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-black uppercase tracking-wide text-slate-100">GVG Stats</h1>
      <div className="relative z-20 grid grid-cols-2 items-stretch gap-4">
      <form onSubmit={runSearch} className={`${cardClass} relative z-20 h-full min-w-0 !overflow-visible`}>
        <header className={cardHeader}>
          <h2 className={cardTitle}>Search</h2>
        </header>
        <div className={`${cardBody} flex min-h-0 flex-1 flex-col`}>
        <div className="grid grid-cols-3 gap-4">
          <label className="min-w-0">
            <span className={labelClass}>Name</span>
            <span className="relative block">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSearchNote('');
                }}
                placeholder="Search a member"
                className={`${controlClass} w-full pl-8`}
              />
              {nameSuggestions.length ? (
                <div className="absolute left-0 z-30 mt-1 max-h-56 w-56 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 shadow-xl">
                  {nameSuggestions.map((row) => (
                    <button
                      key={row.uid}
                      type="button"
                      onClick={() => openMember(row)}
                      className="block w-full truncate px-3 py-2 text-left text-xs font-semibold text-slate-300 hover:bg-slate-900 hover:text-white"
                    >
                      {row.displayName}
                    </button>
                  ))}
                </div>
              ) : null}
            </span>
          </label>
          <label className="min-w-0">
            <span className={labelClass}>Job</span>
            <select
              value={filters.jobCode}
              onChange={(event) => setFilters({ jobCode: event.target.value, roleCode: filters.roleCode, pinned: true })}
              className={`${controlClass} w-full`}
            >
              <option value="">Any</option>
              {catalogOptions(jobs, filters.jobCode).map((row) => (
                <option key={row.code} value={row.code}>{row.name}</option>
              ))}
            </select>
          </label>
          <label className="min-w-0">
            <span className={labelClass}>Role</span>
            <select
              value={filters.roleCode}
              onChange={(event) => setFilters({ jobCode: filters.jobCode, roleCode: event.target.value, pinned: true })}
              className={`${controlClass} w-full`}
            >
              <option value="">Any</option>
              {catalogOptions(roles, filters.roleCode).map((row) => (
                <option key={row.code} value={row.code}>{row.name}</option>
              ))}
            </select>
          </label>
        </div>
        {searchNote ? <p className="mt-3 text-sm text-slate-400">{searchNote}</p> : null}
        <div className="mt-auto flex justify-end pt-4">
          <button type="submit" className={primaryButton}>
            <Search size={14} />
            Search
          </button>
        </div>
        </div>
      </form>
      <form onSubmit={readSheet} className={`${cardClass} h-full min-w-0`}>
        <header className={cardHeader}>
          <h2 className={cardTitle}>Upload Stats</h2>
        </header>
        <div className={`${cardBody} flex min-h-0 flex-1 flex-col`}>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-4">
          <label className="min-w-0">
            <span className={labelClass}>Name</span>
            <span className="relative block">
              <User size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <select
                value={uploadUid}
                onChange={(event) => setUploadUid(event.target.value)}
                className={`${controlClass} w-full appearance-none pl-8 pr-8`}
              >
                <option value="">Choose a member</option>
                {roster.map((row) => (
                  <option key={row.uid} value={row.uid}>{row.displayName}</option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            </span>
          </label>
          <label className="min-w-0">
            <span className={labelClass}>Taken on</span>
            <input
              type="date"
              value={capturedAt}
              onChange={(event) => {
                setCapturedAt(event.target.value);
                event.target.blur();
              }}
              className={`${controlClass} w-full`}
            />
          </label>
          <span aria-hidden="true" />
          {SHOT_KINDS.map((kind) => (
            <label key={kind} className="min-w-0">
              <span className={`mb-1.5 block text-[11px] font-medium ${kind === 'quasi' ? 'text-blue-300 [text-shadow:0_0_8px_rgba(96,165,250,0.75)]' : 'text-emerald-300 [text-shadow:0_0_8px_rgba(52,211,153,0.75)]'}`}>{SHOT_LABELS[kind]}</span>
              <ShotPicker
                kind={kind}
                file={files[kind]}
                inputKey={formKey}
                onFile={(file) => setFiles((current) => ({ ...current, [kind]: file }))}
              />
            </label>
          ))}
          <button type="submit" disabled={busy === 'read'} className={primaryButton}>
            <ScanLine size={14} />
            <span className="grid">
              <span className="invisible col-start-1 row-start-1" aria-hidden="true">Reading</span>
              <span className="col-start-1 row-start-1 text-center">{busy === 'read' ? 'Reading' : 'Read'}</span>
            </span>
          </button>
        </div>
        </div>
      </form>
      </div>

      {error ? <p className="text-xs text-rose-400">{error}</p> : null}

      {draft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
          <button type="button" aria-label="Close review" className="fixed inset-0 z-0 cursor-default" onClick={() => busy !== 'confirm' && setDraft(null)} />
          <div role="dialog" aria-modal="true" aria-labelledby="gvg-review-title" className="relative z-10 flex max-h-[80vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
            <header className={cardHeader}>
              <h2 id="gvg-review-title" className={`${cardTitle} min-w-0 truncate`}>Review{draft.shareCode ? ` · ${draft.shareCode}` : ''}</h2>
              <p className="ml-auto flex shrink-0 items-center gap-2 text-[10px] font-medium text-slate-400">
                <span>(%) - AI recognition confidence</span>
                <span className="text-emerald-400">85%+</span>
                <span className="text-amber-400">70–84%</span>
                <span className="text-rose-400">&lt;70%</span>
              </p>
              <button type="button" onClick={() => setDraft(null)} disabled={busy === 'confirm'} aria-label="Close" className="text-slate-400 hover:text-white disabled:opacity-40">
                <X size={16} />
              </button>
            </header>
            <div className="overflow-auto p-4">
            <div className="rounded-xl bg-slate-950/40 p-4">
              <div className="grid grid-cols-3 gap-4">
                <label className="min-w-0">
                  <span className={labelClass}>Name</span>
                  <span className="relative block">
                    <User size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <select
                      value={draft.memberUid || ''}
                      onChange={(event) => updateCharacter({ memberUid: event.target.value })}
                      disabled={busy === 'confirm'}
                      className={`${controlClass} w-full appearance-none pl-8 pr-8`}
                    >
                      {(roster.some((row) => row.uid === draft.memberUid) ? roster : [
                        ...roster,
                        {
                          uid: draft.memberUid,
                          displayName: members[draft.memberUid]?.displayName || members[draft.memberUid]?.inGameName || draft.memberUid,
                        },
                      ]).map((row) => (
                        <option key={row.uid} value={row.uid}>{row.displayName}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  </span>
                </label>
                <label className="min-w-0">
                  <span className={labelClass}>Job</span>
                  <select
                    value={reviewed.jobCode}
                    onChange={(event) => updateCharacter({ jobCode: event.target.value })}
                    disabled={busy === 'confirm'}
                    className={`${controlClass} w-full`}
                  >
                    {!reviewed.jobCode ? <option value="">Choose</option> : null}
                    {catalogOptions(jobs, reviewed.jobCode).map((row) => (
                      <option key={row.code} value={row.code}>{row.name}</option>
                    ))}
                  </select>
                </label>
                <label className="min-w-0">
                  <span className={labelClass}>Role</span>
                  <select
                    value={reviewed.roleCode}
                    onChange={(event) => updateCharacter({ roleCode: event.target.value })}
                    disabled={busy === 'confirm'}
                    className={`${controlClass} w-full`}
                  >
                    {!reviewed.roleCode ? <option value="">Choose</option> : null}
                    {catalogOptions(roles, reviewed.roleCode).map((row) => (
                      <option key={row.code} value={row.code}>{row.name}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            {(draft.warnings || []).filter((row) => row.warning).length ? (
              <ul className="mt-3 text-xs text-amber-400">
                {draft.warnings.filter((row) => row.warning).map((row) => (
                  <li key={row.kind}>{SHOT_LABELS[row.kind] || row.kind}: {row.warning}</li>
                ))}
              </ul>
            ) : null}
            <div className="mt-6 grid grid-cols-2 gap-6">
              {[['general', 'General Stats', 'gvgGeneralStatsCol1', 'gvgGeneralStatsCol2'], ['quasi', 'Quasi-Stats', 'gvgQuasiStatsCol1', 'gvgQuasiStatsCol2']].map(([section, title, leftKey, rightKey]) => (
                <div key={section} className={`min-w-0 space-y-2 rounded-xl p-4 ${section === 'quasi' ? 'bg-blue-950/25' : 'bg-emerald-950/25'}`}>
                  <div className={`rounded-md px-2 py-1 text-center text-xs font-semibold uppercase tracking-wider ${section === 'quasi' ? quasiTone : generalTone}`}>{title}</div>
                  <ReviewColumns
                    section={section}
                    left={keywordColumn(draft.readings, section, 'left', settingsQuery.data?.[leftKey] || settingsQuery.data?.[section === 'quasi' ? 'gvgQuasiStats' : 'gvgGeneralStats'])}
                    right={keywordColumn(draft.readings, section, 'right', settingsQuery.data?.[rightKey] || settingsQuery.data?.[section === 'quasi' ? 'gvgQuasiStats' : 'gvgGeneralStats'])}
                    readings={draft.readings}
                    onChange={updateReading}
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={confirmSheet}
                disabled={busy === 'confirm'}
                className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-[11px] font-bold uppercase tracking-wider text-white hover:bg-emerald-500 disabled:opacity-40"
              >
                <Check size={14} />
                {busy === 'confirm' ? 'Saving' : 'Confirm'}
              </button>
            </div>
            </div>
          </div>
        </div>
      ) : null}

      {memberUid ? (
        <ProgressionView
          series={series}
          cohort={cohort}
          loading={progressionQuery.isLoading}
          jobs={jobs}
          roles={roles}
          config={settingsQuery.data || {}}
          pickedDay={pickedDay}
          onPickDay={setPickedDay}
          filters={filters}
          onFilters={setFilters}
          compare={compare}
          onCompare={setCompare}
          selectedStat={selectedStat}
          onSelectStat={setSelectedStat}
          memberName={members[memberUid]?.displayName || members[memberUid]?.inGameName || ''}
        />
      ) : (
        <section className={cardClass}>
          <header className={cardHeader}>
            <h2 className={cardTitle}>Stats Overview</h2>
          </header>
          <div className={cardBody}>
            <p className="text-xs text-slate-400">Search a member to open a sheet.</p>
          </div>
        </section>
      )}
    </div>
  );
}

function catalogOptions(catalog, current) {
  const options = Object.entries(catalog || {}).map(([code, row]) => ({
    code,
    name: row?.name || code,
  }));
  if (current && !options.some((row) => row.code === current)) {
    options.push({ code: current, name: current });
  }
  return options.sort((a, b) => a.name.localeCompare(b.name));
}

function ProgressionView({
  series,
  cohort,
  loading,
  jobs,
  roles,
  config,
  pickedDay,
  onPickDay,
  filters,
  onFilters,
  compare,
  onCompare,
  selectedStat,
  onSelectStat,
  memberName,
}) {
  const days = useMemo(() => {
    const byDay = new Map();
    for (const group of series) {
      for (const row of group.rows || []) {
        const prev = byDay.get(row.capturedAt);
        if (!prev || String(prev.id) < String(row.id)) byDay.set(row.capturedAt, row);
      }
    }
    return [...byDay.values()].sort((a, b) => String(a.capturedAt).localeCompare(String(b.capturedAt)));
  }, [series]);
  const viewed = days.find((row) => row.capturedAt === pickedDay) || days[days.length - 1] || null;
  const dayIndex = viewed ? days.findIndex((row) => row.capturedAt === viewed.capturedAt) : -1;
  const [compareDraft, setCompareDraft] = useState(compare);
  const [compareDirty, setCompareDirty] = useState(false);
  const [hoveredStat, setHoveredStat] = useState(null);
  const activeStat = hoveredStat || selectedStat;

  useEffect(() => {
    if (!compareDirty) setCompareDraft(compare);
  }, [compare, compareDirty]);

  useEffect(() => {
    if (!viewed) return;
    const day = viewed.capturedAt;
    const jobCode = filters.pinned ? filters.jobCode : (viewed.jobCode || '');
    const roleCode = filters.pinned ? filters.roleCode : (viewed.roleCode || '');
    if (day === pickedDay && jobCode === filters.jobCode && roleCode === filters.roleCode) return;
    onPickDay(day);
    onFilters({ jobCode, roleCode, pinned: filters.pinned });
  }, [viewed, pickedDay, filters, onPickDay, onFilters]);

  useEffect(() => {
    if (!viewed || compare.pinned) return;
    const bounds = monthBounds(viewed.capturedAt);
    const next = {
      jobCode: viewed.jobCode || '',
      roleCode: viewed.roleCode || '',
      from: bounds.from,
      to: bounds.to,
      pinned: false,
    };
    if (
      next.jobCode === compare.jobCode
      && next.roleCode === compare.roleCode
      && next.from === compare.from
      && next.to === compare.to
    ) return;
    onCompare(next);
  }, [viewed, compare, onCompare]);

  const columns = useMemo(() => ({
    general: {
      left: keywordColumn(viewed?.readings, 'general', 'left', config.gvgGeneralStatsCol1 || config.gvgGeneralStats),
      right: keywordColumn(viewed?.readings, 'general', 'right', config.gvgGeneralStatsCol2 || config.gvgGeneralStats),
    },
    quasi: {
      left: keywordColumn(viewed?.readings, 'quasi', 'left', config.gvgQuasiStatsCol1 || config.gvgQuasiStats),
      right: keywordColumn(viewed?.readings, 'quasi', 'right', config.gvgQuasiStatsCol2 || config.gvgQuasiStats),
    },
  }), [viewed, config]);

  useEffect(() => {
    const filled = columns.general.left.find((cell) => cell.reading && cell.reading.value != null);
    const current = selectedStat && ['general', 'quasi'].some((section) => (
      ['left', 'right'].some((column) => columns[section][column].some((cell) => (
        cell.reading
        && selectedStat.section === section
        && selectedStat.column === column
        && labelsMatch(cell.label, selectedStat.label)
      )))
    ));
    if (current) return;
    onSelectStat(filled ? { section: 'general', column: 'left', label: filled.label } : null);
  }, [columns, selectedStat, onSelectStat]);

  const selectedReading = activeStat
    ? (viewed?.readings || []).find((row) => (
      row.section === activeStat.section
      && row.column === activeStat.column
      && labelsMatch(row.label, activeStat.label)
    ))
    : null;
  const comparison = activeStat ? cohortStatAverage(cohort, {
    jobCode: compare.jobCode,
    roleCode: compare.roleCode,
    from: compare.from,
    day: compare.to,
    section: activeStat.section,
    column: activeStat.column,
    label: activeStat.label,
  }) : { average: null, count: 0, unit: '' };
  const sheetJobName = catalogName(jobs, viewed?.jobCode) || viewed?.jobCode || '';
  const sheetRoleName = catalogName(roles, viewed?.roleCode) || viewed?.roleCode || '';
  const comparePending = compareDraft.jobCode !== compare.jobCode
    || compareDraft.roleCode !== compare.roleCode
    || compareDraft.from !== compare.from
    || compareDraft.to !== compare.to;
  const differentCohort = Boolean(
    viewed
    && compare.jobCode
    && compare.roleCode
    && (viewed.jobCode !== compare.jobCode || viewed.roleCode !== compare.roleCode),
  );

  if (!days.length && !loading) {
    return (
      <section className={cardClass}>
        <header className={cardHeader}>
          <h2 className={cardTitle}>Stats Overview</h2>
        </header>
        <div className={cardBody}>
          <p className="text-xs text-slate-400">No confirmed sheet for this member yet.</p>
        </div>
      </section>
    );
  }
  if (!viewed) return null;

  return (
    <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(18rem,0.75fr)]">
      <div className={cardClass}>
        <header className={cardHeader}>
          <h2 className={cardTitle}>Stats Overview</h2>
          <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPickDay(days[dayIndex - 1].capturedAt)}
            disabled={dayIndex <= 0}
            aria-label="Previous date"
            className={quietButton}
          >
            <ChevronLeft size={14} />
            Previous
          </button>
          <p className="min-w-24 text-center text-xs font-semibold text-slate-100">{viewed.capturedAt}</p>
          <button
            type="button"
            onClick={() => onPickDay(days[dayIndex + 1].capturedAt)}
            disabled={dayIndex < 0 || dayIndex >= days.length - 1}
            aria-label="Next date"
            className={quietButton}
          >
            Next
            <ChevronRight size={14} />
          </button>
          </div>
        </header>
        <div className={cardBody}>
        <div className="grid grid-cols-2 gap-6" onMouseLeave={() => setHoveredStat(null)}>
          <div className="min-w-0 space-y-3 rounded-xl bg-emerald-950/25 p-4">
            <div className={`rounded-lg px-3 py-2 text-center text-sm font-semibold uppercase tracking-wider ${generalTone}`}>General Stats</div>
            <StatColumns
              left={columns.general.left}
              right={columns.general.right}
              section="general"
              deltas={viewed.deltas}
              selected={selectedStat}
              preview={hoveredStat}
              onSelect={onSelectStat}
              onPreview={setHoveredStat}
            />
          </div>
          <div className="min-w-0 space-y-3 rounded-xl bg-blue-950/25 p-4">
            <div className={`rounded-lg px-3 py-2 text-center text-sm font-semibold uppercase tracking-wider ${quasiTone}`}>Quasi-Stats</div>
            <StatColumns
              left={columns.quasi.left}
              right={columns.quasi.right}
              section="quasi"
              deltas={viewed.deltas}
              selected={selectedStat}
              preview={hoveredStat}
              onSelect={onSelectStat}
              onPreview={setHoveredStat}
            />
          </div>
        </div>
        </div>
      </div>
      <div className={cardClass}>
        <header className={cardHeader}>
          <h2 className={cardTitle}>Comparison Graph</h2>
        </header>
        <div className={cardBody}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!comparePending) return;
            onCompare({ ...compareDraft, pinned: true });
            setCompareDirty(false);
          }}
        >
        <div className="grid grid-cols-2 gap-3">
          <label className="min-w-0">
            <span className={labelClass}>Job</span>
            <select
              value={compareDraft.jobCode}
              onChange={(event) => {
                setCompareDirty(true);
                setCompareDraft((current) => ({ ...current, jobCode: event.target.value }));
              }}
              className={`${controlClass} w-full`}
            >
              {!compareDraft.jobCode ? <option value="">Choose</option> : null}
              {catalogOptions(jobs, compareDraft.jobCode).map((row) => (
                <option key={row.code} value={row.code}>{row.name}</option>
              ))}
            </select>
          </label>
          <label className="min-w-0">
            <span className={labelClass}>Role</span>
            <select
              value={compareDraft.roleCode}
              onChange={(event) => {
                setCompareDirty(true);
                setCompareDraft((current) => ({ ...current, roleCode: event.target.value }));
              }}
              className={`${controlClass} w-full`}
            >
              {!compareDraft.roleCode ? <option value="">Choose</option> : null}
              {catalogOptions(roles, compareDraft.roleCode).map((row) => (
                <option key={row.code} value={row.code}>{row.name}</option>
              ))}
            </select>
          </label>
          <label className="min-w-0">
            <span className={labelClass}>Range from</span>
            <input
              type="date"
              value={compareDraft.from}
              onChange={(event) => {
                setCompareDirty(true);
                setCompareDraft((current) => ({ ...current, from: event.target.value }));
                event.target.blur();
              }}
              className={`${controlClass} w-full`}
            />
          </label>
          <label className="min-w-0">
            <span className={labelClass}>Range to</span>
            <input
              type="date"
              value={compareDraft.to}
              onChange={(event) => {
                setCompareDirty(true);
                setCompareDraft((current) => ({ ...current, to: event.target.value }));
                event.target.blur();
              }}
              className={`${controlClass} w-full`}
            />
          </label>
        </div>
          <div className="mt-4 flex justify-end">
            <button type="submit" disabled={!comparePending} className={primaryButton}>
              Apply
            </button>
          </div>
        </form>
        <div className="-mx-5 mt-4 border-t border-slate-800/80">
          <div className="space-y-3 px-5 pt-4">
          <p className="pl-14 pr-2 text-center text-sm font-semibold text-slate-50">{activeStat?.label || 'Pick a stat'}</p>
          {differentCohort ? (
            <p className="text-xs text-amber-300">This sheet is {sheetJobName} · {sheetRoleName}.</p>
          ) : null}
          <CompareBars
            memberName={memberName}
            memberValue={selectedReading?.value}
            average={comparison.average}
            count={comparison.count}
            unit={selectedReading?.unit || comparison.unit}
            peerLabel={[catalogName(jobs, compare.jobCode) || compare.jobCode, catalogName(roles, compare.roleCode) || compare.roleCode].filter(Boolean).join(' · ')}
            statLabel={activeStat?.label || ''}
          />
          </div>
        </div>
        </div>
      </div>
    </section>
  );
}

import { keepPreviousData } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Check, ChevronLeft, ChevronRight, Download, Eraser, Plus, RotateCcw, ScanLine, Search, Trash2, X } from 'lucide-react';
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  cohortStatAverage,
  formatDelta,
  formatStatValue,
  emptyExtras,
  gvgStatsCsv,
  labelsMatch,
  SHEET_EXTRA_FIELDS,
  parseStatKeywordList,
  SHOT_KINDS,
  SHOT_LABELS,
  SPECIAL_STAT_NAMES,
} from '@guildname/shared/gvgStatSheet';
import GvgSimulation from './GvgSimulation';
import MemberField from './MemberField';
import { apiFetch } from '../../../services/apiClient';
import { invalidateGvgStatProgression, invalidateGvgStatSnapshots, useGvgStatProgression, useGvgStatSnapshots, useMembers, useSettings } from '../../../query/hooks';
import { getGuildTodayDateStr } from '../../../utils/guildTime';

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function downloadCsv(filename, headers, rows) {
  const csvContent = `\uFEFF${[headers.map(csvEscape).join(','), ...rows.map((row) => row.map(csvEscape).join(','))].join('\n')}`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const SHOT_HINTS = {
  general: 'Details tab, General Stats open. This shot includes STR through LUK.',
  quasi: 'Details tab, Quasi-Stats open.',
  special: 'Details tab, Special open. Max HP is the first row.',
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
const specialTone = 'border border-pink-400/80 bg-pink-950 text-pink-300 shadow-[0_0_14px_rgba(244,114,182,0.45)] [text-shadow:0_0_8px_rgba(244,114,182,0.85)]';

function sectionTone(section) {
  if (section === 'quasi') return quasiTone;
  if (section === 'special') return specialTone;
  return generalTone;
}

function sectionPanel(section) {
  if (section === 'quasi') return 'bg-blue-950/25';
  if (section === 'special') return 'bg-pink-950/25';
  return 'bg-emerald-950/25';
}

function sectionLine(section) {
  if (section === 'quasi') return 'divide-blue-500/25 border-blue-500/30';
  if (section === 'special') return 'divide-pink-500/25 border-pink-500/30';
  return 'divide-emerald-500/25 border-emerald-500/30';
}

function shotLabelClass(kind) {
  if (kind === 'quasi') return 'text-blue-300 [text-shadow:0_0_8px_rgba(96,165,250,0.75)]';
  if (kind === 'special') return 'text-pink-300 [text-shadow:0_0_8px_rgba(244,114,182,0.75)]';
  return 'text-emerald-300 [text-shadow:0_0_8px_rgba(52,211,153,0.75)]';
}

function specialSource(config) {
  return config?.gvgSpecialStats || SPECIAL_STAT_NAMES.join('\n');
}

function ReviewShotPane({ kind, url, onClose, width }) {
  return (
    <div style={width ? { width } : undefined} className="sticky top-0 flex h-[calc(80vh-11rem)] shrink-0 flex-col self-start overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-slate-800 px-3">
        <span className={`truncate text-[10px] font-bold uppercase tracking-wider ${shotLabelClass(kind)}`}>{SHOT_LABELS[kind]}</span>
        <button type="button" onClick={onClose} aria-label="Hide screenshot" className="text-slate-400 hover:text-white">
          <X size={14} />
        </button>
      </div>
      <img src={url} alt={SHOT_LABELS[kind]} className="min-h-0 w-full flex-1 object-contain object-top" />
    </div>
  );
}

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

function CompareBars({ memberName, memberValue, average, count, unit, peerLabel, statLabel, compact }) {
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
      <div className={compact ? 'h-32 w-full' : 'h-56 w-full'}>
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
      {compact ? <p className={noteClass}>{note}</p> : <AnalysisNote note={note} noteClass={noteClass} />}
    </div>
  );
}

function ShotPicker({ kind, file, previewUrl, inputKey, onFile, disabled }) {
  const zoneRef = useRef(null);
  const inputRef = useRef(null);
  const skipOpen = useRef(false);
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState(false);
  const take = (list) => {
    const next = list?.[0];
    if (!next) return;
    if (next.type && !next.type.startsWith('image/')) {
      setRejected(true);
      return;
    }
    setRejected(false);
    onFile(next);
  };
  const clearShot = (event) => {
    event.preventDefault();
    event.stopPropagation();
    skipOpen.current = true;
    setRejected(false);
    onFile(null);
    setTimeout(() => {
      skipOpen.current = false;
    }, 0);
  };
  useEffect(() => {
    const node = zoneRef.current;
    if (!node) return undefined;
    const allow = (event) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    node.addEventListener('dragenter', allow);
    node.addEventListener('dragover', allow);
    return () => {
      node.removeEventListener('dragenter', allow);
      node.removeEventListener('dragover', allow);
    };
  }, []);
  return (
    <div
      ref={zoneRef}
      title={SHOT_HINTS[kind]}
      onDragEnter={() => {
        if (!disabled) setOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        if (!disabled) take(event.dataTransfer.files);
      }}
      className={`relative h-28 overflow-hidden rounded-xl border bg-slate-950 outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-slate-400 ${
        over ? 'border-solid border-indigo-400 bg-indigo-950/40' : file ? 'border-solid border-slate-500' : 'border-dashed border-slate-600'
      } ${disabled ? 'opacity-40' : ''}`}
    >
      <div className="pointer-events-none flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-slate-300">
        {file && previewUrl ? (
          <img src={previewUrl} alt="" className="h-full w-full object-contain p-2" />
        ) : (
          <>
            <Plus size={18} className="text-slate-300" aria-hidden="true" />
            <span className="text-[11px] font-medium text-slate-300">Drop</span>
          </>
        )}
      </div>
      <input
        key={`${kind}-${inputKey}`}
        ref={inputRef}
        type="file"
        accept="image/*"
        aria-label={`${SHOT_LABELS[kind]} screenshot`}
        disabled={disabled}
        onClick={(event) => {
          if (!skipOpen.current) return;
          event.preventDefault();
          event.stopPropagation();
          skipOpen.current = false;
        }}
        onChange={(event) => {
          const picked = event.target.files?.[0];
          event.target.value = '';
          if (picked) take([picked]);
        }}
        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
      {file ? (
        <button
          type="button"
          aria-label={`Remove ${SHOT_LABELS[kind]} screenshot`}
          disabled={disabled}
          data-clear-shot=""
          onMouseDown={clearShot}
          onClick={clearShot}
          className="absolute right-1.5 top-1.5 z-20 inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-700 bg-slate-950/90 text-slate-200 hover:border-slate-500 disabled:cursor-not-allowed"
        >
          <X size={12} aria-hidden="true" />
        </button>
      ) : null}
      {rejected || file ? (
        <p className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 truncate px-1.5 py-0.5 text-center text-[10px] ${rejected ? 'bg-rose-950/90 text-rose-200' : 'bg-slate-950/85 text-slate-300'}`}>
          {rejected ? 'Images only' : file.name}
        </p>
      ) : null}
    </div>
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
      onMouseEnter={(event) => onPreview({ section, column, label: cell.label }, event.currentTarget)}
      onClick={() => onSelect({ section, column, label: cell.label })}
      className={`flex min-h-9 w-full items-center justify-between gap-3 px-2.5 py-1.5 text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-400/40 ${
        hot ? 'bg-indigo-600/25' : pinned ? 'bg-indigo-950/50' : ''
      }`}
    >
      <span className="truncate text-sm text-slate-300">{cell.label}</span>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-white">
        {reading ? formatStatValue(reading) : ''}
        {change ? <span className={`ml-1 ${delta > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{change}</span> : null}
      </span>
    </button>
  );
}

function HoverCompare({ anchor, label, children }) {
  const [place, setPlace] = useState(null);
  useLayoutEffect(() => {
    if (!anchor) return undefined;
    const update = () => {
      const rect = anchor.getBoundingClientRect();
      const width = 320;
      const height = 220;
      let left = rect.right + 10;
      if (left + width > window.innerWidth - 8) left = Math.max(8, rect.left - width - 10);
      let top = rect.top;
      if (top + height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - height - 8);
      setPlace({ top, left, width });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [anchor]);
  if (!place) return null;
  return (
    <div
      className="pointer-events-none fixed z-50 rounded-xl border border-slate-700 bg-slate-950 p-3 shadow-[0_16px_40px_rgba(0,0,0,0.45)]"
      style={{ top: place.top, left: place.left, width: place.width }}
    >
      <p className="mb-1 truncate text-center text-xs font-semibold text-slate-50">{label}</p>
      {children}
    </div>
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
        className="w-16 shrink-0 bg-transparent text-right text-xs font-semibold tabular-nums text-white outline-none"
      />
    </div>
  );
}

function ReviewColumns({ left, right, readings, onChange, section }) {
  const count = Math.max(left.length, right.length);
  return (
    <div className={`divide-y overflow-hidden rounded-lg border ${sectionLine(section)}`}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="grid grid-cols-2">
          <ReviewCell cell={left[index]} readings={readings} onChange={onChange} />
          <ReviewCell cell={right[index]} readings={readings} onChange={onChange} />
        </div>
      ))}
    </div>
  );
}

function ReviewStack({ cells, readings, onChange, section }) {
  return (
    <div className={`divide-y overflow-hidden rounded-lg border ${sectionLine(section)}`}>
      {cells.map((cell) => (
        <ReviewCell key={cell.label} cell={cell} readings={readings} onChange={onChange} />
      ))}
    </div>
  );
}

function StatColumns({ left, right, section, deltas, selected, preview, onSelect, onPreview }) {
  const count = Math.max(left.length, right.length);
  return (
    <div className={`divide-y overflow-hidden rounded-lg border ${sectionLine(section)}`}>
      {Array.from({ length: count }, (_, index) => (
        <div key={`${section}-${index}`} className="grid grid-cols-2">
          <StatButton cell={left[index]} section={section} column="left" deltas={deltas} selected={selected} preview={preview} onSelect={onSelect} onPreview={onPreview} />
          <StatButton cell={right[index]} section={section} column="right" deltas={deltas} selected={selected} preview={preview} onSelect={onSelect} onPreview={onPreview} />
        </div>
      ))}
    </div>
  );
}

function StatStack({ cells, section, deltas, selected, preview, onSelect, onPreview }) {
  return (
    <div className={`divide-y overflow-hidden rounded-lg border ${sectionLine(section)}`}>
      {cells.map((cell) => (
        <StatButton
          key={`${section}-${cell.label}`}
          cell={cell}
          section={section}
          column="left"
          deltas={deltas}
          selected={selected}
          preview={preview}
          onSelect={onSelect}
          onPreview={onPreview}
        />
      ))}
    </div>
  );
}

export default function GvgStatsTab({ user }) {
  const isOfficer = user?.isOfficer === true;
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
  const [shotUrls, setShotUrls] = useState({});
  const [reviewShot, setReviewShot] = useState('');
  const [columnWidth, setColumnWidth] = useState(0);
  const [shotPaneWidth, setShotPaneWidth] = useState(0);
  const reviewScrollRef = useRef(null);
  const [formKey, setFormKey] = useState(0);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [clearOpen, setClearOpen] = useState(false);
  const [clearText, setClearText] = useState('');
  const [clearing, setClearing] = useState(false);
  const [pageTab, setPageTab] = useState('overview');
  const [removeTarget, setRemoveTarget] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [pickedDay, setPickedDay] = useState('');
  const [filters, setFilters] = useState({ jobCode: '', roleCode: '', pinned: false });
  const [compare, setCompare] = useState({ jobCode: '', roleCode: '', from: '', to: '', pinned: false });
  const [selectedStat, setSelectedStat] = useState(null);

  useEffect(() => {
    const urls = {};
    for (const kind of SHOT_KINDS) {
      if (files[kind] instanceof Blob) urls[kind] = URL.createObjectURL(files[kind]);
    }
    setShotUrls(urls);
    return () => {
      Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  useLayoutEffect(() => {
    if (!draft || reviewShot) return;
    const scroller = reviewScrollRef.current;
    const panel = scroller?.querySelector('[data-review-section="general"]');
    if (!scroller || !panel) return;
    const width = panel.getBoundingClientRect().width;
    setColumnWidth(width);
    setShotPaneWidth(Math.max(0, scroller.clientWidth - width - 24));
  }, [draft, reviewShot]);

  useLayoutEffect(() => {
    const scroller = reviewScrollRef.current;
    if (!scroller) return;
    if (!reviewShot) {
      scroller.scrollTo({ left: 0, behavior: 'smooth' });
      return;
    }
    const panel = scroller.querySelector(`[data-review-section="${reviewShot}"]`);
    if (!panel) return;
    const width = panel.getBoundingClientRect().width;
    setShotPaneWidth(Math.max(0, scroller.clientWidth - width - 24));
    const delta = panel.getBoundingClientRect().left - scroller.getBoundingClientRect().left;
    scroller.scrollTo({ left: Math.max(0, scroller.scrollLeft + delta), behavior: 'smooth' });
  }, [reviewShot]);

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

  const openMember = (row, options = {}) => {
    setMemberUid(row.uid);
    if (!options.keepUpload && members[row.uid]?.isRaidRoster === true) setUploadUid(row.uid);
    setQuery(row.displayName);
    setSearchNote('');
    setDraft(null);
    setPickedDay('');
    setFilters({ jobCode: '', roleCode: '', pinned: false });
    setCompare({ jobCode: '', roleCode: '', from: '', to: '', pinned: false });
    setSelectedStat(null);
  };

  const runSearch = (event) => {
    event.preventDefault();
    const needle = query.trim().toLowerCase();
    const found = Object.entries(members)
      .filter(([, member]) => member?.isRaidRoster === true)
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

  const directory = useMemo(() => (
    Object.entries(members)
      .map(([uid, member]) => ({
        uid,
        displayName: member?.displayName || member?.inGameName || uid,
        inGameName: member?.inGameName || '',
        jobCode: member?.jobCode || '',
        roleCode: member?.roleCode || '',
        raid: member?.isRaidRoster === true,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
  ), [members]);
  const roster = useMemo(() => directory.filter((row) => row.raid), [directory]);
  const searchPeople = useMemo(() => roster.filter((row) => {
    if (filters.jobCode && row.jobCode !== filters.jobCode) return false;
    if (filters.roleCode && row.roleCode !== filters.roleCode) return false;
    return true;
  }), [roster, filters.jobCode, filters.roleCode]);
  const selfMember = useMemo(() => {
    const uid = String(user?.id || '');
    return directory.find((row) => String(row.uid) === uid) || null;
  }, [directory, user?.id]);
  const uploadMine = selfMember && roster.some((row) => String(row.uid) === String(selfMember.uid)) ? selfMember : null;
  const readSheet = async (event, memberUid = uploadUid) => {
    if (event?.preventDefault) event.preventDefault();
    const uid = memberUid || uploadUid;
    if (!uid) {
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
      body.append('memberUid', uid);
      body.append('capturedAt', capturedAt);
      body.append('kinds', JSON.stringify(picked));
      picked.forEach((kind) => body.append('files', files[kind]));
      const res = await apiFetch('/api/gvg-stats/drafts', { method: 'POST', body });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Could not read the sheet.');
      const member = members[uid] || {};
      setDraft((current) => ({
        ...data.draft,
        memberUid: current?.memberUid || uid,
        jobCode: current?.jobCode || member.jobCode || '',
        roleCode: current?.roleCode || member.roleCode || '',
        extras: current?.extras || emptyExtras(),
      }));
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
          extras: draft.extras || emptyExtras(),
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
      await invalidateGvgStatSnapshots();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const removeSheet = async () => {
    if (!removeTarget?.id) return;
    setRemoving(true);
    setError('');
    try {
      const res = await apiFetch(`/api/gvg-stats/snapshots/${encodeURIComponent(removeTarget.id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Could not remove the sheet.');
      setRemoveTarget(null);
      await invalidateGvgStatProgression();
      await invalidateGvgStatSnapshots();
    } catch (err) {
      setError(err.message);
    } finally {
      setRemoving(false);
    }
  };

  const updateExtra = (key, value) => {
    setDraft((current) => {
      if (!current) return current;
      return { ...current, extras: { ...emptyExtras(), ...current.extras, [key]: value } };
    });
  };

  const clearExtras = () => {
    setDraft((current) => (current ? { ...current, extras: emptyExtras() } : current));
  };

  const exportSheets = () => {
    downloadCsv(`GvgStats_${getGuildTodayDateStr()}.csv`, savedSheets.headers, savedSheets.rows);
  };

  const clearSheets = async () => {
    if (clearText.trim().toLowerCase() !== 'clear') return;
    setClearing(true);
    setError('');
    try {
      const res = await apiFetch('/api/gvg-stats/clear', {
        method: 'POST',
        body: JSON.stringify({ confirm: 'Clear' }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Could not clear the saved sheets.');
      setClearOpen(false);
      setClearText('');
      setDraft(null);
      setMemberUid('');
      setQuery('');
      setSearchNote('');
      setPickedDay('');
      setFilters({ jobCode: '', roleCode: '', pinned: false });
      setCompare({ jobCode: '', roleCode: '', from: '', to: '', pinned: false });
      setSelectedStat(null);
      await invalidateGvgStatProgression();
      await invalidateGvgStatSnapshots();
    } catch (err) {
      setError(err.message);
    } finally {
      setClearing(false);
    }
  };

  const snapshotsQuery = useGvgStatSnapshots();
  const savedSheets = useMemo(() => {
    const config = settingsQuery.data || {};
    return gvgStatsCsv(snapshotsQuery.data || [], {
      members,
      jobs,
      roles,
      lists: {
        generalLeft: config.gvgGeneralStatsCol1 || config.gvgGeneralStats,
        generalRight: config.gvgGeneralStatsCol2 || config.gvgGeneralStats,
        quasiLeft: config.gvgQuasiStatsCol1 || config.gvgQuasiStats,
        quasiRight: config.gvgQuasiStatsCol2 || config.gvgQuasiStats,
        special: specialSource(config),
      },
    });
  }, [snapshotsQuery.data, members, jobs, roles, settingsQuery.data]);

  const series = progressionQuery.data?.series || [];
  const cohort = cohortQuery.data?.cohort || [];
  const reviewed = classFor(draft?.memberUid, draft?.jobCode, draft?.roleCode);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-black uppercase tracking-wide text-slate-100">GVG Stats</h1>
      </div>
      <nav className="flex gap-1 border-b border-slate-800">
        {[['overview', 'Stat overview & Upload'], ['simulation', 'Simulation'], ['database', 'Database']].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setPageTab(id)}
            className={`border-b-2 px-3 py-2 text-[11px] font-bold uppercase tracking-wider ${pageTab === id ? 'border-indigo-400 text-slate-100' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
          >
            {label}
          </button>
        ))}
      </nav>
      {pageTab === 'overview' ? (
      <div className="relative z-20 grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
      <div className="grid h-full min-w-0 grid-rows-2 gap-4">
      <form onSubmit={runSearch} className={`${cardClass} relative z-20 h-full min-h-0 !overflow-visible`}>
        <header className={cardHeader}>
          <h2 className={cardTitle}>Search</h2>
        </header>
        <div className={`${cardBody} flex min-h-0 flex-1 flex-col`}>
        <div className="grid grid-cols-3 gap-4">
          <label className="min-w-0">
            <span className={labelClass}>Name</span>
            <MemberField
              people={searchPeople}
              value={memberUid}
              text={query}
              onText={(next) => {
                setQuery(next);
                setSearchNote('');
              }}
              onPick={(uid) => {
                const row = roster.find((item) => String(item.uid) === String(uid));
                if (row) openMember(row);
              }}
              onMine={() => {
                if (uploadMine) openMember(uploadMine, { keepUpload: true });
              }}
              mine={uploadMine}
              allowMine
              placeholder="Search a member"
            />
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
      <CompareSettings jobs={jobs} roles={roles} compare={compare} onCompare={setCompare} />
      </div>
      <form onSubmit={readSheet} className={`${cardClass} h-full min-w-0`}>
        <header className={cardHeader}>
          <h2 className={cardTitle}>Upload Stats</h2>
        </header>
        <div className={`${cardBody} flex min-h-0 flex-1 flex-col`}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="min-w-0">
            <span className={labelClass}>Name</span>
            <MemberField
              people={roster}
              value={uploadUid}
              onPick={setUploadUid}
              mine={uploadMine}
              allowMine
              emptyLabel="Choose a member"
              placeholder="Choose a member"
            />
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
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {SHOT_KINDS.map((kind) => (
            <label key={kind} className="min-w-0">
              <span title={SHOT_LABELS[kind]} className={`mb-1.5 block min-h-8 text-[11px] font-medium leading-4 ${shotLabelClass(kind)}`}>{SHOT_LABELS[kind]}</span>
              <ShotPicker
                kind={kind}
                file={files[kind]}
                previewUrl={shotUrls[kind]}
                inputKey={formKey}
                disabled={busy === 'read'}
                onFile={(file) => setFiles((current) => ({ ...current, [kind]: file }))}
              />
            </label>
          ))}
        </div>
        <div className="mt-auto flex justify-end pt-4">
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
      ) : null}

      {error ? <p className="text-xs text-rose-400">{error}</p> : null}

      {clearOpen ? (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div role="dialog" aria-modal="true" aria-labelledby="gvg-clear-title" className="w-full max-w-md space-y-4 rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h2 id="gvg-clear-title" className="text-sm font-bold uppercase tracking-wider text-rose-500">Clear saved sheets</h2>
            <p className="font-sans text-xs leading-relaxed text-slate-400">This deletes every confirmed GvG sheet and every draft. Members, jobs, roles, and Game Settings stay. This cannot be undone.</p>
            <div className="space-y-1 font-mono text-xs">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Type keyword <strong className="text-white">CLEAR</strong> to execute:</label>
              <input
                type="text"
                value={clearText}
                onChange={(event) => setClearText(event.target.value)}
                placeholder="CLEAR"
                disabled={clearing}
                autoComplete="off"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-center font-mono font-bold tracking-widest text-amber-500 uppercase outline-none disabled:opacity-50"
              />
            </div>
            <div className="flex justify-end gap-3 pt-1 font-mono text-xs">
              <button
                type="button"
                disabled={clearing}
                onClick={() => { setClearOpen(false); setClearText(''); }}
                className="cursor-pointer rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-slate-400 transition hover:text-white disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={clearSheets}
                disabled={clearing || clearText.trim().toLowerCase() !== 'clear'}
                className="cursor-pointer rounded-xl bg-rose-600 px-5 py-2 font-bold uppercase tracking-wider text-white shadow-lg transition hover:bg-rose-500 disabled:opacity-10"
              >
                {clearing ? 'Clearing' : 'Clear sheets'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {draft ? (
        <div className="fixed inset-y-0 right-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md left-[var(--valhalla-sidebar-width,16rem)]">
          <button type="button" aria-label="Close review" className="absolute inset-0 z-0 cursor-default" onClick={() => { if (!busy) { setReviewShot(''); setDraft(null); } }} />
          <div role="dialog" aria-modal="true" aria-labelledby="gvg-review-title" className="relative z-10 flex h-[80vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
            <header className={cardHeader}>
              <h2 id="gvg-review-title" className={`${cardTitle} min-w-0 truncate`}>Review{draft.shareCode ? ` · ${draft.shareCode}` : ''}</h2>
              <p className="ml-auto flex shrink-0 items-center gap-2 text-[10px] font-medium text-slate-400">
                <span>(%) - AI recognition confidence</span>
                <span className="text-emerald-400">85%+</span>
                <span className="text-amber-400">70–84%</span>
                <span className="text-rose-400">&lt;70%</span>
              </p>
              <button type="button" onClick={() => { setReviewShot(''); setDraft(null); }} disabled={Boolean(busy)} aria-label="Close" className="text-slate-400 hover:text-white disabled:opacity-40">
                <X size={16} />
              </button>
            </header>
            <div role="tablist" aria-label="Screenshots" className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-slate-800/80 px-4 py-2">
              {SHOT_KINDS.map((kind) => (shotUrls[kind] ? (
                <button
                  key={kind}
                  type="button"
                  role="tab"
                  aria-selected={reviewShot === kind}
                  onClick={() => setReviewShot((current) => (current === kind ? '' : kind))}
                  className={`flex shrink-0 items-center gap-2 rounded-lg border px-1.5 py-1 ${reviewShot === kind ? 'border-slate-400 bg-slate-800' : 'border-slate-800 bg-slate-950 hover:border-slate-600'}`}
                >
                  <img src={shotUrls[kind]} alt="" className="h-10 w-16 rounded object-cover object-top" />
                  <span className={`pr-1 text-[10px] font-bold uppercase tracking-wider ${shotLabelClass(kind)}`}>{SHOT_LABELS[kind]}</span>
                </button>
              ) : null))}
              <button
                type="button"
                onClick={() => readSheet(null, draft.memberUid)}
                disabled={Boolean(busy) || !SHOT_KINDS.some((kind) => files[kind])}
                className={`${quietButton} ml-auto`}
              >
                <RotateCcw size={14} />
                {busy === 'read' ? 'Reading' : 'Retry'}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-4">
            <div className="rounded-xl bg-slate-950/40 p-4">
              <div className="grid grid-cols-3 gap-4">
                <label className="min-w-0">
                  <span className={labelClass}>Name</span>
                  <MemberField
                    people={roster.some((row) => row.uid === draft.memberUid) ? roster : [
                      ...roster,
                      {
                        uid: draft.memberUid,
                        displayName: members[draft.memberUid]?.displayName || members[draft.memberUid]?.inGameName || draft.memberUid,
                      },
                    ]}
                    value={draft.memberUid || ''}
                    onPick={(uid) => updateCharacter({ memberUid: uid })}
                    placeholder="Choose a member"
                    disabled={busy === 'confirm'}
                  />
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
            <div ref={reviewScrollRef} className={`mt-6 scroll-smooth ${reviewShot ? 'overflow-x-auto' : 'overflow-x-hidden'}`}>
            <div className={reviewShot ? 'flex w-max gap-6' : 'grid grid-cols-1 gap-6 xl:grid-cols-3'}>
              {[['general', 'General Stats', 'gvgGeneralStatsCol1', 'gvgGeneralStatsCol2'], ['quasi', 'Quasi-Stats', 'gvgQuasiStatsCol1', 'gvgQuasiStatsCol2']].map(([section, title, leftKey, rightKey]) => (
                <Fragment key={section}>
                <div data-review-section={section} style={reviewShot && columnWidth ? { width: columnWidth } : undefined} className={`${reviewShot ? 'shrink-0' : 'min-w-0'} space-y-2 rounded-xl p-5 ${sectionPanel(section)}`}>
                  <div className={`rounded-md px-2 py-1 text-center text-xs font-semibold uppercase tracking-wider ${sectionTone(section)}`}>{title}</div>
                  <ReviewColumns
                    section={section}
                    left={keywordColumn(draft.readings, section, 'left', settingsQuery.data?.[leftKey] || settingsQuery.data?.[section === 'quasi' ? 'gvgQuasiStats' : 'gvgGeneralStats'])}
                    right={keywordColumn(draft.readings, section, 'right', settingsQuery.data?.[rightKey] || settingsQuery.data?.[section === 'quasi' ? 'gvgQuasiStats' : 'gvgGeneralStats'])}
                    readings={draft.readings}
                    onChange={updateReading}
                  />
                </div>
                {reviewShot === section && shotUrls[section] ? (
                  <ReviewShotPane kind={section} url={shotUrls[section]} width={shotPaneWidth} onClose={() => setReviewShot('')} />
                ) : null}
                </Fragment>
              ))}
              <div data-review-section="special" style={reviewShot && columnWidth ? { width: columnWidth } : undefined} className={`${reviewShot ? 'shrink-0' : 'min-w-0'} space-y-2 rounded-xl p-5 ${sectionPanel('special')}`}>
                <div className={`rounded-md px-2 py-1 text-center text-xs font-semibold uppercase tracking-wider ${sectionTone('special')}`}>Special Stats</div>
                <ReviewStack
                  section="special"
                  cells={keywordColumn(draft.readings, 'special', 'left', specialSource(settingsQuery.data))}
                  readings={draft.readings}
                  onChange={updateReading}
                />
              </div>
              {reviewShot === 'special' && shotUrls.special ? (
                <ReviewShotPane kind="special" url={shotUrls.special} width={shotPaneWidth} onClose={() => setReviewShot('')} />
              ) : null}
            </div>
            </div>
            <div className="mt-6 rounded-xl bg-slate-950/40 p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-200">Other Stats</h3>
                <button
                  type="button"
                  onClick={clearExtras}
                  disabled={Boolean(busy)}
                  aria-label="Clear other stats"
                  className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-40"
                >
                  <Eraser size={14} />
                  Clear
                </button>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2 xl:grid-cols-3">
                {SHEET_EXTRA_FIELDS.map((field) => (
                  <label key={field.key} className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-slate-400" title={field.label}>{field.label}</span>
                    <input
                      inputMode="decimal"
                      autoComplete="off"
                      value={String((draft.extras || emptyExtras())[field.key] ?? '')}
                      disabled={Boolean(busy)}
                      onChange={(event) => updateExtra(field.key, event.target.value)}
                      className="box-border h-7 w-[5.25rem] shrink-0 rounded-lg border border-slate-800 bg-slate-950 px-2 text-right text-xs tabular-nums text-slate-100 outline-none scheme-dark focus:border-slate-600"
                    />
                  </label>
                ))}
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-3">
              <button
                type="button"
                onClick={confirmSheet}
                disabled={Boolean(busy)}
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

      {pageTab === 'overview' ? (
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
          memberName={memberUid ? (members[memberUid]?.displayName || members[memberUid]?.inGameName || '') : ''}
        />
      ) : null}
      <div className={pageTab === 'simulation' ? undefined : 'hidden'}>
        <GvgSimulation roster={roster} snapshots={snapshotsQuery.data || []} selfUid={user?.id || ''} />
      </div>
      {pageTab === 'database' ? (
      <section className={cardClass}>
        <header className={cardHeader}>
          <h2 className={cardTitle}>Stats Database</h2>
          <div className="flex items-center gap-2">
            {isOfficer ? (
              <button
                type="button"
                onClick={() => {
                  setClearText('');
                  setClearOpen(true);
                }}
                className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-950 px-3 text-[11px] font-bold uppercase tracking-wider text-rose-300 hover:border-rose-400"
              >
                <Trash2 size={14} />
                Clear
              </button>
            ) : null}
            <button type="button" onClick={exportSheets} disabled={snapshotsQuery.isLoading} className={primaryButton}>
              <Download size={14} />
              Export
            </button>
          </div>
        </header>
        {snapshotsQuery.isLoading ? (
          <div className={cardBody}>
            <p className="text-xs text-slate-400">Loading the stats database.</p>
          </div>
        ) : snapshotsQuery.isError ? (
          <div className={cardBody}>
            <p className="text-xs text-rose-400">{snapshotsQuery.error?.message || 'Could not load the stats database.'}</p>
          </div>
        ) : savedSheets.rows.length ? (
          <div className="max-h-[32rem] overflow-auto">
            <table className="w-max min-w-full border-collapse text-xs">
              <thead>
                <tr>
                  {savedSheets.headers.map((header, index) => (
                    <th key={`${header}-${index}`} className="sticky top-0 whitespace-nowrap border-b border-slate-800 bg-slate-950 px-3 py-2 text-left text-[10px] font-normal uppercase tracking-wider text-slate-400">{header}</th>
                  ))}
                  {isOfficer ? <th className="sticky top-0 right-0 border-b border-slate-800 bg-slate-950 px-3 py-2" /> : null}
                </tr>
              </thead>
              <tbody>
                {savedSheets.rows.map((row, rowIndex) => (
                  <tr key={`${savedSheets.ids?.[rowIndex] || rowIndex}`} className="border-b border-slate-800/80">
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-200">{cell}</td>
                    ))}
                    {isOfficer ? (
                      <td className="sticky right-0 bg-slate-950 px-3 py-2 text-right">
                        <button
                          type="button"
                          aria-label={`Remove ${row[0]} ${row[2]}`}
                          onClick={() => setRemoveTarget({ id: savedSheets.ids?.[rowIndex] || '', name: row[0], date: row[2] })}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-rose-300 hover:bg-rose-950"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={cardBody}>
            <p className="text-xs text-slate-400">The stats database is empty.</p>
          </div>
        )}
      </section>
      ) : null}
      {removeTarget ? (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div role="dialog" aria-modal="true" aria-labelledby="gvg-remove-title" className="w-full max-w-md space-y-4 rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h2 id="gvg-remove-title" className="text-sm font-bold uppercase tracking-wider text-rose-500">Remove sheet</h2>
            <p className="font-sans text-xs leading-relaxed text-slate-400">Remove {removeTarget.name || 'this member'} taken on {removeTarget.date || 'this day'}. This does not delete the member.</p>
            <div className="flex justify-end gap-3 pt-1 font-mono text-xs">
              <button
                type="button"
                disabled={removing}
                onClick={() => setRemoveTarget(null)}
                className="cursor-pointer rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-slate-400 transition hover:text-white disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={removeSheet}
                disabled={removing || !removeTarget.id}
                className="cursor-pointer rounded-xl bg-rose-600 px-5 py-2 font-bold uppercase tracking-wider text-white shadow-lg transition hover:bg-rose-500 disabled:opacity-40"
              >
                {removing ? 'Removing' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
  const [hoveredStat, setHoveredStat] = useState(null);
  const [hoverAnchor, setHoverAnchor] = useState(null);
  const previewStat = (stat, anchor) => {
    setHoveredStat(stat);
    setHoverAnchor(anchor || null);
  };
  const clearPreview = () => {
    setHoveredStat(null);
    setHoverAnchor(null);
  };
  const activeStat = hoveredStat || selectedStat;

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
    special: {
      left: keywordColumn(viewed?.readings, 'special', 'left', specialSource(config)),
    },
  }), [viewed, config]);

  useEffect(() => {
    const filled = columns.general.left.find((cell) => cell.reading && cell.reading.value != null);
    const current = selectedStat && ['general', 'quasi', 'special'].some((section) => (
      ['left', 'right'].some((column) => (columns[section][column] || []).some((cell) => (
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
  if (!viewed) {
    if (loading) return null;
    const emptyCopy = memberName
      ? 'No confirmed sheet for this member yet.'
      : 'Search a member to open a sheet.';
    return (
      <div className="space-y-5">
        <section className={cardClass}>
          <header className={cardHeader}>
            <h2 className={cardTitle}>Stats Overview</h2>
          </header>
          <div className={cardBody}>
            <p className="text-xs text-slate-400">{emptyCopy}</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className={cardClass}>
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
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-3" onMouseLeave={clearPreview}>
          <div className="min-w-0 space-y-3 rounded-xl bg-emerald-950/25 p-5">
            <div className={`rounded-lg px-3 py-2 text-center text-sm font-semibold uppercase tracking-wider ${generalTone}`}>General Stats</div>
            <StatColumns
              left={columns.general.left}
              right={columns.general.right}
              section="general"
              deltas={viewed.deltas}
              selected={selectedStat}
              preview={hoveredStat}
              onSelect={onSelectStat}
              onPreview={previewStat}
            />
          </div>
          <div className="min-w-0 space-y-3 rounded-xl bg-blue-950/25 p-5">
            <div className={`rounded-lg px-3 py-2 text-center text-sm font-semibold uppercase tracking-wider ${quasiTone}`}>Quasi-Stats</div>
            <StatColumns
              left={columns.quasi.left}
              right={columns.quasi.right}
              section="quasi"
              deltas={viewed.deltas}
              selected={selectedStat}
              preview={hoveredStat}
              onSelect={onSelectStat}
              onPreview={previewStat}
            />
          </div>
          <div className="min-w-0 space-y-3 rounded-xl bg-pink-950/25 p-5">
            <div className={`rounded-lg px-3 py-2 text-center text-sm font-semibold uppercase tracking-wider ${specialTone}`}>Special Stats</div>
            <StatStack
              cells={columns.special.left}
              section="special"
              deltas={viewed.deltas}
              selected={selectedStat}
              preview={hoveredStat}
              onSelect={onSelectStat}
              onPreview={previewStat}
            />
          </div>
        </div>
        </div>
        {hoveredStat && hoverAnchor ? (
          <HoverCompare anchor={hoverAnchor} label={hoveredStat.label}>
            <CompareBars
              compact
              memberName={memberName}
              memberValue={selectedReading?.value}
              average={comparison.average}
              count={comparison.count}
              unit={selectedReading?.unit || comparison.unit}
              peerLabel={[catalogName(jobs, compare.jobCode) || compare.jobCode, catalogName(roles, compare.roleCode) || compare.roleCode].filter(Boolean).join(' · ')}
              statLabel={hoveredStat.label}
            />
          </HoverCompare>
        ) : null}
      </section>
    </div>
  );
}

function CompareSettings({ jobs, roles, compare, onCompare }) {
  const [compareDraft, setCompareDraft] = useState(compare);
  const [compareDirty, setCompareDirty] = useState(false);
  useEffect(() => {
    if (!compareDirty) setCompareDraft(compare);
  }, [compare, compareDirty]);
  const comparePending = compareDraft.jobCode !== compare.jobCode
    || compareDraft.roleCode !== compare.roleCode
    || compareDraft.from !== compare.from
    || compareDraft.to !== compare.to;
  return (
    <section className={`${cardClass} h-full min-h-0`}>
      <header className={cardHeader}>
        <h2 className={cardTitle}>Comparison Graph</h2>
      </header>
      <form
        className="flex min-h-0 flex-1 flex-col p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!comparePending) return;
          onCompare({ ...compareDraft, pinned: true });
          setCompareDirty(false);
        }}
      >
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
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
        <div className="mt-auto flex justify-end pt-3">
          <button type="submit" disabled={!comparePending} className={primaryButton}>
            Apply
          </button>
        </div>
      </form>
    </section>
  );
}

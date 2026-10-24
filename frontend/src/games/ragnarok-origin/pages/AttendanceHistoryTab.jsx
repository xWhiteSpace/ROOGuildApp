import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Mic,
  MicOff,
  CheckCircle,
  XCircle,
  MinusCircle,
  Trash2,
  Swords,
  Search,
} from 'lucide-react';
import {
  COMMITMENT_CONFIRMED,
  COMMITMENT_LEAVE,
  COMMITMENT_NO_CONFIRM,
  normalizeCommitmentStatus,
} from '@guildname/shared/attendanceStatus';
import { apiFetch } from '../../../services/apiClient';
import { queryClient } from '../../../query/client';
import { gvgSheetOptions, invalidateGvgSheet, invalidateGvgSheetWar, invalidateRaidHistory, useGvgSheet, useSettings } from '../../../query/hooks';
import StatisticsTab from './StatisticsTab';

const SLIDES = [
  { id: 'attendance', title: 'Attendance' },
  { id: 'event', title: 'GvG history by event' },
  { id: 'graph', title: 'Attendance Graph' },
];

function viewedAttendanceOffsets() {
  const offsets = [];
  for (const query of queryClient.getQueryCache().findAll({ queryKey: ['gvg-sheet'] })) {
    const params = query.queryKey?.[1];
    if (params?.view !== 'attendance' || !query.state?.data) continue;
    offsets.push(Number(params.offset) || 0);
  }
  return [...new Set(offsets)].sort((a, b) => a - b);
}

const IconSave = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2v-9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>;

const NAME_W = 168;
const ALIAS_W = 132;
const ROLE_W = 96;
const SNOW_W = 156;
const JOB_W = 56;

function identityColumns(namesOpen) {
  const cols = [{ key: 'name', label: 'Name', width: NAME_W }];
  if (namesOpen) {
    cols.push({ key: 'alias', label: 'Alias', width: ALIAS_W });
    cols.push({ key: 'role', label: 'Role', width: ROLE_W });
    cols.push({ key: 'snowflake', label: 'Snowflake', width: SNOW_W });
  }
  cols.push({ key: 'job', label: 'Job', width: JOB_W });
  let left = 0;
  return cols.map((col) => {
    const placed = { ...col, left };
    left += col.width;
    return placed;
  });
}

function CalendarRsvpIcon({ status, size = 14 }) {
  const normalized = normalizeCommitmentStatus(status);
  if (normalized === COMMITMENT_CONFIRMED) return <CheckCircle size={size} className="text-emerald-400" title="Available" />;
  if (normalized === COMMITMENT_LEAVE) return <CheckCircle size={size} className="text-amber-500" title="Leave" />;
  if (normalized === COMMITMENT_NO_CONFIRM) return <MinusCircle size={size} className="text-rose-400" title="No Confirm" />;
  return <XCircle size={size} className="text-slate-600 opacity-40" title="Unanswered" />;
}

function scoreClass(score) {
  if (score >= 4) return 'text-emerald-400';
  if (score >= 2) return 'text-amber-500';
  return 'text-rose-500';
}

function rowName(row) {
  return row?.displayName || row?.snowflake || row?.uid || '';
}

function matchesQuery(row, query, roles) {
  if (!query) return true;
  const roleName = roles?.[row?.roleCode]?.name || '';
  const hay = [rowName(row), row?.alias, row?.jobCode, roleName, row?.snowflake].join(' ').toLowerCase();
  return hay.includes(query);
}

function attendanceMark(date, uid, scores) {
  const map = scores?.[date.id];
  if (map && Object.prototype.hasOwnProperty.call(map, uid)) return { score: map[uid] };
  return {};
}

function emptyNight(totalPulses) {
  return { calendar: 'None', swords: false, discord: false, presentTicks: 0, totalPulses: Number(totalPulses) || 0 };
}

function swordFlags(cells) {
  const flags = {};
  for (const [uid, cell] of Object.entries(cells || {})) flags[uid] = cell?.swords === true;
  return flags;
}

function stickyValue(row, key, roles) {
  if (key === 'name') return rowName(row);
  if (key === 'alias') return row?.alias || '';
  if (key === 'role') return roles?.[row?.roleCode]?.name || '';
  return row?.snowflake || row?.uid || '';
}

function JobIcon({ row, jobs }) {
  const job = jobs?.[row?.jobCode];
  const label = job?.name || row?.jobCode || 'No class';
  return (
    <img
      src={`/assets/icons/classes/${job?.iconFile || 'default.svg'}`}
      alt={label}
      title={label}
      className="mx-auto h-5 w-5 object-contain"
      onError={(event) => { event.target.src = '/assets/icons/classes/default.svg'; }}
    />
  );
}

function DatePager({ loaded, total, onNewer, onOlder }) {
  const shown = Math.min(total, loaded);
  return (
    <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-slate-500">
      <button
        type="button"
        disabled={loaded <= 0}
        onClick={onNewer}
        className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-slate-300 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
      >
        Newer
      </button>
      <span>{total ? `1–${shown} of ${total}` : '0'}</span>
      <button
        type="button"
        disabled={!total || loaded >= total}
        onClick={onOlder}
        className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-slate-300 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
      >
        Older
      </button>
    </div>
  );
}

function MarkCell({ mark }) {
  if (mark && mark.score != null && !mark.dash) {
    return <span className={`font-normal tabular-nums ${scoreClass(Number(mark.score))}`}>{Number(mark.score).toFixed(2)}</span>;
  }
  return null;
}

const LEDGER_LABELS = ['RSVP', 'In-game', 'Discord', 'Duration', 'Score'];

function LedgerCells({ cell, swordsOn, canEdit, onToggle }) {
  const night = cell || emptyNight(0);
  const score = cell && cell.score != null ? Number(cell.score) : null;
  const editable = canEdit;
  return (
    <>
      <td className="border-l border-slate-700 px-2 py-2 text-center"><div className="flex justify-center"><CalendarRsvpIcon status={night.calendar} /></div></td>
      <td className="border-l border-slate-800 px-2 py-2 text-center">
        <button
          type="button"
          disabled={!editable}
          onClick={onToggle}
          className={`p-1 rounded-lg ${editable ? 'cursor-pointer hover:bg-slate-900' : 'cursor-default'} ${swordsOn ? 'text-cyan-400' : editable ? 'text-slate-400' : 'text-slate-600 opacity-40'}`}
          title="In-game"
        >
          <Swords size={14} />
        </button>
      </td>
      <td className="border-l border-slate-800 px-2 py-2 text-center">
        {night.discord ? <Mic size={14} className="inline text-indigo-400" /> : <MicOff size={14} className="inline text-slate-600" />}
      </td>
      <td className="border-l border-slate-800 px-2 py-2 text-center text-[11px] font-normal text-slate-200">
        {night.presentTicks}/{night.totalPulses}
      </td>
      <td className={`border-l border-slate-800 px-2 py-2 text-center font-normal ${score == null ? '' : scoreClass(score)}`}>{score == null ? '' : score.toFixed(2)}</td>
    </>
  );
}

const DETAIL_COLS = [
  { key: 'rsvp', label: 'RSVP', width: 72 },
  { key: 'swords', label: 'In-game', width: 88 },
  { key: 'discord', label: 'Discord', width: 84 },
  { key: 'duration', label: 'Duration', width: 88 },
  { key: 'score', label: 'Score', width: 72 },
];
const OPEN_W = DETAIL_COLS.reduce((sum, col) => sum + col.width, 0);
const COL_W = DETAIL_COLS[DETAIL_COLS.length - 1].width;
const ROW_H = 36;
const YEAR_H = 22;
const DAY_H = 26;
const SUB_H = 28;
const STACK_H = YEAR_H + DAY_H;
const HEAD_H = STACK_H + SUB_H;

function sliceStyle(width) {
  return { width, minWidth: width, maxWidth: width, flexShrink: 0 };
}

function DateDetails({ mark, cell, swordsOn, canEdit, onToggle }) {
  const night = cell || emptyNight(0);
  return (
    <div className="flex items-center" style={{ width: OPEN_W, height: ROW_H }}>
      <div style={sliceStyle(DETAIL_COLS[0].width)} className="flex h-full items-center justify-center"><CalendarRsvpIcon status={night.calendar} /></div>
      <div style={sliceStyle(DETAIL_COLS[1].width)} className="flex h-full items-center justify-center border-l border-slate-800">
        <button
          type="button"
          disabled={!canEdit}
          onClick={onToggle}
          className={`rounded-lg p-1 leading-none ${canEdit ? 'cursor-pointer hover:bg-slate-900' : 'cursor-default'} ${swordsOn ? 'text-cyan-400' : canEdit ? 'text-slate-400' : 'text-slate-600 opacity-40'}`}
          title="In-game"
        >
          <Swords size={14} />
        </button>
      </div>
      <div style={sliceStyle(DETAIL_COLS[2].width)} className="flex h-full items-center justify-center border-l border-slate-800">
        {night.discord ? <Mic size={14} className="text-indigo-400" /> : <MicOff size={14} className="text-slate-600 opacity-40" />}
      </div>
      <div style={sliceStyle(DETAIL_COLS[3].width)} className="flex h-full items-center justify-center border-l border-slate-800 text-center text-[10px] font-normal leading-none text-slate-400">
        {night.presentTicks}/{night.totalPulses}
      </div>
      <div style={sliceStyle(DETAIL_COLS[4].width)} className="flex h-full items-center justify-center border-l border-slate-800 text-center">
        <MarkCell mark={mark} />
      </div>
    </div>
  );
}

function sheetDateLabel(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  if (!match) return { year: value || 'War', day: '' };
  return { year: match[1], day: `${match[2]}-${match[3]}` };
}
function scoreFill(score) {
  if (score >= 4) return '#34d399';
  if (score >= 2) return '#f59e0b';
  return '#f43f5e';
}

function memberGraphPoints(dates, uid, markFor) {
  return dates.slice().reverse().map((date) => {
    const mark = markFor(date, uid);
    const has = mark && mark.score != null && !mark.dash;
    const label = sheetDateLabel(date.eventDate || date.eventTitle);
    return { id: date.id, day: label.day || label.year, score: has ? Number(mark.score) : null };
  });
}

function MemberScoreChart({ name, points, height, minWidth = 720 }) {
  const scored = points.some((point) => point.score != null);
  if (!scored) {
    return (
      <div className="flex h-full items-center justify-center text-[11px] font-mono text-slate-500">
        {name} has no scores on the loaded dates.
      </div>
    );
  }
  const slot = 40;
  const padL = 44;
  const padR = 28;
  const padT = 28;
  const padB = 56;
  const plotW = Math.max(minWidth - padL - padR, Math.max(points.length - 1, 1) * slot);
  const width = padL + padR + plotW;
  const plotH = Math.max(80, height - padT - padB);
  const axisY = padT + plotH;
  const axisX = width - padR;
  const yFor = (score) => axisY - (Math.max(0, Math.min(4, score)) / 4) * plotH;
  const xFor = (index) => (points.length <= 1 ? padL + plotW / 2 : padL + (index / (points.length - 1)) * plotW);
  const runs = [];
  let run = [];
  points.forEach((point, index) => {
    if (point.score == null) {
      if (run.length) runs.push(run);
      run = [];
      return;
    }
    run.push(index);
  });
  if (run.length) runs.push(run);
  const major = points.map((point, index) => {
    const month = String(point.day || '').slice(0, 2);
    const prev = index > 0 ? String(points[index - 1].day || '').slice(0, 2) : '';
    return index === 0 || month !== prev;
  });
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${axisY + padB}`} className="block max-w-none" role="img" aria-label={`${name} scores`}>
      <text x={padL} y={16} fill="#cbd5e1" style={{ fontSize: '12px' }}>{name}</text>
      {points.map((point, index) => (
        <line
          key={`v-${point.id}`}
          x1={xFor(index)}
          y1={padT}
          x2={xFor(index)}
          y2={axisY}
          stroke={major[index] ? '#475569' : '#1e293b'}
        />
      ))}
      {[0, 1, 2, 3, 4].map((level) => (
        <g key={level}>
          {level > 0 && <line x1={padL} y1={yFor(level)} x2={axisX} y2={yFor(level)} stroke="#1e293b" />}
          <line x1={padL - 5} y1={yFor(level)} x2={padL} y2={yFor(level)} stroke="#94a3b8" />
          <text x={padL - 8} y={yFor(level) + 3} textAnchor="end" fill="#64748b" style={{ fontSize: '10px' }}>{level}</text>
        </g>
      ))}
      <line x1={padL} y1={padT} x2={padL} y2={axisY} stroke="#94a3b8" />
      <line x1={padL} y1={axisY} x2={axisX} y2={axisY} stroke="#94a3b8" />
      {points.map((point, index) => (
        <line key={`tick-${point.id}`} x1={xFor(index)} y1={axisY} x2={xFor(index)} y2={axisY + 5} stroke="#94a3b8" />
      ))}
      {runs.map((indexes) => (
        <path
          key={indexes[0]}
          d={indexes.map((index, i) => `${i === 0 ? 'M' : 'L'} ${xFor(index)} ${yFor(points[index].score)}`).join(' ')}
          stroke="#94a3b8"
          strokeWidth="2"
          fill="none"
        />
      ))}
      {points.map((point, index) => (point.score == null ? null : (
        <circle key={point.id} cx={xFor(index)} cy={yFor(point.score)} r="4" fill={scoreFill(point.score)}>
          <title>{`${point.day} ${point.score.toFixed(2)}`}</title>
        </circle>
      )))}
      {points.map((point, index) => (
        <text
          key={`${point.id}-x`}
          x={xFor(index)}
          y={axisY + 8}
          textAnchor="end"
          fill="#64748b"
          transform={`rotate(-45 ${xFor(index)} ${axisY + 8})`}
          style={{ fontSize: '10px' }}
        >
          {point.day}
        </text>
      ))}
    </svg>
  );
}

function frameStyle(open) {
  const width = open ? OPEN_W : COL_W;
  return {
    width,
    minWidth: width,
    maxWidth: width,
  };
}

function SheetTable({ rows, dates, markFor, expandedId, details, swordDraft, isOfficer, jobs, roles, onToggleExpand, onToggleSword, ledger = false, ledgerSessionId = '', ledgerCells = null, scrollRef = null }) {
  const [namesOpen, setNamesOpen] = useState(false);
  const [graphUid, setGraphUid] = useState('');
  const [graphBox, setGraphBox] = useState({ height: 280, width: 640 });
  const memberRowRef = useRef(null);
  const columns = identityColumns(namesOpen);
  const ledgerMode = ledger && Boolean(ledgerSessionId);
  const trailCount = ledgerMode ? LEDGER_LABELS.length : dates.length;
  const stickyStyle = (col, header) => ({
    left: col.left,
    width: col.width,
    minWidth: col.width,
    maxWidth: col.width,
    zIndex: header ? 30 : 10,
  });
  const headStyle = (col) => ({
    ...stickyStyle(col, true),
    height: ledgerMode ? 36 : HEAD_H,
  });
  const identityWidth = columns.reduce((sum, col) => sum + col.width, 0);
  const [pan, setPan] = useState({ left: false, right: false });
  useEffect(() => {
    const node = scrollRef?.current;
    if (!node || ledgerMode) return undefined;
    const sync = () => {
      setPan({
        left: node.scrollLeft > 2,
        right: node.scrollLeft + node.clientWidth < node.scrollWidth - 2,
      });
    };
    sync();
    node.addEventListener('scroll', sync, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => {
      node.removeEventListener('scroll', sync);
      observer.disconnect();
    };
  }, [scrollRef, ledgerMode, dates.length, rows.length, namesOpen]);
  useEffect(() => {
    if (!graphUid || ledgerMode) return undefined;
    const scroller = scrollRef?.current;
    const row = memberRowRef.current;
    if (!scroller || !row) return undefined;
    const viewH = scroller.clientHeight;
    const graphH = Math.max(220, Math.round(viewH * 0.5));
    setGraphBox({ height: graphH, width: scroller.clientWidth });
    const frame = requestAnimationFrame(() => {
      const rowTop = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      const target = rowTop - (viewH - graphH - row.offsetHeight);
      scroller.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [graphUid, ledgerMode, scrollRef]);
  const nudge = (direction) => {
    const node = scrollRef?.current;
    if (!node) return;
    const room = Math.max(node.clientWidth - identityWidth - 24, COL_W);
    node.scrollBy({ left: direction * room, behavior: 'smooth' });
  };
  const yearGroups = [];
  const dateWidths = [];
  if (!ledgerMode) {
    for (const date of dates) {
      dateWidths.push(date.id === expandedId ? OPEN_W : COL_W);
      const year = sheetDateLabel(date.eventDate || date.eventTitle).year;
      const last = yearGroups[yearGroups.length - 1];
      if (last && last.year === year) last.count += 1;
      else yearGroups.push({ year, count: 1 });
    }
  }
  const tableWidth = identityWidth + dateWidths.reduce((sum, width) => sum + width, 0);
  return (
    <div className="relative min-h-0 w-full min-w-0 flex-1">
    <div ref={scrollRef} className="h-full w-full min-w-0 overflow-auto border border-slate-800 rounded-xl bg-slate-950">
      <table
        className={`border-separate border-spacing-0 text-xs ${ledgerMode ? 'w-max' : ''}`}
        style={ledgerMode ? undefined : { tableLayout: 'fixed', width: tableWidth }}
      >
        {!ledgerMode && (
          <colgroup>
            {columns.map((col) => <col key={col.key} style={{ width: col.width }} />)}
            {dates.map((date, index) => <col key={date.id} style={{ width: dateWidths[index] }} />)}
          </colgroup>
        )}
        <thead className="sticky top-0 z-20 bg-slate-950 text-[9px] font-mono font-bold uppercase tracking-wider text-slate-400">
          <tr>
            {columns.map((col) => (
              <th key={col.key} rowSpan={ledgerMode ? undefined : 3} style={headStyle(col)} className="sticky box-border border-b border-slate-600 bg-slate-950 px-3 text-left">
                {col.key === 'name' ? (
                  <button
                    type="button"
                    onClick={() => setNamesOpen((open) => !open)}
                    className="inline-flex items-center gap-1 cursor-pointer text-slate-300 hover:text-white"
                    aria-expanded={namesOpen}
                  >
                    <span>Name</span>
                    <ChevronRight size={12} className={`transition ${namesOpen ? 'rotate-90' : ''}`} />
                  </button>
                ) : col.label}
              </th>
            ))}
            {ledgerMode ? LEDGER_LABELS.map((label, index) => (
              <th key={label} className={`box-border h-9 border-b border-slate-600 border-l bg-slate-950 px-2 text-center min-w-24 ${index === 0 ? 'border-l-slate-700' : 'border-l-slate-800'}`}>{label}</th>
            )) : yearGroups.map((group) => (
              <th key={group.year} colSpan={group.count} style={{ height: YEAR_H }} className="box-border border-b border-l border-slate-600 border-l-slate-700 bg-slate-950 p-0 text-left text-[11px] font-normal normal-case tracking-normal text-slate-300">
                <span className="sticky inline-block px-3 leading-[22px]" style={{ left: identityWidth }}>{group.year}</span>
              </th>
            ))}
          </tr>
          {!ledgerMode && (
            <tr>
              {dates.map((date) => {
                const label = sheetDateLabel(date.eventDate || date.eventTitle);
                const open = date.id === expandedId;
                return (
                  <th key={date.id} style={{ ...frameStyle(open), height: DAY_H }} className="box-border overflow-hidden border-l border-slate-700 bg-slate-950 p-0 text-slate-300">
                    <button
                      type="button"
                      onClick={() => onToggleExpand(date.id)}
                      className="flex h-full w-full cursor-pointer items-center text-[10px] font-normal normal-case tracking-normal hover:bg-slate-900 hover:text-white"
                      aria-expanded={open}
                      title={date.eventDate || date.eventTitle || 'War'}
                    >
                      <span className="inline-flex items-center justify-center gap-0.5" style={{ width: COL_W }}>
                        <span>{label.day}</span>
                        <ChevronRight size={10} className={`transition ${open ? 'rotate-90' : ''}`} />
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          )}
          {!ledgerMode && (
            <tr className="text-[8px] text-slate-500">
              {dates.map((date) => {
                const open = date.id === expandedId;
                return (
                  <th
                    key={`${date.id}-sub`}
                    style={{ ...frameStyle(open), height: SUB_H }}
                    className="box-border overflow-hidden border-b border-l border-slate-600 border-l-slate-700 bg-slate-950 p-0"
                  >
                    {open && (
                      <div className="flex h-full items-center">
                        {DETAIL_COLS.map((col, index) => (
                          <div key={col.key} style={sliceStyle(col.width)} className={`text-center font-normal tracking-normal whitespace-nowrap ${index === 0 ? '' : 'border-l border-slate-800'}`}>{col.label}</div>
                        ))}
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          )}
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const showArchived = row.archived && !rows[index - 1]?.archived;
            const ledgerCell = ledgerMode ? ledgerCells?.[row.uid] : null;
            const ledgerSwords = swordDraft?.sessionId === ledgerSessionId && swordDraft.flags
              ? swordDraft.flags[row.uid] === true
              : ledgerCell?.swords === true;
            const graphOpen = !ledgerMode && graphUid === row.uid;
            return (
            <Fragment key={row.uid}>
            {showArchived && (
              <tr>
                <td colSpan={columns.length + trailCount} className="bg-slate-900 px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-slate-400">
                  No longer on the roster
                </td>
              </tr>
            )}
            <tr ref={graphOpen ? memberRowRef : null} className={`border-t border-slate-900 ${row.archived ? 'opacity-70' : ''}`}>
              {columns.map((col) => (
                <td
                  key={col.key}
                  style={{ ...stickyStyle(col, false), height: ROW_H }}
                  className={`sticky box-border h-9 overflow-hidden text-slate-200 truncate ${col.key === 'name' && !ledgerMode ? 'p-0' : 'px-3'} ${graphOpen ? 'bg-slate-900' : 'bg-slate-950'} ${col.key === 'job' ? 'text-center' : ''} ${col.key === 'snowflake' ? 'font-mono text-[10px] text-slate-400' : ''}`}
                >
                  {col.key === 'job' ? <JobIcon row={row} jobs={jobs} /> : col.key === 'name' && !ledgerMode ? (
                    <button
                      type="button"
                      onClick={() => setGraphUid((current) => (current === row.uid ? '' : row.uid))}
                      className={`flex h-full w-full items-center truncate px-3 text-left cursor-pointer hover:bg-slate-900 hover:text-white ${graphOpen ? 'text-white' : ''}`}
                      aria-expanded={graphOpen}
                    >
                      {stickyValue(row, col.key, roles)}
                    </button>
                  ) : stickyValue(row, col.key, roles)}
                </td>
              ))}
              {ledgerMode ? (
                <LedgerCells
                  cell={ledgerCell}
                  swordsOn={ledgerSwords}
                  canEdit={isOfficer && Boolean(ledgerCell)}
                  onToggle={() => onToggleSword(row.uid)}
                />
              ) : dates.map((date) => {
                const open = date.id === expandedId;
                const mark = markFor(date, row.uid);
                if (!open) {
                  return (
                    <td key={date.id} style={{ ...frameStyle(false), height: ROW_H }} className="box-border border-l border-slate-700 p-0 text-center">
                      <div className="flex h-full items-center justify-center">
                        <MarkCell mark={mark} />
                      </div>
                    </td>
                  );
                }
                const loaded = details?.id === date.id ? details?.cells?.[row.uid] : null;
                const cell = loaded || emptyNight(date.totalPulses);
                const swordsOn = swordDraft?.sessionId === date.id && swordDraft.flags
                  ? swordDraft.flags[row.uid] === true
                  : cell?.swords === true;
                return (
                  <td key={date.id} style={{ ...frameStyle(true), height: ROW_H }} className="box-border overflow-hidden border-l border-slate-700 p-0">
                    <DateDetails
                      mark={mark}
                      cell={cell}
                      swordsOn={swordsOn}
                      canEdit={isOfficer && Boolean(loaded)}
                      onToggle={() => onToggleSword(row.uid)}
                    />
                  </td>
                );
              })}
            </tr>
            {graphOpen && (
              <tr>
                <td colSpan={columns.length + trailCount} className="border-t border-slate-800 bg-slate-950 p-0">
                  <div className="w-0 min-w-full">
                    <div className="sticky left-0 overflow-x-auto overflow-y-hidden" style={{ width: graphBox.width, height: graphBox.height }}>
                      <MemberScoreChart name={rowName(row)} points={memberGraphPoints(dates, row.uid, markFor)} height={graphBox.height} minWidth={graphBox.width} />
                    </div>
                  </div>
                </td>
              </tr>
            )}
            </Fragment>
            );
          })}
          {!rows.length && (
            <tr>
              <td colSpan={columns.length + trailCount} className="px-4 py-10 text-center text-[11px] font-mono text-slate-500">
                No rows on this sheet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
    {!ledgerMode && dates.length > 0 && (
      <>
        <button
          type="button"
          aria-label="Newer dates"
          disabled={!pan.left}
          onClick={() => nudge(-1)}
          className="absolute top-1/2 z-40 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-slate-700 bg-slate-950/90 text-slate-200 shadow-lg cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ left: identityWidth }}
        >
          <ChevronsLeft size={14} />
        </button>
        <button
          type="button"
          aria-label="Older dates"
          disabled={!pan.right}
          onClick={() => nudge(1)}
          className="absolute top-1/2 right-4 z-40 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-slate-700 bg-slate-950/90 text-slate-200 shadow-lg cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronsRight size={14} />
        </button>
      </>
    )}
    </div>
  );
}

export default function AttendanceHistoryTab({ user }) {
  const isOfficer = user?.isOfficer === true;
  const settingsQuery = useSettings('jobs,roles');
  const jobs = settingsQuery.data?.jobs || {};
  const roles = settingsQuery.data?.roles || {};
  const [slideIndex, setSlideIndex] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('slide');
    const index = SLIDES.findIndex((item) => item.id === requested);
    return index >= 0 ? index : 0;
  });
  const [pages, setPages] = useState(viewedAttendanceOffsets);
  const [search, setSearch] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [expandedId, setExpandedId] = useState('');
  const [swordDraft, setSwordDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const sheetScrollRef = useRef(null);
  const scrollOlder = useRef(false);

  const slide = SLIDES[slideIndex];
  const attendanceOpen = pages.length > 0;
  const pageQueries = useQueries({
    queries: pages.map((pageOffset) => gvgSheetOptions({ view: 'attendance', offset: pageOffset })),
  });
  const catalogQuery = useGvgSheet({ view: 'catalog' }, { enabled: slide.id === 'event' });
  const eventQuery = useGvgSheet(
    { view: 'event', sessionId: selectedSessionId },
    { enabled: slide.id === 'event' && Boolean(selectedSessionId) },
  );
  const attendanceCells = useMemo(() => {
    const cells = {};
    for (const query of pageQueries) Object.assign(cells, query.data?.cells || {});
    return cells;
  }, [pageQueries]);
  const cellGap = pageQueries
    .filter((query) => query.data?.dates?.length && !query.data.cells)
    .map((query) => Number(query.data.offset) || 0)
    .join(',');

  useEffect(() => {
    if (!cellGap) return;
    for (const offset of cellGap.split(',')) {
      queryClient.invalidateQueries({
        queryKey: ['gvg-sheet', { view: 'attendance', offset: Number(offset) }],
      });
    }
  }, [cellGap]);

  useEffect(() => {
    const cells = attendanceCells[expandedId];
    if (!expandedId || !cells) return;
    setSwordDraft((prev) => (prev?.sessionId === expandedId ? prev : { sessionId: expandedId, flags: swordFlags(cells) }));
  }, [expandedId, attendanceCells]);

  const swordSessionId = slide.id === 'event' ? selectedSessionId : expandedId;
  const swordCells = slide.id === 'event'
    ? (eventQuery.data?.date?.id === selectedSessionId ? eventQuery.data?.cells : null)
    : (attendanceCells[expandedId] || null);

  const swordDirty = useMemo(() => {
    if (!swordDraft || swordDraft.sessionId !== swordSessionId || !swordCells) return false;
    return Object.keys(swordCells).some((uid) => (swordCells[uid]?.swords === true) !== (swordDraft.flags?.[uid] === true));
  }, [swordDraft, swordSessionId, swordCells]);

  const leaveEdits = () => {
    if (!swordDirty) return true;
    if (!window.confirm('Sword changes are not saved. Leave without saving?')) return false;
    setSwordDraft(null);
    return true;
  };

  const goSlide = (next) => {
    if (!leaveEdits()) return;
    setExpandedId('');
    setSlideIndex((next + SLIDES.length) % SLIDES.length);
  };
  const goSlideRef = useRef(goSlide);
  const slideIndexRef = useRef(slideIndex);
  goSlideRef.current = goSlide;
  slideIndexRef.current = slideIndex;

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      event.preventDefault();
      const delta = event.key === 'ArrowRight' ? 1 : -1;
      goSlideRef.current(slideIndexRef.current + delta);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleExpand = (sessionId) => {
    if (expandedId === sessionId) {
      if (!leaveEdits()) return;
      setExpandedId('');
      return;
    }
    if (!leaveEdits()) return;
    setSwordDraft(null);
    setExpandedId(sessionId);
  };

  const toggleSword = (uid) => {
    if (!isOfficer || !swordSessionId) return;
    setSwordDraft((prev) => {
      const flags = { ...(prev?.sessionId === swordSessionId ? prev.flags : swordFlags(swordCells)) };
      flags[uid] = flags[uid] !== true;
      return { sessionId: swordSessionId, flags };
    });
  };

  const saveSwords = async () => {
    if (!isOfficer || !swordSessionId || !swordDirty || saving) return;
    const inGameStatus = {};
    for (const [uid, on] of Object.entries(swordDraft?.flags || {})) {
      if (on) inGameStatus[uid] = true;
    }
    setSaving(true);
    try {
      const res = await apiFetch(`/api/live-raid/history/${encodeURIComponent(swordSessionId)}/in-game`, {
        method: 'PUT',
        body: JSON.stringify({ inGameStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        alert(data.error || 'Failed to save in-game.');
        return;
      }
      setSwordDraft({ sessionId: swordSessionId, flags: { ...(swordDraft?.flags || {}) } });
      await Promise.all([invalidateGvgSheetWar(swordSessionId), invalidateRaidHistory()]);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteSession = async (sessionId, label) => {
    if (!sessionId) return;
    if (!window.confirm(`Delete ${label || 'this war'}? This cannot be undone.`)) return;
    const res = await apiFetch(`/api/live-raid/history/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      alert(data.error || 'Failed to delete.');
      return;
    }
    if (selectedSessionId === sessionId) setSelectedSessionId('');
    if (expandedId === sessionId) setExpandedId('');
    await Promise.all([invalidateGvgSheet(), invalidateRaidHistory()]);
  };

  const attendanceDates = useMemo(() => pageQueries.flatMap((query) => query.data?.dates || []), [pageQueries]);
  const attendanceScores = useMemo(() => {
    const scores = {};
    for (const query of pageQueries) Object.assign(scores, query.data?.scores || {});
    return scores;
  }, [pageQueries]);
  const attendanceTotal = pageQueries[0]?.data?.total || 0;

  useEffect(() => {
    if (!scrollOlder.current || !sheetScrollRef.current) return;
    scrollOlder.current = false;
    const node = sheetScrollRef.current;
    node.scrollTo({ left: node.scrollWidth, behavior: 'smooth' });
  }, [attendanceDates.length]);

  const attendanceRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = pageQueries[0]?.data?.rows || [];
    return rows.filter((row) => {
      if (!matchesQuery(row, q, roles)) return false;
      if (!row.archived) return true;
      return attendanceDates.some((date) => {
        const map = attendanceScores[date.id];
        return map && Object.prototype.hasOwnProperty.call(map, row.uid);
      });
    });
  }, [pageQueries, attendanceDates, attendanceScores, search, roles]);

  const loading = slide.id === 'attendance'
    ? Boolean(pageQueries[0]?.isLoading && !pageQueries[0]?.data)
    : slide.id === 'event'
      ? catalogQuery.isLoading && !catalogQuery.data
      : false;
  const sheetError = slide.id === 'attendance'
    ? pageQueries.find((query) => query.error)?.error
    : slide.id === 'event'
      ? (catalogQuery.error || eventQuery.error)
      : null;

  return (
    <div className={`flex min-h-0 w-full min-w-0 flex-col gap-3 font-sans ${slide.id === 'graph' ? 'h-[calc(100vh-8rem)]' : 'h-[calc(100vh-12rem)]'}`}>
      <div className="grid shrink-0 grid-cols-1 items-center gap-3 lg:grid-cols-[1fr_auto_1fr]">
        <div className="hidden lg:block" />
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => goSlide(slideIndex - 1)} className="rounded-xl border border-slate-800 bg-slate-950 p-1.5 text-slate-400 hover:text-white cursor-pointer" aria-label="Previous view">
              <ChevronLeft size={16} />
            </button>
            <h1 className="text-xs font-bold uppercase tracking-wider text-slate-200">{slide.title}</h1>
            <button type="button" onClick={() => goSlide(slideIndex + 1)} className="rounded-xl border border-slate-800 bg-slate-950 p-1.5 text-slate-400 hover:text-white cursor-pointer" aria-label="Next view">
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="flex gap-1.5">
            {SLIDES.map((item, index) => (
              <button
                key={item.id}
                type="button"
                aria-label={item.title}
                onClick={() => { if (leaveEdits()) { setExpandedId(''); setSlideIndex(index); } }}
                className={`h-1.5 rounded-full cursor-pointer ${index === slideIndex ? 'w-5 bg-indigo-500' : 'w-1.5 bg-slate-700'}`}
              />
            ))}
          </div>
        </div>
        <div className="flex justify-center lg:justify-end">
          {slide.id === 'attendance' && (
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-2 text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search the sheet..."
                className="w-56 rounded-xl border border-slate-800 bg-slate-950 py-1.5 pl-7 pr-3 text-[11px] text-slate-200 outline-none"
              />
            </div>
          )}
          {slide.id === 'attendance' && attendanceOpen && (
            <div className="ml-3">
              <DatePager
                loaded={attendanceDates.length}
                total={attendanceTotal}
                onNewer={() => sheetScrollRef.current?.scrollTo({ left: 0, behavior: 'smooth' })}
                onOlder={() => {
                  if (!leaveEdits()) return;
                  const last = pages[pages.length - 1] ?? 0;
                  const next = last + 8;
                  if (next >= attendanceTotal || pages.includes(next)) return;
                  scrollOlder.current = true;
                  setExpandedId('');
                  setPages((prev) => (prev.includes(next) ? prev : [...prev, next]));
                }}
              />
            </div>
          )}
        </div>
      </div>

      {loading && <div className="py-16 text-center text-[11px] font-mono uppercase tracking-widest text-slate-500">Loading the sheet...</div>}
      {sheetError && (
        <div className="rounded-xl border border-rose-900/60 bg-rose-950/30 px-4 py-3 text-[11px] font-mono text-rose-300">
          {sheetError.message || 'The sheet could not be loaded.'}
        </div>
      )}

      {!loading && slide.id === 'attendance' && !attendanceOpen && (
        <div className="flex justify-center py-16">
          <button
            type="button"
            onClick={() => setPages([0])}
            className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-[11px] font-normal uppercase tracking-wider text-slate-200 cursor-pointer hover:border-slate-500"
          >
            View
          </button>
        </div>
      )}

      {!loading && slide.id === 'attendance' && attendanceOpen && (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <SheetTable
          rows={attendanceRows}
          dates={attendanceDates}
          markFor={(date, uid) => attendanceMark(date, uid, attendanceScores)}
          expandedId={expandedId}
          details={expandedId ? { id: expandedId, cells: attendanceCells[expandedId] || null } : null}
          swordDraft={swordDraft}
          isOfficer={isOfficer}
          jobs={jobs}
          roles={roles}
          onToggleExpand={toggleExpand}
          onToggleSword={toggleSword}
          scrollRef={sheetScrollRef}
        />
        </div>
      )}

      {!loading && slide.id === 'event' && (
        <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[16rem_1fr]">
          <div className="min-h-0 space-y-1 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-2">
            {(catalogQuery.data?.dates || []).map((date) => (
              <button
                key={date.id}
                type="button"
                onClick={() => { if (!leaveEdits()) return; setExpandedId(''); setSelectedSessionId(date.id); }}
                className={`block w-full rounded-lg px-3 py-2 text-left text-[11px] cursor-pointer ${selectedSessionId === date.id ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-900'}`}
              >
                <span className="block font-bold">{date.eventDate || 'War'}</span>
                <span className="block truncate text-[10px] opacity-70">{date.eventTitle || date.id}</span>
              </button>
            ))}
            {!catalogQuery.data?.dates?.length && <div className="px-2 py-6 text-center text-[11px] text-slate-500">No wars yet.</div>}
          </div>
          <div className="flex min-h-0 flex-col gap-2">
            {eventQuery.data?.date && (
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  {eventQuery.data.date.eventTitle || eventQuery.data.date.eventDate}
                </div>
                {isOfficer && (
                  <button
                    type="button"
                    onClick={() => deleteSession(eventQuery.data.date.id, eventQuery.data.date.eventDate)}
                    className="rounded-lg border border-slate-800 p-1.5 text-slate-500 hover:text-rose-400 cursor-pointer"
                    aria-label="Delete war"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            )}
            {eventQuery.isLoading && !eventQuery.data && (
              <div className="py-10 text-center text-[11px] font-mono text-slate-500">Loading this war...</div>
            )}
            {!selectedSessionId && (
              <div className="py-10 text-center text-[11px] font-normal text-slate-500">Choose a war.</div>
            )}
            {selectedSessionId && (!eventQuery.isLoading || eventQuery.data) && (
            <SheetTable
              rows={eventQuery.data?.rows || []}
              dates={[]}
              markFor={() => ({ score: 0 })}
              expandedId=""
              details={null}
              swordDraft={swordDraft}
              isOfficer={isOfficer}
              jobs={jobs}
              roles={roles}
              onToggleExpand={toggleExpand}
              onToggleSword={toggleSword}
              ledger
              ledgerSessionId={eventQuery.data?.date?.id || ''}
              ledgerCells={eventQuery.data?.cells || null}
            />
            )}
          </div>
        </div>
      )}

      {slide.id === 'graph' && (
        <div className="min-h-0 min-w-0 flex-1 overflow-auto">
          <StatisticsTab user={user} embedded />
        </div>
      )}

      {slide.id !== 'graph' && (
        <div className="fixed bottom-0 right-0 left-[var(--valhalla-sidebar-width,16rem)] border-t border-slate-900 bg-slate-950/90 backdrop-blur-md p-4 z-50 shadow-[0_-8px_24px_rgba(0,0,0,0.5)]">
          <div className="mx-auto flex max-w-6xl items-center justify-end">
            <button
              type="button"
              onClick={saveSwords}
              disabled={!swordDirty || saving || !isOfficer}
              aria-label="Save Attendance"
              className={`inline-flex items-center gap-1.5 rounded-xl px-6 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-xl cursor-pointer ${
                swordDirty && !saving
                  ? 'bg-indigo-600 hover:bg-indigo-500'
                  : 'border border-slate-800 bg-slate-900 text-slate-600 cursor-not-allowed shadow-none'
              }`}
            >
              <IconSave /> Save Attendance
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

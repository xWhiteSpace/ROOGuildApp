import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Globe } from 'lucide-react';
import { Link } from 'react-router-dom';
import ValhallaLockup from '../components/ValhallaLockup';
import FocusSpace from './debug/FocusSpace';

const STATUS_COLOR = {
  passed: '#34d399',
  failed: '#fb7185',
  skipped: '#fbbf24',
  notRun: '#64748b',
};

const STATUS_LABEL = {
  passed: 'Passed',
  failed: 'Failed',
  skipped: 'Skipped',
  notRun: 'Not run',
};

const V_VIEW = { w: 1000, h: 820 };

const V_ROWS = [
  { level: 'acceptance', left: 'Requirements', right: 'Acceptance test', lx: 120, ly: 70, rx: 880, ry: 70, z: 64 },
  { level: 'system', left: 'Functional', right: 'System test', lx: 220, ly: 230, rx: 780, ry: 230, z: 16 },
  { level: 'integration', left: 'System', right: 'Integration', lx: 320, ly: 390, rx: 680, ry: 390, z: -28 },
  { level: 'unit', left: 'Unit', right: 'Unit test', lx: 400, ly: 550, rx: 600, ry: 550, z: -76 },
];

const CODING = { x: 500, y: 720, z: -120 };
const RAIL_CYAN = '#22d3ee';
const DOLLY_MS = 600;
const DOLLY_EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
const LEFT_KINDS = {
  acceptance: ['USR', 'REQ'],
  system: ['FNC', 'API'],
  integration: ['INT', 'CMP'],
  unit: ['UNT'],
};

function kindOf(id) {
  return String(id || '').split('-')[0];
}

function tracesFor(level, kinds) {
  const map = new Map();
  for (const check of level?.checks || []) {
    for (const id of check.verifies || []) {
      const kind = kindOf(id);
      if (!kinds.includes(kind)) continue;
      if (!map.has(id)) map.set(id, { id, kind, checks: [] });
      map.get(id).checks.push(check);
    }
  }
  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id, 'en'));
}

function countByKind(traces, kinds) {
  const counts = Object.fromEntries(kinds.map((kind) => [kind, 0]));
  for (const item of traces) counts[item.kind] += 1;
  return counts;
}

function pctX(x) {
  return `${(x / V_VIEW.w) * 100}%`;
}

function pctY(y) {
  return `${(y / V_VIEW.h) * 100}%`;
}

function railPoints(side) {
  return [
    ...V_ROWS.map((row) => (side === 'left' ? `${row.lx},${row.ly}` : `${row.rx},${row.ry}`)),
    `${CODING.x},${CODING.y}`,
  ].join(' ');
}

const LEFT_RAIL = railPoints('left');
const RIGHT_RAIL = railPoints('right');

const FLOOR = { w: 2240, h: 1400, g: 56 };

function floorGridPath() {
  const parts = [];
  for (let x = 0; x <= FLOOR.w; x += FLOOR.g) parts.push(`M${x} 0 V${FLOOR.h}`);
  for (let y = 0; y <= FLOOR.h; y += FLOOR.g) parts.push(`M0 ${y} H${FLOOR.w}`);
  return parts.join(' ');
}

const FLOOR_GRID_PATH = floorGridPath();

function nodeKey(level, side) {
  return `${level}:${side}`;
}

function sameHot(hot, level, side) {
  return Boolean(hot && hot.level === level && hot.side === side);
}

function emptyTotals() {
  return { passed: 0, failed: 0, skipped: 0, notRun: 0 };
}

function toneOf(counts) {
  const safe = counts || emptyTotals();
  if (safe.failed) return STATUS_COLOR.failed;
  if (safe.passed && !safe.notRun) return STATUS_COLOR.passed;
  if (safe.skipped && !safe.passed) return STATUS_COLOR.skipped;
  return RAIL_CYAN;
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function Donut({ totals }) {
  const parts = ['passed', 'failed', 'skipped', 'notRun'].map((key) => ({
    key,
    value: totals[key] || 0,
    color: STATUS_COLOR[key],
  }));
  const total = parts.reduce((sum, part) => sum + part.value, 0) || 1;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let cursor = 0;

  return (
    <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0" role="img" aria-label="Passed, failed, skipped, and not run">
      <g transform="rotate(-90 70 70)">
        {parts.map((part) => {
          const length = (part.value / total) * circumference;
          const slice = (
            <circle
              key={part.key}
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke={part.color}
              strokeWidth="16"
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-cursor}
            />
          );
          cursor += length;
          return slice;
        })}
      </g>
      <text x="70" y="68" textAnchor="middle" fill="#f8fafc" fontSize="22" fontFamily="ui-sans-serif, system-ui, sans-serif">
        {total}
      </text>
      <text x="70" y="86" textAnchor="middle" fill="#94a3b8" fontSize="10" fontFamily="ui-sans-serif, system-ui, sans-serif">
        checks
      </text>
    </svg>
  );
}

function StatusPill({ status }) {
  const tone = status === 'passed'
    ? 'bg-emerald-400/15 text-emerald-300'
    : status === 'failed'
      ? 'bg-rose-400/15 text-rose-300'
      : status === 'skipped'
        ? 'bg-amber-400/15 text-amber-200'
        : 'bg-slate-800 text-slate-400';
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${tone}`}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

function CountLine({ counts }) {
  const safe = counts || emptyTotals();
  return (
    <p className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] leading-tight">
      {['passed', 'failed', 'skipped', 'notRun'].map((key) => (
        <span key={key} style={{ color: STATUS_COLOR[key] }}>
          {safe[key] || 0} {STATUS_LABEL[key].toLowerCase()}
        </span>
      ))}
    </p>
  );
}

function TraceLine({ traces, kinds }) {
  const counts = countByKind(traces, kinds);
  return (
    <p className="mt-1 flex flex-wrap justify-end gap-x-2 gap-y-0.5 font-mono text-[10px] leading-tight text-cyan-200/80">
      {kinds.map((kind) => (
        <span key={kind}>{counts[kind] || 0} {kind}</span>
      ))}
    </p>
  );
}

function summaryLine(totals) {
  const done = totals.passed + totals.failed + totals.skipped;
  if (done === 0) return 'These checks are planned. None have been run yet.';
  const bits = [];
  if (totals.passed) bits.push(`${totals.passed} passed`);
  if (totals.failed) bits.push(`${totals.failed} failed`);
  if (totals.skipped) bits.push(`${totals.skipped} skipped`);
  if (totals.notRun) bits.push(`${totals.notRun} not run`);
  return bits.join(' · ');
}

function levelOf(report, id) {
  return (report?.levels || []).find((level) => level.id === id) || null;
}

function worldStartId(graph) {
  if (graph?.default && graph.nodes?.[graph.default]) return graph.default;
  const ids = Object.keys(graph?.nodes || {});
  return ids.find((id) => id.startsWith('FNC-')) || ids.find((id) => id.startsWith('REQ-')) || ids[0] || null;
}

function LevelView({ level, row, onBack, onShowSpec }) {
  const checks = level?.checks || [];
  const domains = [];
  const seen = new Set();
  for (const check of checks) {
    if (!check.domain || seen.has(check.domain)) continue;
    seen.add(check.domain);
    domains.push(check.domain);
  }
  const [domain, setDomain] = useState('All');
  const listRef = useRef(null);
  const shown = domain === 'All' ? checks : checks.filter((check) => check.domain === domain);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [domain]);

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="rounded-full border border-slate-700 px-3 py-1 text-[11px] uppercase tracking-wider text-slate-300 hover:border-slate-500 hover:text-white"
            >
              Back
            </button>
            <button
              type="button"
              onClick={onShowSpec}
              className="mt-3 text-[11px] uppercase tracking-[0.18em] text-slate-500 hover:text-cyan-200"
            >
              {row.left}
            </button>
            <h1 className="text-lg font-semibold text-white">{row.right}</h1>
            <p className="mt-1 text-sm text-slate-400">{summaryLine(level?.counts || emptyTotals())}</p>
          </div>
          <span className="font-mono text-xs text-slate-500">{checks.length}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {['All', ...domains].map((name) => {
            const active = name === domain;
            return (
              <button
                key={name}
                type="button"
                aria-pressed={active}
                onClick={() => setDomain(name)}
                className={`rounded-full border px-3 py-1 text-[11px] ${active
                  ? 'border-slate-400 bg-slate-100 text-slate-900'
                  : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'}`}
              >
                {name}
              </button>
            );
          })}
        </div>
      </div>
      <ul ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pb-4">
        {shown.length === 0 && (
          <li className="px-1 py-6 text-sm text-slate-400">
            {checks.length === 0 ? 'No checks at this level.' : 'No checks in this domain.'}
          </li>
        )}
        {shown.map((check) => (
          <li key={check.id} className="rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 text-left">
                <p className="text-sm leading-snug text-slate-100">{check.title}</p>
                <p className="mt-0.5 font-mono text-[10px] text-slate-500">{check.id}</p>
              </div>
              <StatusPill status={check.status} />
            </div>
            {check.verifies?.length > 0 && (
              <p className="mt-2 font-mono text-[10px] leading-relaxed text-slate-400">
                {check.verifies.join(' · ')}
              </p>
            )}
            {check.cases?.length > 0 ? (
              <ul className="mt-3 space-y-1.5 border-t border-slate-800/80 pt-2">
                {check.cases.map((line, index) => (
                  <li key={`${check.id}-${index}`} className="whitespace-pre-wrap break-words border-l-2 border-slate-800 pl-2 text-xs leading-snug text-slate-300">
                    {line}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-slate-500">No cases on this plan.</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SpecView({ level, row, artifacts, onBack, onShowTests, onOpenFocus }) {
  const kinds = LEFT_KINDS[row.level] || [];
  const traces = tracesFor(level, kinds);
  const [kind, setKind] = useState('All');
  const listRef = useRef(null);
  const shown = kind === 'All' ? traces : traces.filter((item) => item.kind === kind);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [kind]);

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="rounded-full border border-slate-700 px-3 py-1 text-[11px] uppercase tracking-wider text-slate-300 hover:border-slate-500 hover:text-white"
            >
              Back
            </button>
            <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-slate-500">{row.left}</p>
            <h1 className="text-lg font-semibold text-white">{row.left}</h1>
            <button
              type="button"
              onClick={onShowTests}
              className="mt-1 text-sm text-slate-400 hover:text-cyan-200"
            >
              {row.right}
            </button>
          </div>
          <span className="font-mono text-xs text-slate-500">{traces.length}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {['All', ...kinds].map((name) => {
            const active = name === kind;
            return (
              <button
                key={name}
                type="button"
                aria-pressed={active}
                onClick={() => setKind(name)}
                className={`rounded-full border px-3 py-1 text-[11px] ${active
                  ? 'border-slate-400 bg-slate-100 text-slate-900'
                  : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'}`}
              >
                {name}
              </button>
            );
          })}
        </div>
      </div>
      <ul ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pb-4">
        {shown.length === 0 && (
          <li className="px-1 py-6 text-sm text-slate-400">
            {traces.length === 0 ? 'No traced items at this level.' : `No ${kind} items.`}
          </li>
        )}
        {shown.map((item) => {
          const meta = artifacts?.[item.id] || {};
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onOpenFocus(item.id)}
                className="w-full rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-left hover:border-cyan-500/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 text-left">
                    <p className="text-sm leading-snug text-slate-100">{meta.title || item.id}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-slate-500">{item.id}</p>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-cyan-200/80">{item.kind}</span>
                </div>
                {meta.domain && (
                  <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-slate-500">{meta.domain}</p>
                )}
                {meta.statement && (
                  <p className="mt-2 text-xs leading-relaxed text-slate-300">{meta.statement}</p>
                )}
                {item.checks.length > 0 && (
                  <p className="mt-3 font-mono text-[10px] leading-relaxed text-slate-400">
                    {item.checks.map((check) => check.id).join(' · ')}
                  </p>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function DebugPage() {
  const [report, setReport] = useState(null);
  const [graph, setGraph] = useState(null);
  const [focusId, setFocusId] = useState(null);
  const [startWorld, setStartWorld] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState(null);
  const [pane, setPane] = useState('tests');
  const [dolly, setDolly] = useState(null);
  const [hot, setHot] = useState(null);
  const cameraRef = useRef(null);
  const sceneRef = useRef(null);
  const nodeRefs = useRef({});
  const poseRef = useRef(null);
  const timerRef = useRef(null);
  const lockRef = useRef(false);

  const load = useCallback(() => {
    setError('');
    Promise.all([
      fetch('/__debug/report').then((response) => {
        if (!response.ok) throw new Error('Report unavailable');
        return response.json();
      }),
      fetch('/__debug/graph').then((response) => {
        if (!response.ok) throw new Error('Graph unavailable');
        return response.json();
      }),
    ])
      .then(([nextReport, nextGraph]) => {
        setReport(nextReport);
        setGraph(nextGraph);
      })
      .catch(() => setError('Could not read the local check list.'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  useLayoutEffect(() => {
    if (!dolly || dolly.phase !== 'out' || dolly.animate) return undefined;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        setDolly((current) => (
          current && current.phase === 'out' && !current.animate
            ? { ...current, animate: true, atRest: true }
            : current
        ));
      });
    });
    return () => {
      cancelAnimationFrame(first);
      if (second) cancelAnimationFrame(second);
    };
  }, [dolly]);

  useEffect(() => {
    if (!dolly || dolly.phase !== 'out' || !dolly.animate) return undefined;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      lockRef.current = false;
      setDolly(null);
    }, DOLLY_MS);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [dolly]);

  function pickTarget(clientX, clientY) {
    let best = null;
    let bestScore = Infinity;
    for (const row of V_ROWS) {
      for (const side of ['spec', 'tests']) {
        const el = nodeRefs.current[nodeKey(row.level, side)];
        if (!el) continue;
        const box = el.getBoundingClientRect();
        const padX = 150;
        const left = side === 'spec' ? box.left - padX : box.left - 22;
        const right = side === 'tests' ? box.right + padX : box.right + 22;
        if (clientX < left || clientX > right || clientY < box.top - 18 || clientY > box.bottom + 18) continue;
        const score = Math.hypot(clientX - (box.left + box.width / 2), clientY - (box.top + box.height / 2));
        if (score < bestScore) {
          best = { level: row.level, side };
          bestScore = score;
        }
      }
    }
    return best;
  }

  function measurePose(level, side) {
    const camera = cameraRef.current;
    const scene = sceneRef.current;
    const nodeEl = nodeRefs.current[nodeKey(level, side)];
    if (!camera || !scene || !nodeEl) return null;
    const cam = camera.getBoundingClientRect();
    const sceneBox = scene.getBoundingClientRect();
    const node = nodeEl.getBoundingClientRect();
    if (cam.width < 8 || cam.height < 8 || node.width < 1 || node.height < 1) return null;
    const nodeCx = node.left + node.width / 2;
    const nodeCy = node.top + node.height / 2;
    const fit = Math.min((cam.width * 0.28) / node.width, (cam.height * 0.28) / node.height);
    const round = (value) => Math.round(value * 100) / 100;
    const pose = {
      level,
      side,
      originX: round(nodeCx - sceneBox.left),
      originY: round(nodeCy - sceneBox.top),
      x: round((cam.left + cam.width / 2) - nodeCx),
      y: round((cam.top + cam.height / 2) - nodeCy),
      scale: round(Math.min(4.4, Math.max(2.4, fit))),
    };
    if (![pose.originX, pose.originY, pose.x, pose.y, pose.scale].every(Number.isFinite)) return null;
    return pose;
  }

  function openLevel(id, side = 'tests') {
    if (!report || lockRef.current) return;
    if (prefersReducedMotion()) {
      setDolly(null);
      setPane(side);
      setActive(id);
      return;
    }
    const pose = measurePose(id, side);
    if (!pose) {
      setPane(side);
      setActive(id);
      return;
    }
    lockRef.current = true;
    poseRef.current = pose;
    setDolly({ phase: 'in', animate: true, atRest: false, ...pose });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      lockRef.current = false;
      setPane(side);
      setActive(id);
      setDolly(null);
    }, DOLLY_MS);
  }

  function back() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pose = poseRef.current;
    if (prefersReducedMotion() || !pose || pose.level !== active) {
      lockRef.current = false;
      setDolly(null);
      setActive(null);
      setPane('tests');
      return;
    }
    lockRef.current = true;
    setActive(null);
    setPane('tests');
    setDolly({ phase: 'out', animate: false, atRest: false, ...pose });
  }

  const totals = report?.totals || emptyTotals();
  const activeRow = V_ROWS.find((row) => row.level === active) || null;
  const activeLevel = active ? levelOf(report, active) : null;
  const sceneStyle = !dolly ? undefined : {
    transformOrigin: `${dolly.originX}px ${dolly.originY}px`,
    transform: dolly.atRest
      ? 'translate3d(0px, 0px, 0px) scale(1)'
      : `translate3d(${dolly.x}px, ${dolly.y}px, 0px) scale(${dolly.scale})`,
    transition: dolly.animate ? undefined : 'none',
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-950 text-slate-100">
      <style>{`
        .dbg-v-world {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
          perspective: 520px;
          perspective-origin: 50% 18%;
        }
        .dbg-v-floor {
          position: absolute;
          left: 50%;
          top: 28%;
          width: 200%;
          height: 160%;
          transform: translateX(-50%) rotateX(74deg);
          transform-origin: center top;
          -webkit-mask-image: linear-gradient(to bottom, transparent 0%, #000 12%, rgba(0,0,0,0.7) 62%, transparent 96%);
          mask-image: linear-gradient(to bottom, transparent 0%, #000 12%, rgba(0,0,0,0.7) 62%, transparent 96%);
        }
        .dbg-v-floor-snakes {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
        }
        .dbg-v-floor-grid {
          fill: none;
          stroke: rgba(21, 94, 117, 0.35);
          stroke-width: 1;
        }
        .dbg-v-snake-trail,
        .dbg-v-snake-core {
          fill: none;
          stroke-linecap: square;
          stroke-linejoin: miter;
          animation: dbg-v-snake 9s linear infinite;
        }
        .dbg-v-run-a { stroke: #22d3ee; }
        .dbg-v-run-b { stroke: #67e8f9; }
        .dbg-v-run-b .dbg-v-snake-trail,
        .dbg-v-run-b .dbg-v-snake-core {
          animation-duration: 13s;
          animation-delay: -5s;
        }
        .dbg-v-snake-trail {
          stroke-width: 3;
          opacity: 0.08;
          stroke-dasharray: 260 1740;
        }
        .dbg-v-snake-core {
          stroke-width: 1.25;
          opacity: 0.22;
          stroke-dasharray: 120 1880;
        }
        @keyframes dbg-v-snake {
          to { stroke-dashoffset: -2000; }
        }
        .dbg-v-world-shade {
          position: absolute;
          inset: 0 0 auto;
          height: 52%;
          background: linear-gradient(to bottom, rgba(2, 6, 23, 0.88), rgba(2, 6, 23, 0.35) 70%, transparent);
        }
        .dbg-v-horizon {
          position: absolute;
          left: 0;
          right: 0;
          top: 26%;
          height: 1px;
          background: linear-gradient(to right, transparent, rgba(34, 211, 238, 0.28), transparent);
          box-shadow: 0 0 12px rgba(8, 145, 178, 0.25);
        }
        .dbg-v-camera {
          position: relative;
          z-index: 1;
        }
        .dbg-v-camera[data-hot='true'] { cursor: pointer; }
        .dbg-v-camera[data-busy='true'] { pointer-events: none; }
        .dbg-v-scene {
          transform: translate3d(0px, 0px, 0px) scale(1);
          transition: transform ${DOLLY_MS}ms ${DOLLY_EASE};
        }
        .dbg-v-stage {
          position: relative;
          width: 100%;
          aspect-ratio: ${V_VIEW.w} / ${V_VIEW.h};
        }
        .dbg-v-svg {
          position: absolute;
          inset: 0;
          overflow: visible;
          pointer-events: none;
        }
        .dbg-v-rail {
          fill: none;
          stroke: ${RAIL_CYAN};
          stroke-width: 2.1;
          stroke-linecap: round;
          stroke-linejoin: round;
          filter: drop-shadow(0 0 3px #22d3ee) drop-shadow(0 0 10px #0891b2);
        }
        .dbg-v-cross {
          fill: none;
          stroke: ${RAIL_CYAN};
          stroke-width: 1.2;
          stroke-linecap: round;
          opacity: 0.45;
          filter: drop-shadow(0 0 4px #22d3ee);
        }
        .dbg-v-dot {
          filter: drop-shadow(0 0 3px currentColor);
        }
        .dbg-v-halo {
          fill: none;
          stroke-width: 1.4;
          opacity: 0.95;
          filter: url(#dbg-v-bloom);
          animation: dbg-v-halo 1.15s ease-in-out infinite;
        }
        @keyframes dbg-v-halo {
          50% { opacity: 0.4; }
        }
        .dbg-v-bloom {
          opacity: 0.35;
          filter: url(#dbg-v-bloom);
        }
        .dbg-v-pulse {
          fill: none;
          stroke: #ecfeff;
          stroke-width: 2.8;
          stroke-dasharray: 18 64;
          stroke-linecap: round;
          animation: dbg-v-dash 2.2s linear infinite;
        }
        @keyframes dbg-v-dash {
          from { stroke-dashoffset: 0; }
          to { stroke-dashoffset: -82; }
        }
        button.dbg-v-node {
          position: absolute;
          z-index: 1;
          width: 40px;
          height: 40px;
          margin: 0;
          padding: 0;
          border: none;
          background: transparent;
          cursor: pointer;
          pointer-events: none;
          transform: translate(-50%, -50%);
        }
        .dbg-v-label-left,
        .dbg-v-label-right {
          position: absolute;
          top: 50%;
          width: max-content;
          max-width: 9.5rem;
          transform: translateY(-50%);
          transition: color 160ms ease, text-shadow 160ms ease;
        }
        .dbg-v-label-left {
          right: calc(100% + 12px);
          text-align: right;
        }
        .dbg-v-label-right {
          left: calc(100% + 12px);
          text-align: left;
        }
        button.dbg-v-node[data-hot='true'] .dbg-v-label-left,
        button.dbg-v-node[data-hot='true'] .dbg-v-label-right,
        button.dbg-v-node:focus-visible .dbg-v-label-left,
        button.dbg-v-node:focus-visible .dbg-v-label-right {
          color: #ecfeff;
          text-shadow: 0 0 12px rgba(34, 211, 238, 0.65);
        }
        .dbg-v-coding {
          position: absolute;
          z-index: 1;
          transform: translate(-50%, 10px);
          pointer-events: none;
        }
        @media (prefers-reduced-motion: reduce) {
          .dbg-v-scene { transition: none !important; }
          .dbg-v-pulse,
          .dbg-v-snake-trail,
          .dbg-v-snake-core,
          .dbg-v-halo { animation: none !important; }
        }
      `}</style>
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-4 px-6 py-5">
        <header className="flex shrink-0 items-center justify-between gap-4">
          <ValhallaLockup size="md" />
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-indigo-300">[Debug]</span>
            <button
              type="button"
              onClick={load}
              className="rounded-full border border-slate-700 px-3 py-1 text-[11px] uppercase tracking-wider text-slate-300 hover:border-slate-500 hover:text-white"
            >
              Refresh
            </button>
            <Link to="/landing" className="text-[11px] uppercase tracking-wider text-slate-500 hover:text-slate-300">
              Landing
            </Link>
          </div>
        </header>

        {error && (
          <p className="shrink-0 text-sm text-rose-300">{error}</p>
        )}

        {activeRow && pane === 'spec' ? (
          <SpecView
            level={activeLevel}
            row={activeRow}
            artifacts={report?.artifacts}
            onBack={back}
            onShowTests={() => setPane('tests')}
            onOpenFocus={setFocusId}
          />
        ) : activeRow ? (
          <LevelView
            level={activeLevel}
            row={activeRow}
            onBack={back}
            onShowSpec={() => setPane('spec')}
          />
        ) : (
          <>
            <section className="shrink-0 rounded-2xl border border-slate-800 bg-slate-900/70 px-5 py-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <Donut totals={totals} />
                <div className="min-w-0 flex-1">
                  <h1 className="text-lg font-semibold text-white">What we check</h1>
                  <p className="mt-1 text-sm text-slate-400">{summaryLine(totals)}</p>
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {['passed', 'failed', 'skipped', 'notRun'].map((key) => (
                      <div key={key} className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-center">
                        <div className="text-xl font-semibold text-white">{totals[key]}</div>
                        <div className="mt-0.5 text-[11px] uppercase tracking-wider" style={{ color: STATUS_COLOR[key] }}>
                          {STATUS_LABEL[key]}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <div ref={cameraRef} className="relative min-h-0 flex-1 overflow-hidden">
              <button
                type="button"
                aria-label="World view"
                title="World view"
                disabled={!worldStartId(graph)}
                onClick={() => {
                  const id = worldStartId(graph);
                  if (!id) return;
                  setStartWorld(true);
                  setFocusId(id);
                }}
                className="absolute bottom-4 left-4 z-20 grid h-10 w-10 place-items-center rounded-full border border-cyan-500/40 bg-slate-950/80 text-cyan-100 hover:border-cyan-200 hover:text-white disabled:opacity-40"
              >
                <Globe className="h-5 w-5" strokeWidth={1.75} />
              </button>
              <div className="dbg-v-world" aria-hidden="true">
                <div className="dbg-v-floor">
                  <svg className="dbg-v-floor-snakes" viewBox={`0 0 ${FLOOR.w} ${FLOOR.h}`} preserveAspectRatio="none" aria-hidden="true">
                    <path className="dbg-v-floor-grid" d={FLOOR_GRID_PATH} />
                    <defs>
                      <path id="dbg-v-path-a" d="M112 336 H560 V672 H1008 V224 H1512 V784 H1792 V448 H1232 V1008 H448 V336 H112" />
                      <path id="dbg-v-path-b" d="M280 168 H840 V504 H392 V952 H1288 V392 H1904 V840 H1456 V168 H280" />
                    </defs>
                    <g className="dbg-v-run-a">
                      <use href="#dbg-v-path-a" className="dbg-v-snake-trail" />
                      <use href="#dbg-v-path-a" className="dbg-v-snake-core" />
                    </g>
                    <g className="dbg-v-run-b">
                      <use href="#dbg-v-path-b" className="dbg-v-snake-trail" />
                      <use href="#dbg-v-path-b" className="dbg-v-snake-core" />
                    </g>
                  </svg>
                </div>
                <div className="dbg-v-world-shade" />
                <div className="dbg-v-horizon" />
              </div>
              <div
                className="dbg-v-camera h-full min-h-[22rem]"
                data-busy={dolly ? 'true' : 'false'}
                data-hot={hot ? 'true' : 'false'}
                onClick={(event) => {
                  const target = pickTarget(event.clientX, event.clientY);
                  if (target) openLevel(target.level, target.side);
                }}
                onMouseMove={(event) => setHot(pickTarget(event.clientX, event.clientY))}
                onMouseLeave={() => setHot(null)}
              >
                <div
                  ref={sceneRef}
                  className="dbg-v-scene mx-auto w-full max-w-5xl px-40 py-6"
                  style={sceneStyle}
                >
                  <div className="dbg-v-stage">
                    <svg
                      className="dbg-v-svg"
                      viewBox={`0 0 ${V_VIEW.w} ${V_VIEW.h}`}
                      preserveAspectRatio="xMidYMid meet"
                      aria-hidden="true"
                    >
                      <defs>
                        <filter id="dbg-v-bloom" x="-80%" y="-80%" width="260%" height="260%">
                          <feGaussianBlur stdDeviation="3.2" result="blur" />
                          <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                          </feMerge>
                        </filter>
                      </defs>
                      <polyline className="dbg-v-rail" points={LEFT_RAIL} />
                      <polyline className="dbg-v-rail" points={RIGHT_RAIL} />
                      <polyline className="dbg-v-pulse" points={LEFT_RAIL} />
                      <polyline className="dbg-v-pulse" points={RIGHT_RAIL} />
                      {V_ROWS.map((row) => {
                        const counts = levelOf(report, row.level)?.counts || emptyTotals();
                        const tone = toneOf(counts);
                        const leftHot = sameHot(hot, row.level, 'spec');
                        const rightHot = sameHot(hot, row.level, 'tests');
                        return (
                          <g key={row.level}>
                            <line
                              className="dbg-v-cross"
                              x1={row.lx}
                              y1={row.ly}
                              x2={row.rx}
                              y2={row.ry}
                              style={{ stroke: tone }}
                            />
                            {leftHot && (
                              <>
                                <circle className="dbg-v-bloom" cx={row.lx} cy={row.ly} r="28" fill={tone} />
                                <circle className="dbg-v-halo" cx={row.lx} cy={row.ly} r="22" stroke={tone} />
                              </>
                            )}
                            {rightHot && (
                              <>
                                <circle className="dbg-v-bloom" cx={row.rx} cy={row.ry} r="28" fill={tone} />
                                <circle className="dbg-v-halo" cx={row.rx} cy={row.ry} r="22" stroke={tone} />
                              </>
                            )}
                            <circle className="dbg-v-dot" cx={row.lx} cy={row.ly} r="9" fill={tone} />
                            <circle className="dbg-v-dot" cx={row.rx} cy={row.ry} r="9" fill={tone} />
                          </g>
                        );
                      })}
                      <circle className="dbg-v-dot" cx={CODING.x} cy={CODING.y} r="10" fill={RAIL_CYAN} />
                    </svg>
                    {V_ROWS.map((row) => {
                      const level = levelOf(report, row.level);
                      const counts = level?.counts || emptyTotals();
                      const kinds = LEFT_KINDS[row.level] || [];
                      const traces = tracesFor(level, kinds);
                      return (
                        <Fragment key={row.level}>
                          <button
                            ref={(node) => { nodeRefs.current[nodeKey(row.level, 'spec')] = node; }}
                            type="button"
                            onClick={() => openLevel(row.level, 'spec')}
                            onFocus={() => setHot({ level: row.level, side: 'spec' })}
                            onBlur={() => setHot(null)}
                            data-hot={sameHot(hot, row.level, 'spec') ? 'true' : 'false'}
                            style={{ left: pctX(row.lx), top: pctY(row.ly) }}
                            aria-label={`${row.left}. ${traces.length} traced items.`}
                            className="dbg-v-node"
                          >
                            <span className="dbg-v-label-left">
                              <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-cyan-100/90">
                                {row.left}
                              </span>
                              <TraceLine traces={traces} kinds={kinds} />
                            </span>
                          </button>
                          <button
                            ref={(node) => { nodeRefs.current[nodeKey(row.level, 'tests')] = node; }}
                            type="button"
                            onClick={() => openLevel(row.level, 'tests')}
                            onFocus={() => setHot({ level: row.level, side: 'tests' })}
                            onBlur={() => setHot(null)}
                            data-hot={sameHot(hot, row.level, 'tests') ? 'true' : 'false'}
                            style={{ left: pctX(row.rx), top: pctY(row.ry) }}
                            aria-label={`${row.right}. ${counts.passed} passed, ${counts.failed} failed, ${counts.skipped} skipped, ${counts.notRun} not run.`}
                            className="dbg-v-node"
                          >
                            <span className="dbg-v-label-right">
                              <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-white">
                                {row.right}
                              </span>
                              <CountLine counts={counts} />
                            </span>
                          </button>
                        </Fragment>
                      );
                    })}
                    <div
                      className="dbg-v-coding"
                      style={{ left: pctX(CODING.x), top: pctY(CODING.y) }}
                    >
                      <span className="block text-center text-[10px] uppercase tracking-[0.32em] text-cyan-200/80">
                        coding
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      {focusId && (
        <FocusSpace
          focusId={focusId}
          index={graph}
          report={report}
          artifacts={report?.artifacts}
          startWorld={startWorld}
          onFocus={setFocusId}
          onClose={() => {
            setFocusId(null);
            setStartWorld(false);
          }}
        />
      )}
    </div>
  );
}

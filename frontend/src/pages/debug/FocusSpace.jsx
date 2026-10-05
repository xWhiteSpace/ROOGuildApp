import { useEffect, useMemo, useRef, useState } from 'react';
import { FOCUS_TABS, focusGraph } from './focusGraph';

const KIND_COLOR = {
  REQ: '#67e8f9',
  FNC: '#22d3ee',
  API: '#818cf8',
  CMP: '#c084fc',
  UNT: '#34d399',
  TST: '#fbbf24',
};

const VIEW = { w: 1100, h: 720, cx: 550, cy: 360 };
const V_SCALE = 1.65;
const V_OX = 90;
const V_OY = 70;
const WORLD = { w: 1840, h: 1440, cx: 920, cy: 720 };
const WORLD_ORDER = ['REQ', 'FNC', 'API', 'CMP', 'UNT', 'TST'];
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const ZOOM_MIN = 0.7;
const ZOOM_MAX = 8;
const MAG_PX = 56;
const MAG_MAX = 3;
const DRAG_PX = 6;
const PANEL_MIN = 224;
const PANEL_MAX = 720;
const PANEL_DEFAULT = 320;
const PANEL_KEY = 'dbg-focus-panel-w';

function clampPanel(width) {
  const cap = typeof window === 'undefined' ? PANEL_MAX : Math.min(PANEL_MAX, Math.floor(window.innerWidth * 0.55));
  return Math.min(cap, Math.max(PANEL_MIN, width));
}

function magScale(node, cursor) {
  if (!cursor) return 1;
  const distPx = Math.hypot(node.x - cursor.x, node.y - cursor.y) * cursor.px;
  if (distPx >= MAG_PX) return 1;
  const t = 1 - distPx / MAG_PX;
  const ease = t * t * (3 - 2 * t);
  return 1 + (MAG_MAX - 1) * ease;
}

function nearestNode(cursor, points) {
  if (!cursor || !points?.length) return null;
  const range = MAG_PX / Math.max(cursor.px, 0.001);
  let best = null;
  let bestD = range;
  for (const node of points) {
    const dist = Math.hypot(node.x - cursor.x, node.y - cursor.y);
    if (dist < bestD) {
      bestD = dist;
      best = node;
    }
  }
  return best;
}

function vxy(x, y) {
  return { x: V_OX + x * V_SCALE, y: V_OY + y * V_SCALE };
}

const WORLD_LEFT = [
  { key: 'REQ', kind: 'REQ', ...vxy(120, 70), label: 'REQ' },
  { key: 'FNC', kind: 'FNC', ...vxy(220, 230), label: 'FNC' },
  { key: 'API', kind: 'API', ...vxy(290, 370), label: 'API' },
  { key: 'CMP', kind: 'CMP', ...vxy(350, 420), label: 'CMP' },
  { key: 'UNT', kind: 'UNT', ...vxy(400, 550), label: 'UNT' },
];
const WORLD_RIGHT = [
  { key: 'TST-acceptance', kind: 'TST', level: 'acceptance', ...vxy(880, 70), label: 'Acceptance' },
  { key: 'TST-system', kind: 'TST', level: 'system', ...vxy(780, 230), label: 'System' },
  { key: 'TST-integration', kind: 'TST', level: 'integration', ...vxy(680, 390), label: 'Integration' },
  { key: 'TST-unit', kind: 'TST', level: 'unit', ...vxy(600, 550), label: 'Unit' },
];
const WORLD_CODING = { ...vxy(500, 720), label: 'Coding' };
const WORLD_RAIL_L = [vxy(120, 70), vxy(220, 230), vxy(320, 390), vxy(400, 550), WORLD_CODING];
const WORLD_RAIL_R = [vxy(880, 70), vxy(780, 230), vxy(680, 390), vxy(600, 550), WORLD_CODING];
const WORLD_RAIL_L_PTS = WORLD_RAIL_L.map((point) => `${point.x},${point.y}`).join(' ');
const WORLD_RAIL_R_PTS = WORLD_RAIL_R.map((point) => `${point.x},${point.y}`).join(' ');
const WORLD_ROAD = { width: 88, fill: 'rgba(34,211,238,0.08)' };
const WORLD_HUBS = [...WORLD_LEFT, ...WORLD_RIGHT];

function placeRing(items, radius, origin) {
  const count = Math.max(items.length, 1);
  return items.map((item, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
    return {
      ...item,
      x: origin.cx + Math.cos(angle) * radius,
      y: origin.cy + Math.sin(angle) * radius,
    };
  });
}

function testLevelOf(report, id) {
  for (const level of report?.levels || []) {
    if ((level.checks || []).some((check) => check.id === id)) return level.id;
  }
  return 'unit';
}

function hubOf(node, report) {
  if (node.kind === 'TST') {
    const level = testLevelOf(report, node.id);
    return WORLD_RIGHT.find((hub) => hub.level === level) || WORLD_RIGHT[3];
  }
  return WORLD_LEFT.find((hub) => hub.kind === node.kind);
}

function placeWorld(nodes, report) {
  const groups = Object.fromEntries(WORLD_HUBS.map((hub) => [hub.key, []]));
  for (const node of Object.values(nodes || {})) {
    const hub = hubOf(node, report);
    if (!hub) continue;
    groups[hub.key].push(node);
  }
  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) => a.id.localeCompare(b.id, 'en'));
  }

  const points = [];
  const byId = {};
  for (const hub of WORLD_HUBS) {
    groups[hub.key].forEach((node, i) => {
      const radius = 22 + 9 * Math.sqrt(i);
      const spin = i * GOLDEN;
      const placed = {
        ...node,
        x: hub.x + Math.cos(spin) * radius,
        y: hub.y + Math.sin(spin) * radius,
        hub,
      };
      points.push(placed);
      byId[node.id] = placed;
    });
  }
  return { points, byId, groups, hubs: WORLD_HUBS };
}

function statusOf(report, id) {
  for (const level of report?.levels || []) {
    const check = (level.checks || []).find((item) => item.id === id);
    if (check) return check.status;
  }
  return null;
}

function fileName(rel) {
  return String(rel || '').split('/').pop() || rel;
}

const EMPTY_LINEAGE = {
  grain: null,
  functions: [],
  components: [],
  interfaces: [],
  units: [],
  requirements: [],
  files: [],
};

function LineageRow({ caption, empty, items, onPick }) {
  return (
    <div className="mt-6">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-cyan-200/80">{caption}</p>
      {items.length === 0 && (
        <p className="mt-3 text-sm leading-relaxed text-slate-500">{empty}</p>
      )}
      {items.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onPick(item.id)}
              className="rounded-full border border-slate-700 px-2 py-0.5 text-left font-mono text-[10px] text-slate-300 hover:border-cyan-400 hover:text-white"
            >
              {item.label && item.label !== item.id ? item.label : item.id}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FocusSpace({ focusId, index, report, artifacts, startWorld = false, onFocus, onClose }) {
  const [tab, setTab] = useState('Connections');
  const [world, setWorld] = useState(() => Boolean(startWorld));
  const [blankWorld, setBlankWorld] = useState(() => Boolean(startWorld));
  const [peekId, setPeekId] = useState(null);
  const [linkId, setLinkId] = useState(null);
  const [hot, setHot] = useState(null);
  const [cam, setCam] = useState({ x: 0, y: 0, k: 1 });
  const [cursor, setCursor] = useState(null);
  const [lineage, setLineage] = useState(EMPTY_LINEAGE);
  const [openFile, setOpenFile] = useState(null);
  const [snippet, setSnippet] = useState(null);
  const [panelW, setPanelW] = useState(() => {
    const saved = Number(sessionStorage.getItem(PANEL_KEY));
    return Number.isFinite(saved) ? clampPanel(saved) : PANEL_DEFAULT;
  });
  const sourceCache = useRef(new Map());
  const fieldRef = useRef(null);
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const resizeRef = useRef(null);
  const camRef = useRef(cam);
  camRef.current = cam;
  const graph = useMemo(() => focusGraph(index, focusId), [index, focusId]);
  const worldMap = useMemo(() => placeWorld(index?.nodes, report), [index, report]);
  const center = graph.center;
  const previewId = hot || peekId || (world ? null : focusId);
  const previewNode = previewId ? (index?.nodes?.[previewId] || { id: previewId, kind: String(previewId).split('-')[0], label: previewId }) : null;
  const previewMeta = previewId ? (artifacts?.[previewId] || {}) : {};
  const canGoto = Boolean(peekId) && (world || peekId !== focusId);
  const seeLinks = Boolean(linkId);
  const peekGraph = useMemo(
    () => (world && linkId ? focusGraph(index, linkId) : null),
    [world, linkId, index],
  );
  const related = useMemo(() => {
    const ids = new Set();
    const counts = {};
    const spokes = [];
    if (!peekGraph) return { ids, counts, spokes, links: [] };
    for (const kind of peekGraph.RING_ORDER) {
      const nodes = peekGraph.rings[kind];
      if (!nodes.length) continue;
      counts[kind] = nodes.length;
      for (const node of nodes) {
        ids.add(node.id);
        spokes.push(node.id);
      }
    }
    return { ids, counts, spokes, links: peekGraph.links };
  }, [peekGraph]);
  const activeKinds = graph.RING_ORDER.filter((kind) => graph.rings[kind].length > 0);
  const local = useMemo(() => {
    const points = [];
    const byId = { [center.id]: { ...center, x: VIEW.cx, y: VIEW.cy } };
    activeKinds.forEach((kind, ringIndex) => {
      const radius = 150 + ringIndex * (activeKinds.length > 1 ? 160 / (activeKinds.length - 1) : 0);
      for (const node of placeRing(graph.rings[kind], radius, VIEW)) {
        points.push(node);
        byId[node.id] = node;
      }
    });
    return { points, byId };
  }, [activeKinds, center, graph.rings]);

  const listKind = FOCUS_TABS.find((item) => item.id === tab)?.kind;
  const list = listKind ? graph.rings[listKind] || [] : [];
  const field = world ? worldMap : local;
  const camera = world ? WORLD : VIEW;
  const hotNode = hot ? field.byId[hot] : null;
  const selectedId = blankWorld ? null : focusId;
  const pin = selectedId ? field.byId[selectedId] : null;
  const peek = peekId ? field.byId[peekId] : null;
  const linkNode = linkId ? field.byId[linkId] : null;
  const viewBox = world
    ? `${cam.x} ${cam.y} ${camera.w / cam.k} ${camera.h / cam.k}`
    : `0 0 ${camera.w} ${camera.h}`;

  useEffect(() => {
    let cancelled = false;
    setOpenFile(null);
    setSnippet(null);
    if (!previewId) {
      setLineage(EMPTY_LINEAGE);
      return undefined;
    }
    const hit = sourceCache.current.get(previewId);
    if (hit) {
      setLineage(hit);
      return undefined;
    }
    fetch(`/__debug/source?id=${encodeURIComponent(previewId)}`)
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        sourceCache.current.set(previewId, data);
        setLineage(data);
      })
      .catch(() => {
        if (!cancelled) setLineage(EMPTY_LINEAGE);
      });
    return () => { cancelled = true; };
  }, [previewId]);

  function openSource(file) {
    setOpenFile(file);
    const key = `file:${file.path}|${file.symbol || ''}`;
    const hit = sourceCache.current.get(key);
    if (hit) {
      setSnippet(hit);
      return;
    }
    const query = new URLSearchParams({ path: file.path });
    if (file.symbol) query.set('symbol', file.symbol);
    fetch(`/__debug/source?${query}`)
      .then((response) => response.json())
      .then((data) => {
        sourceCache.current.set(key, data);
        setSnippet(data);
      })
      .catch(() => setSnippet({ error: 'failed', path: file.path }));
  }

  useEffect(() => {
    const node = fieldRef.current;
    if (!node || !world) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.12 : 1 / 1.12);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [world]);

  function toggleWorld() {
    if (world) {
      setWorld(false);
      setLinkId(null);
    } else {
      setWorld(true);
      setPeekId(peekId);
      camRef.current = { x: 0, y: 0, k: 1 };
      setCam(camRef.current);
      setTab('Connections');
    }
    setHot(null);
  }

  function goToPeek() {
    const id = peekId || previewId;
    if (!id) return;
    onFocus(id);
    setBlankWorld(false);
    setWorld(false);
    setPeekId(null);
    setLinkId(null);
    setTab('Connections');
    setHot(null);
  }

  function viewFrame(snapshot = camRef.current) {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const k = snapshot.k;
    const vbW = world ? WORLD.w / k : VIEW.w;
    const vbH = world ? WORLD.h / k : VIEW.h;
    const scale = Math.min(rect.width / Math.max(vbW, 1), rect.height / Math.max(vbH, 1));
    return {
      rect,
      scale,
      offsetX: (rect.width - vbW * scale) / 2,
      offsetY: (rect.height - vbH * scale) / 2,
      originX: world ? snapshot.x : 0,
      originY: world ? snapshot.y : 0,
    };
  }

  function pointFromSnapshot(clientX, clientY, snapshot) {
    const frame = viewFrame(snapshot);
    if (!frame) return null;
    return {
      x: frame.originX + (clientX - frame.rect.left - frame.offsetX) / frame.scale,
      y: frame.originY + (clientY - frame.rect.top - frame.offsetY) / frame.scale,
      px: frame.scale,
    };
  }

  function clientToSvg(clientX, clientY) {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM?.();
    if (ctm && typeof ctm.inverse === 'function') {
      const inv = ctm.inverse();
      return {
        x: inv.a * clientX + inv.c * clientY + inv.e,
        y: inv.b * clientX + inv.d * clientY + inv.f,
        px: Math.hypot(ctm.a, ctm.b),
      };
    }
    return pointFromSnapshot(clientX, clientY, camRef.current);
  }

  function zoomAt(clientX, clientY, factor) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    setCam((current) => {
      const nextK = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, current.k * factor));
      if (nextK === current.k) return current;
      const before = pointFromSnapshot(clientX, clientY, current);
      if (!before) return current;
      const vbW = WORLD.w / nextK;
      const vbH = WORLD.h / nextK;
      const scale = Math.min(rect.width / Math.max(vbW, 1), rect.height / Math.max(vbH, 1));
      const offsetX = (rect.width - vbW * scale) / 2;
      const offsetY = (rect.height - vbH * scale) / 2;
      const next = {
        k: nextK,
        x: before.x - (clientX - rect.left - offsetX) / scale,
        y: before.y - (clientY - rect.top - offsetY) / scale,
      };
      camRef.current = next;
      return next;
    });
  }

  function bumpZoom(factor) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  }

  function onFieldPointerDown(event) {
    if (event.button !== 0) return;
    const live = camRef.current;
    dragRef.current = { x: event.clientX, y: event.clientY, camX: live.x, camY: live.y, moved: false };
    if (world) event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onFieldPointerMove(event) {
    const point = clientToSvg(event.clientX, event.clientY);
    if (point) {
      setCursor(point);
      setHot(nearestNode(point, field.points)?.id || null);
    }
    const drag = dragRef.current;
    if (!drag || !world) return;
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > DRAG_PX) drag.moved = true;
    if (!drag.moved) return;
    const frame = viewFrame(camRef.current);
    if (!frame) return;
    const next = {
      ...camRef.current,
      x: drag.camX - (event.clientX - drag.x) / frame.scale,
      y: drag.camY - (event.clientY - drag.y) / frame.scale,
    };
    camRef.current = next;
    setCam(next);
  }

  function onFieldPointerUp(event) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (drag?.moved) return;
    const point = clientToSvg(event.clientX, event.clientY);
    const near = nearestNode(point, field.points);
    if (near) setPeekId(near.id);
  }

  function onFieldPointerLeave() {
    if (dragRef.current) return;
    setCursor(null);
    setHot(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-slate-100">
      <style>{`
        .dbg-focus-copy,
        .dbg-focus-field {
          animation: dbg-focus-in 280ms cubic-bezier(0.22, 0.61, 0.36, 1);
        }
        @keyframes dbg-focus-in {
          from { opacity: 0; transform: translate3d(0, 8px, 0) scale(0.98); }
          to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
        }
        .dbg-cass-key {
          display: grid;
          place-items: center;
          min-width: 2.75rem;
          height: 2.75rem;
          padding: 0 0.7rem;
          border-radius: 999px;
          border: 1px solid rgba(34, 211, 238, 0.3);
          background: #0b1220;
          color: #a5f3fc;
          font-size: 0.62rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .dbg-cass-key.is-on,
        .dbg-cass-key[aria-pressed="true"] {
          background: #ecfeff;
          color: #0b1220;
          border-color: #ecfeff;
        }
        .dbg-cass-key:hover:not(:disabled):not(.is-on) {
          border-color: rgba(165, 243, 252, 0.7);
          color: #ecfeff;
        }
        @media (prefers-reduced-motion: reduce) {
          .dbg-focus-copy,
          .dbg-focus-field { animation: none !important; }
        }
      `}</style>
      <header className="flex shrink-0 items-start justify-between gap-4 px-5 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-700 px-3 py-1 text-[11px] uppercase tracking-wider text-slate-300 hover:border-slate-500 hover:text-white"
          >
            Back
          </button>
          <button
            type="button"
            aria-pressed={world}
            onClick={toggleWorld}
            className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-wider ${world
              ? 'border-cyan-100 bg-cyan-100 text-slate-900'
              : 'border-cyan-500/40 text-cyan-100 hover:border-cyan-200 hover:text-white'}`}
          >
            World
          </button>
        </div>
        <div className="flex max-w-[70%] flex-wrap justify-end gap-1.5 rounded-full border border-cyan-500/20 bg-slate-950/80 px-2 py-1.5">
          {FOCUS_TABS.map((item) => {
            const count = item.kind ? graph.rings[item.kind]?.length || 0 : null;
            const on = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={on}
                onClick={() => setTab(item.id)}
                className={`rounded-full px-3 py-1 text-[11px] uppercase tracking-wider ${on
                  ? 'bg-cyan-100 text-slate-900'
                  : 'text-slate-400 hover:text-slate-200'}`}
              >
                {item.id}{count != null ? ` ${count}` : ''}
              </button>
            );
          })}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          key={`copy-${focusId}-${world ? 'world' : 'local'}`}
          style={{ width: panelW }}
          className="dbg-focus-copy flex shrink-0 flex-col justify-start overflow-y-auto px-5 py-6"
        >
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-cyan-200/80">
            {world ? `World${previewNode ? ` · ${previewNode.kind}` : ''}` : (previewNode?.kind || center.kind)}
            {hot ? ' · Hover' : peekId ? ' · Selected' : ''}
          </p>
          <h2 className="mt-2 text-xl font-semibold leading-snug text-white">
            {previewNode
              ? (previewMeta.title || previewNode.label || previewId)
              : 'Entire neighborhood'}
          </h2>
          {previewId && <p className="mt-2 font-mono text-xs text-slate-400">{previewId}</p>}
          {!previewNode && (
            <p className="mt-4 text-sm leading-relaxed text-slate-400">Hover a node to preview. Click to select.</p>
          )}
          {previewMeta.domain && (
            <p className="mt-3 text-[11px] uppercase tracking-[0.14em] text-slate-500">{previewMeta.domain}</p>
          )}
          {previewMeta.statement && (
            <p className="mt-4 text-sm leading-relaxed text-slate-300">{previewMeta.statement}</p>
          )}
          {previewNode && !previewMeta.statement && (canGoto || (previewNode.label && previewNode.label !== previewId)) && (
            <p className="mt-4 text-sm leading-relaxed text-slate-400">
              {previewNode.label && previewNode.label !== previewId
                ? previewNode.label
                : 'No statement on this node. Goto opens its neighborhood.'}
            </p>
          )}
          {(canGoto || (world && peekId)) && (
            <div className="mt-6 flex flex-wrap gap-2">
              {canGoto && (
                <button
                  type="button"
                  onClick={goToPeek}
                  className="w-fit rounded-full bg-cyan-100 px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-slate-900 hover:bg-white"
                >
                  Goto
                </button>
              )}
              {world && peekId && (
                <button
                  type="button"
                  aria-pressed={linkId === peekId}
                  onClick={() => setLinkId((id) => (id === peekId ? null : peekId))}
                  className={`w-fit rounded-full border px-4 py-2 text-[11px] uppercase tracking-[0.18em] ${linkId === peekId
                    ? 'border-cyan-100 bg-cyan-100 text-slate-900'
                    : 'border-cyan-500/40 text-cyan-100 hover:border-cyan-200'}`}
                >
                  {linkId === peekId ? 'Hide connection' : 'See connection'}
                  {linkId === peekId && related.spokes.length ? ` ${related.spokes.length}` : ''}
                </button>
              )}
            </div>
          )}
          {world && linkId && (
            <p className="mt-4 font-mono text-[11px] leading-relaxed text-slate-400">
              {`Frozen on ${linkId}. `}
              {related.spokes.length === 0
                ? 'No traced neighbors for this node.'
                : WORLD_ORDER.filter((kind) => related.counts[kind]).map((kind) => `${kind} ${related.counts[kind]}`).join(' · ')}
            </p>
          )}
          {previewNode && lineage.grain === 'need' && (
            <LineageRow
              caption="Satisfied by"
              empty="No functions allocated to this need."
              items={lineage.functions}
              onPick={setPeekId}
            />
          )}
          {previewNode && lineage.grain === 'allocation' && (
            <>
              <LineageRow caption="Allocated to" empty="No component allocated." items={lineage.components} onPick={setPeekId} />
              <LineageRow caption="Refined by" empty="No units refine this function." items={lineage.units} onPick={setPeekId} />
              <LineageRow caption="Satisfies" empty="No requirements on this function." items={lineage.requirements} onPick={setPeekId} />
            </>
          )}
          {previewNode && lineage.grain === 'architecture' && (
            <>
              <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.22em] text-cyan-200/80">Architecture</p>
              <LineageRow caption="Functions" empty="No functions allocated to this block." items={lineage.functions} onPick={setPeekId} />
              <LineageRow caption="Ports" empty="No interfaces on this block." items={lineage.interfaces} onPick={setPeekId} />
              <LineageRow caption="Parts" empty="No units in this block." items={lineage.units} onPick={setPeekId} />
            </>
          )}
          {previewNode && lineage.grain === 'contract' && (
            <>
              <LineageRow caption="Connects" empty="No components on this contract." items={lineage.components} onPick={setPeekId} />
              <LineageRow caption="Used by" empty="No functions use this contract." items={lineage.functions} onPick={setPeekId} />
            </>
          )}
          {previewNode && lineage.grain === 'unit' && (
            <div className="mt-8">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-cyan-200/80">Code</p>
              {(lineage.files || []).length === 0 && (
                <p className="mt-3 text-sm leading-relaxed text-slate-500">No source files on this unit yet.</p>
              )}
              {(lineage.files || []).length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1">
                  {lineage.files.map((file, index) => (
                    <span key={file.path} className="flex items-center gap-1">
                      {index > 0 && <span className="text-slate-600">→</span>}
                      <button
                        type="button"
                        onClick={() => openSource(file)}
                        className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${openFile?.path === file.path && openFile?.symbol === file.symbol
                          ? 'border-cyan-100 bg-cyan-100 text-slate-900'
                          : 'border-slate-700 text-slate-300 hover:border-cyan-400 hover:text-white'}`}
                      >
                        {fileName(file.path)}
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {snippet && !snippet.error && (
                <pre className="mt-4 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-[10px] leading-relaxed text-cyan-50">
                  <p className="mb-2 text-slate-500">{snippet.path}{snippet.start ? `:${snippet.start}–${snippet.end}` : ''}</p>
                  {snippet.text}
                </pre>
              )}
              {snippet?.error && (
                <p className="mt-3 text-sm text-slate-500">Could not read that file.</p>
              )}
            </div>
          )}
        </aside>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize preview panel"
          className="w-1.5 shrink-0 cursor-col-resize bg-cyan-500/15 hover:bg-cyan-300/40"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            resizeRef.current = { x: event.clientX, width: panelW, last: panelW };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const drag = resizeRef.current;
            if (!drag) return;
            const next = clampPanel(drag.width + (event.clientX - drag.x));
            drag.last = next;
            setPanelW(next);
          }}
          onPointerUp={(event) => {
            const last = resizeRef.current?.last ?? panelW;
            resizeRef.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            sessionStorage.setItem(PANEL_KEY, String(last));
          }}
          onDoubleClick={() => {
            setPanelW(PANEL_DEFAULT);
            sessionStorage.setItem(PANEL_KEY, String(PANEL_DEFAULT));
          }}
        />

        {tab === 'Connections' ? (
          <div
            ref={fieldRef}
            key={world ? 'field-world' : `field-local-${focusId}`}
            className={`dbg-focus-field relative min-h-0 min-w-0 flex-1 ${world ? 'cursor-grab active:cursor-grabbing' : ''}`}
            onPointerDown={onFieldPointerDown}
            onPointerMove={onFieldPointerMove}
            onPointerUp={onFieldPointerUp}
            onPointerCancel={onFieldPointerUp}
            onPointerLeave={onFieldPointerLeave}
          >
            <svg
              ref={svgRef}
              className="block h-full w-full"
              viewBox={viewBox}
              preserveAspectRatio="xMidYMid meet"
            >
              {world && (
                <>
                  {[WORLD_RAIL_L_PTS, WORLD_RAIL_R_PTS].map((points) => (
                    <polyline
                      key={points}
                      points={points}
                      fill="none"
                      stroke={WORLD_ROAD.fill}
                      strokeWidth={WORLD_ROAD.width}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                  <circle cx={WORLD_CODING.x} cy={WORLD_CODING.y} r="7" fill="#22d3ee" opacity="0.55" />
                  <text
                    x={WORLD_CODING.x}
                    y={WORLD_CODING.y + 22}
                    textAnchor="middle"
                    fill="#67e8f9"
                    fontSize="12"
                    fontFamily="ui-monospace, monospace"
                    opacity="0.45"
                    className="pointer-events-none"
                  >
                    Coding
                  </text>
                  {WORLD_HUBS.map((hub) => (
                    <text
                      key={`hub-${hub.key}`}
                      x={hub.x}
                      y={hub.y - 18}
                      textAnchor="middle"
                      fill={KIND_COLOR[hub.kind]}
                      fontSize="13"
                      fontFamily="ui-monospace, monospace"
                      opacity="0.4"
                      className="pointer-events-none"
                    >
                      {hub.label}
                    </text>
                  ))}
                </>
              )}
              {!world && activeKinds.map((kind, ringIndex) => {
                const radius = 150 + ringIndex * (activeKinds.length > 1 ? 160 / (activeKinds.length - 1) : 0);
                return (
                  <circle
                    key={kind}
                    cx={VIEW.cx}
                    cy={VIEW.cy}
                    r={radius}
                    fill="none"
                    stroke="rgba(34,211,238,0.12)"
                    strokeWidth="1"
                  />
                );
              })}
              {!world && local.points.map((node) => (
                <line
                  key={`spoke-${node.id}`}
                  x1={VIEW.cx}
                  y1={VIEW.cy}
                  x2={node.x}
                  y2={node.y}
                  stroke="rgba(34,211,238,0.22)"
                  strokeWidth="1"
                />
              ))}
              {world && seeLinks && linkNode && related.spokes.map((id) => {
                const other = worldMap.byId[id];
                if (!other) return null;
                const color = KIND_COLOR[other.kind] || '#67e8f9';
                return (
                  <line
                    key={`world-spoke-${id}`}
                    x1={linkNode.x}
                    y1={linkNode.y}
                    x2={other.x}
                    y2={other.y}
                    stroke={color}
                    strokeWidth="1"
                    opacity="0.42"
                  />
                );
              })}
              {world && seeLinks && related.links.map(([from, to], linkIndex) => {
                const a = worldMap.byId[from];
                const b = worldMap.byId[to];
                if (!a || !b) return null;
                return (
                  <line
                    key={`world-link-${from}-${to}-${linkIndex}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="rgba(251,191,36,0.35)"
                    strokeWidth="1"
                  />
                );
              })}
              {!world && graph.links.map(([from, to], linkIndex) => {
                const a = local.byId[from];
                const b = local.byId[to];
                if (!a || !b) return null;
                return (
                  <line
                    key={`link-${from}-${to}-${linkIndex}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="rgba(251,191,36,0.28)"
                    strokeWidth="1"
                  />
                );
              })}
              {field.points.map((node) => {
                const color = KIND_COLOR[node.kind] || '#67e8f9';
                const lit = hot === node.id;
                const peeked = node.id === peekId;
                const pinned = Boolean(selectedId) && node.id === selectedId;
                const frozen = node.id === linkId;
                const tied = seeLinks && (related.ids.has(node.id) || frozen);
                const dim = world && seeLinks && !peeked && !tied;
                const base = world ? (peeked || frozen ? 6 : tied ? 4.2 : pinned ? 4.5 : 2.6) : (peeked ? 9 : 7);
                const grow = magScale(node, cursor);
                const r = base * grow;
                return (
                  <g key={node.id} opacity={dim ? 0.14 : 1} className="pointer-events-none">
                    {(lit || peeked || tied || grow > 1.05) && (
                      <circle cx={node.x} cy={node.y} r={r + 6} fill="none" stroke={color} strokeWidth="1.2" opacity="0.8" />
                    )}
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={r}
                      fill={color}
                    >
                      <title>{node.id}</title>
                    </circle>
                    {!world && (
                      <text
                        x={node.x + 10}
                        y={node.y - 8}
                        fill="#a5f3fc"
                        fontSize="9"
                        fontFamily="ui-monospace, monospace"
                        className="pointer-events-none"
                      >
                        {node.id}
                      </text>
                    )}
                  </g>
                );
              })}
              {!world && (
                <>
                  <circle cx={VIEW.cx} cy={VIEW.cy} r="26" fill={KIND_COLOR[center.kind] || '#67e8f9'} />
                  <circle cx={VIEW.cx} cy={VIEW.cy} r="34" fill="none" stroke={KIND_COLOR[center.kind] || '#67e8f9'} strokeWidth="1.4" opacity="0.45" />
                </>
              )}
              {world && pin && (
                <circle
                  cx={pin.x}
                  cy={pin.y}
                  r="10"
                  fill="none"
                  stroke={KIND_COLOR[center.kind] || '#67e8f9'}
                  strokeWidth="1.6"
                />
              )}
              {world && linkNode && (
                <circle
                  cx={linkNode.x}
                  cy={linkNode.y}
                  r="14"
                  fill="none"
                  stroke="#22d3ee"
                  strokeWidth="1.6"
                />
              )}
              {peek && peekId !== center.id && peekId !== linkId && (
                <circle
                  cx={peek.x}
                  cy={peek.y}
                  r={world ? 12 : 16}
                  fill="none"
                  stroke="#ecfeff"
                  strokeWidth="1.4"
                />
              )}
            </svg>
            {world && (
              <div className="absolute right-4 top-4 flex flex-col gap-1.5" onPointerDown={(event) => event.stopPropagation()}>
                <button type="button" aria-label="Zoom in" onClick={() => bumpZoom(1.25)} className="dbg-cass-key">+</button>
                <button type="button" aria-label="Zoom out" onClick={() => bumpZoom(1 / 1.25)} className="dbg-cass-key">−</button>
                <button type="button" aria-label="Fit world" onClick={() => { camRef.current = { x: 0, y: 0, k: 1 }; setCam(camRef.current); }} className="dbg-cass-key">Fit</button>
              </div>
            )}
            {world && (hotNode || peek) && (
              <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 font-mono text-xs text-cyan-100">
                {(hotNode || peek).id}
              </p>
            )}
          </div>
        ) : (
          <ul key={`list-${focusId}-${tab}`} className="dbg-focus-field min-h-0 min-w-0 flex-1 space-y-2 overflow-y-auto px-5 pb-4">
            {list.length === 0 && (
              <li className="px-1 py-8 text-sm text-slate-400">No {tab} in this neighborhood.</li>
            )}
            {list.map((node) => {
              const meta = artifacts?.[node.id] || {};
              const status = node.kind === 'TST' ? statusOf(report, node.id) : null;
              return (
                <li key={node.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setHot(node.id)}
                    onMouseLeave={() => setHot((id) => (id === node.id ? null : id))}
                    onClick={() => setPeekId(node.id)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left ${node.id === peekId
                      ? 'border-cyan-300 bg-slate-900/70'
                      : node.id === hot
                        ? 'border-cyan-500/40 bg-slate-900/50'
                        : 'border-slate-800 bg-slate-900/40 hover:border-cyan-500/50'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-100">{meta.title || node.label || node.id}</p>
                        <p className="mt-0.5 font-mono text-[10px] text-slate-500">{node.id}</p>
                      </div>
                      <span className="shrink-0 font-mono text-[11px]" style={{ color: KIND_COLOR[node.kind] }}>{node.kind}</span>
                    </div>
                    {status && (
                      <p className="mt-2 text-[11px] uppercase tracking-wider text-slate-400">{status}</p>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

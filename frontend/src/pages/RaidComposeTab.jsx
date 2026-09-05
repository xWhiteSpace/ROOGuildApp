// frontend/src/pages/RaidComposeTab.jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Ban, Check, Copy, Crown, Eraser, Flag, Plus, Save, Search, Send, Settings, Trash2, UserPlus, X,
} from 'lucide-react';
import RaidMemberCard from '../components/RaidMemberCard';
import RosterSidebar from '../components/RosterSidebar';
import { upcomingDatesForWeekday, DEFAULT_TZ } from '../utils/guildTime';
import { apiFetch } from '../services/apiClient';
import { isSlotCoordKey, normalizeCompositionsMap } from '@guildname/shared/compositionTabs';

const backendUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';

export default function RaidComposeTab({ user }) {
  const isOfficer = user?.isOfficer === true;
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const [eventsCatalog, setEventsCatalog] = useState({});
  const [compositions, setCompositions] = useState({});
  const [members, setMembers] = useState({});
  const [jobsCatalog, setJobsCatalog] = useState({});
  const [commitments, setCommitments] = useState({});
  const [guildTimezone, setGuildTimezone] = useState(DEFAULT_TZ);

  const [selectedEventKey, setSelectedEventKey] = useState('');
  const [selectedEventDate, setSelectedEventDate] = useState('');
  const [selectedConfigId, setSelectedConfigId] = useState('');
  const [creating, setCreating] = useState(false);

  const [localGrids, setLocalGrids] = useState({});
  const [activeTabConfigId, setActiveTabConfigId] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [activePopover, setActivePopover] = useState(null);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);

  const gridRef = useRef(null);
  const persistTimer = useRef(null);
  const isDirtyRef = useRef(false);
  const localGridsRef = useRef({});
  const sessionRef = useRef(null);

  const getHeaders = () => {
    const saved = localStorage.getItem('guild_raid_session');
    const headers = { 'Content-Type': 'application/json' };
    if (saved) headers['x-user-profile'] = encodeURIComponent(saved);
    return headers;
  };

  const loadWorkspace = async () => {
    try {
      setLoading(true);
      const initRes = await apiFetch('/api/requests/init');
      const initData = await initRes.json();
      if (initData.success) {
        setMembers(initData.members || {});
        setCommitments(initData.commitments || {});
      }
      const configRes = await apiFetch('/api/requests/settings/get');
      const configData = await configRes.json();
      if (configData.success && configData.config) {
        setEventsCatalog(configData.config.events || {});
        setJobsCatalog(configData.config.jobs || {});
        if (configData.config.timezone) setGuildTimezone(configData.config.timezone);
      }
      const compsRes = await apiFetch('/api/attendance/compositions', { method: 'GET' });
      const compsText = await compsRes.text();
      let compsData = {};
      try { compsData = JSON.parse(compsText); } catch { compsData = {}; }
      if (compsData.success) {
        setCompositions(normalizeCompositionsMap(compsData.compositions || {}));
      } else {
        setCompositions({});
      }
      const composeRes = await apiFetch('/api/attendance/compose');
      const composeData = await composeRes.json();
      if (composeData.success && composeData.session) {
        applySession(composeData.session);
      } else {
        setSession(null);
        setLocalGrids({});
        setActiveTabConfigId('');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const applySession = (next) => {
    setSession(next);
    sessionRef.current = next;
    const grids = next.grids || {};
    setLocalGrids(grids);
    localGridsRef.current = grids;
    const firstTab = (next.selectedGridIds || Object.keys(grids))[0] || '';
    setActiveTabConfigId(firstTab);
    setIsDirty(false);
    isDirtyRef.current = false;
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

  const persistGrids = async (grids) => {
    const current = sessionRef.current;
    if (!current?.id || !isOfficer) return;
    setSaving(true);
    try {
      await apiFetch('/api/attendance/compose/save', {
        method: 'POST',
        body: JSON.stringify({ sessionId: current.id, grids }),
      });
      isDirtyRef.current = false;
      setIsDirty(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const applyLocalGridsAndPersist = (mapper) => {
    setLocalGrids((prev) => {
      const next = mapper(prev);
      localGridsRef.current = next;
      isDirtyRef.current = true;
      setIsDirty(true);
      if (persistTimer.current) clearTimeout(persistTimer.current);
      persistTimer.current = setTimeout(() => persistGrids(next), 600);
      return next;
    });
  };

  const handleCreateRaid = async () => {
    if (!selectedEventKey || !selectedEventDate || !selectedConfigId) {
      return alert('Select event, date, and raid config.');
    }
    setCreating(true);
    try {
      const res = await apiFetch('/api/attendance/compose/create', {
        method: 'POST',
        body: JSON.stringify({
          eventKey: selectedEventKey,
          eventDate: selectedEventDate,
          configId: selectedConfigId,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.error || 'Failed to create raid compose.');
        return;
      }
      applySession(data.session);
      setShowCreate(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleCloseCompose = async () => {
    if (isDirtyRef.current) await persistGrids(localGridsRef.current);
    await apiFetch('/api/attendance/compose/close', { method: 'POST' });
    setSession(null);
    sessionRef.current = null;
    setLocalGrids({});
    setActiveTabConfigId('');
  };

  const captureGridBlob = async () => {
    if (!gridRef.current) throw new Error('Grid is not ready.');
    const { toBlob } = await import('html-to-image');
    const node = gridRef.current;
    return await toBlob(node, {
      backgroundColor: '#020617',
      width: node.scrollWidth + 8,
      height: node.scrollHeight + 8,
      style: {
        overflow: 'visible',
        transform: 'scale(1)',
        webkitTransform: 'scale(1)',
        width: `${node.scrollWidth + 8}px`,
        height: `${node.scrollHeight + 8}px`,
        margin: '0',
        padding: '8px',
      },
    });
  };

  const handleCopyRosterImage = async () => {
    try {
      const blob = await captureGridBlob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      alert('Grid tab snapshot copied to clipboard.');
    } catch (err) {
      alert(`Copy failed: ${err.message || err}`);
    }
  };

  const handleSendRoster = async () => {
    if (!isOfficer || sending) return;
    setSending(true);
    try {
      if (isDirtyRef.current) await persistGrids(localGridsRef.current);
      const res = await apiFetch('/api/attendance/compose/deploy-roster', {
        method: 'POST',
        body: JSON.stringify({ sessionId: session?.id, grids: localGridsRef.current }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Send failed');
      alert('Composition added to Live Raid → Active Compositions.');
    } catch (err) {
      alert(err.message || 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const handleBindMemberToCell = (coordKey, uid) => {
    if (!activeTabConfigId) return;
    applyLocalGridsAndPersist((prev) => {
      const gridObj = { ...prev[activeTabConfigId] };
      const slotAlloc = { ...(gridObj.slots_allocation || {}) };
      Object.keys(slotAlloc).forEach((k) => {
        if (!isSlotCoordKey(k)) return;
        if (uid && slotAlloc[k]?.userId === uid) {
          slotAlloc[k] = { ...slotAlloc[k], userId: '' };
        }
      });
      slotAlloc[coordKey] = { ...(slotAlloc[coordKey] || { roleLock: '' }), userId: uid || '' };
      gridObj.slots_allocation = slotAlloc;
      return { ...prev, [activeTabConfigId]: gridObj };
    });
    setActivePopover(null);
  };

  const handleSetPartyLeader = (coordKey) => {
    if (!activeTabConfigId) return;
    applyLocalGridsAndPersist((prev) => {
      const gridObj = { ...prev[activeTabConfigId] };
      const slotAlloc = { ...(gridObj.slots_allocation || {}) };
      const isAlready = slotAlloc[coordKey]?.isPartyLeader === true;
      Object.keys(slotAlloc).forEach((k) => {
        if (slotAlloc[k]?.isPartyLeader) slotAlloc[k] = { ...slotAlloc[k], isPartyLeader: false };
      });
      if (!isAlready) slotAlloc[coordKey] = { ...slotAlloc[coordKey], isPartyLeader: true };
      gridObj.slots_allocation = slotAlloc;
      return { ...prev, [activeTabConfigId]: gridObj };
    });
  };

  const handleSetCellRoleLock = (coordKey, roleLock) => {
    if (!activeTabConfigId) return;
    applyLocalGridsAndPersist((prev) => {
      const gridObj = { ...prev[activeTabConfigId] };
      const slotAlloc = { ...(gridObj.slots_allocation || {}) };
      slotAlloc[coordKey] = { ...slotAlloc[coordKey], roleLock: roleLock || '' };
      gridObj.slots_allocation = slotAlloc;
      return { ...prev, [activeTabConfigId]: gridObj };
    });
  };

  const handleUpdatePartyName = (colNum, value) => {
    if (!activeTabConfigId) return;
    applyLocalGridsAndPersist((prev) => {
      const gridObj = { ...prev[activeTabConfigId] };
      const slotAlloc = { ...(gridObj.slots_allocation || {}) };
      slotAlloc[`party_name_${colNum}`] = value;
      gridObj.slots_allocation = slotAlloc;
      return { ...prev, [activeTabConfigId]: gridObj };
    });
  };

  const mutateActiveGridSlots = (mapper) => {
    if (!activeTabConfigId) return;
    applyLocalGridsAndPersist((prev) => {
      const gridObj = prev[activeTabConfigId];
      if (!gridObj) return prev;
      const slotAlloc = { ...(gridObj.slots_allocation || {}) };
      Object.keys(slotAlloc).forEach((k) => {
        if (!isSlotCoordKey(k) || !slotAlloc[k]) return;
        slotAlloc[k] = mapper(slotAlloc[k]);
      });
      return { ...prev, [activeTabConfigId]: { ...gridObj, slots_allocation: slotAlloc } };
    });
  };

  const handleCellDropIntercept = (e, destCoordKey) => {
    e.preventDefault();
    if (!isOfficer || !activeTabConfigId) return;
    const raw = e.dataTransfer.getData('text/plain');
    if (!raw) return;
    try {
      if (raw.trim().startsWith('{')) {
        const parsed = JSON.parse(raw);
        if (parsed.source === 'cell' && parsed.coordKey && parsed.userId) {
          applyLocalGridsAndPersist((prev) => {
            const gridObj = { ...prev[activeTabConfigId] };
            const slotAlloc = { ...(gridObj.slots_allocation || {}) };
            const src = slotAlloc[parsed.coordKey] || {};
            const dest = slotAlloc[destCoordKey] || { userId: '', roleLock: '' };
            slotAlloc[parsed.coordKey] = { ...src, userId: dest.userId || '' };
            slotAlloc[destCoordKey] = { ...dest, userId: parsed.userId };
            gridObj.slots_allocation = slotAlloc;
            return { ...prev, [activeTabConfigId]: gridObj };
          });
          return;
        }
      }
    } catch { /* sidebar uid drop */ }
    handleBindMemberToCell(destCoordKey, raw);
  };

  const categorizedRosterPools = useMemo(() => {
    const standby = [];
    const uncommitted = [];
    const leave = [];
    const placed = new Set();
    Object.values(localGrids).forEach((grid) => {
      Object.entries(grid.slots_allocation || {}).forEach(([coord, slot]) => {
        if (isSlotCoordKey(coord) && slot?.userId) placed.add(slot.userId);
      });
    });
    const compositeKey = session ? `${session.eventDate}_${session.eventKey}` : '';
    Object.entries(members).forEach(([uid, profile]) => {
      if (profile.isRaidRoster !== true) return;
      if (placed.has(uid) && !searchQuery.trim()) return;
      if (searchQuery.trim() && !(profile.displayName || '').toLowerCase().includes(searchQuery.toLowerCase())) return;
      const calendarStatus = commitments[compositeKey]?.[uid]?.status;
      const row = {
        uid,
        displayName: profile.displayName || 'Raid Member',
        jobCode: profile.jobCode || '',
        assignedLocation: placed.has(uid) ? 'Already Slotted' : '',
        attendanceStatus: calendarStatus || 'None',
      };
      if (calendarStatus === 'Leave') leave.push(row);
      else if (calendarStatus === 'Confirmed' || calendarStatus === 'Confirm') standby.push(row);
      else uncommitted.push(row);
    });
    const alpha = (a, b) => a.displayName.localeCompare(b.displayName);
    return { standby: standby.sort(alpha), uncommitted: uncommitted.sort(alpha), leave: leave.sort(alpha) };
  }, [members, commitments, session, localGrids, searchQuery]);

  const slots = localGrids[activeTabConfigId]?.slots_allocation || {};
  const columnsCount = parseInt(slots.meta_columnsCount, 10) || 8;
  const rowsCount = parseInt(slots.meta_rowsCount, 10) || 5;
  const tabIds = session?.selectedGridIds || Object.keys(localGrids);

  if (loading) {
    return <div className="p-6 text-xs font-mono uppercase text-slate-500 animate-pulse">Loading raid compose…</div>;
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-2xl p-6 font-sans animate-fadeIn space-y-5">
        {!showCreate ? (
          <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-10 text-center space-y-4 shadow-xl">
            <h1 className="text-sm font-black uppercase tracking-wider text-slate-100">Raid Compose</h1>
            <p className="text-[11px] text-slate-500">Create a raid from an event, date, and saved raid config. Send publishes it to Live Raid → Active Compositions.</p>
            {isOfficer && (
              <button
                type="button"
                onClick={() => { setShowCreate(true); loadWorkspace(); }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                <Plus size={14} /> Create Raid
              </button>
            )}
            {!isOfficer && <p className="text-[11px] text-slate-500">Officers create the raid compose session.</p>}
          </div>
        ) : (
          <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 space-y-5 shadow-xl">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
              <button type="button" onClick={() => setShowCreate(false)} className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white cursor-pointer">
                <ArrowLeft size={14} />
              </button>
              <h2 className="text-sm font-black uppercase text-slate-100">Create Raid</h2>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">1. Event</label>
              <select value={selectedEventKey} onChange={(e) => setSelectedEventKey(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-3.5 py-2.5 text-xs outline-none cursor-pointer">
                <option value="" disabled>-- Select Event --</option>
                {Object.entries(eventsCatalog).map(([key, ev]) => (
                  <option key={key} value={key}>{ev.title || key}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">2. Date</label>
              <select value={selectedEventDate} onChange={(e) => setSelectedEventDate(e.target.value)} disabled={!selectedEventKey} className="w-full bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-3.5 py-2.5 text-xs outline-none cursor-pointer disabled:opacity-50">
                <option value="" disabled>-- Select Date --</option>
                {computedEventDates.map((opt) => (
                  <option key={opt.dateVal} value={opt.dateVal}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono block">3. Raid config</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {Object.keys(compositions).length === 0 ? (
                  <div className="col-span-full p-4 rounded-xl border border-dashed border-slate-800 text-[11px] text-slate-500">
                    No raid configs yet. Create one on <span className="text-slate-300 font-semibold">Raid Party</span>, then come back here.
                  </div>
                ) : (
                  Object.entries(compositions).map(([id, comp]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSelectedConfigId(comp.id || id)}
                      className={`p-3 rounded-xl border text-left text-xs cursor-pointer ${selectedConfigId === (comp.id || id) ? 'bg-indigo-600/10 border-indigo-500 text-indigo-400' : 'border-slate-800 text-slate-400 hover:border-slate-700'}`}
                    >
                      <div className="font-bold uppercase tracking-wider">{comp.title || id}</div>
                      <div className="text-[10px] text-slate-500 mt-1">{(comp.tabOrder || Object.keys(comp.tabs || {})).length} grid tab(s)</div>
                    </button>
                  ))
                )}
              </div>
            </div>
            <button type="button" disabled={creating} onClick={handleCreateRaid} className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50">
              {creating ? 'Creating…' : 'Create'}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 font-sans animate-fadeIn">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-500">Raid Compose</div>
          <h2 className="text-sm font-black uppercase text-slate-100 mt-0.5">{session.eventTitle} ({session.eventDate})</h2>
          <p className="text-[10px] text-slate-500 mt-1">{saving ? 'Saving…' : isDirty ? 'Unsaved changes' : 'Synced'} · {session.configTitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={handleCopyRosterImage} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-800 bg-slate-950 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-white cursor-pointer">
            <Copy size={13} /> Copy Tab Image
          </button>
          {isOfficer && (
            <>
              <button type="button" onClick={() => persistGrids(localGridsRef.current)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-800 bg-slate-950 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-white cursor-pointer">
                <Save size={13} /> Save
              </button>
              <button type="button" disabled={sending} onClick={handleSendRoster} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50">
                <Send size={13} /> {sending ? 'Sending…' : 'Send'}
              </button>
              <button type="button" onClick={handleCloseCompose} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-800 bg-slate-950 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-rose-400 cursor-pointer">
                <X size={13} /> Close
              </button>
            </>
          )}
        </div>
      </div>

      {isOfficer && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => mutateActiveGridSlots((s) => ({ ...s, userId: '' }))} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-800 bg-slate-950 text-[10px] font-mono font-bold text-slate-400 cursor-pointer">Clear Members</button>
          <button type="button" onClick={() => mutateActiveGridSlots((s) => ({ ...s, roleLock: '' }))} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-800 bg-slate-950 text-[10px] font-mono font-bold text-slate-400 cursor-pointer"><Ban size={12} /> Clear Job Class</button>
          <button type="button" onClick={() => mutateActiveGridSlots(() => ({ userId: '', roleLock: '' }))} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-800 bg-slate-950 text-[10px] font-mono font-bold text-slate-400 cursor-pointer"><Eraser size={12} /> Clear All</button>
        </div>
      )}

      <div className="grid grid-cols-12 gap-4 items-stretch">
        <div className={`${rightPanelCollapsed ? 'col-span-12' : 'col-span-12 xl:col-span-9'} border border-slate-800 bg-slate-950 rounded-2xl p-4 min-h-[42rem] relative mt-8`}>
          <div className="absolute -top-[33px] left-0 flex items-end pl-2 z-10">
            {tabIds.map((gridId) => {
              const isActive = activeTabConfigId === gridId;
              const gridObj = localGrids[gridId];
              return (
                <button key={gridId} type="button" onClick={() => { setActiveTabConfigId(gridId); setActivePopover(null); }} className={`px-4 py-1.5 text-xs font-mono font-black uppercase tracking-wider rounded-t-xl border-t border-x ${isActive ? 'bg-slate-950 text-indigo-400 border-slate-800' : 'bg-slate-950/30 text-slate-500 border-slate-900/60'}`}>
                  {gridObj?.name || gridObj?.title || gridId}
                </button>
              );
            })}
          </div>
          <div className="overflow-x-auto flex-1">
            <div ref={gridRef} className="grid gap-2 p-2" style={{ gridTemplateColumns: `repeat(${columnsCount}, minmax(130px, 1fr))` }}>
              <div className="col-span-full bg-slate-950/80 border border-slate-900 rounded-xl p-3 mb-2 text-center" style={{ gridColumn: '1 / -1' }}>
                <span className="text-[9px] font-mono font-bold tracking-widest text-slate-500 uppercase block">{session.configTitle}</span>
                <h2 className="text-sm font-black tracking-wide text-indigo-400 uppercase mt-0.5">{localGrids[activeTabConfigId]?.name || 'Untitled Tab'}</h2>
              </div>
              {Array.from({ length: columnsCount }).map((_, cIdx) => (
                <div key={`h-${cIdx}`} className="px-1 py-1 border-b border-slate-900 pb-2">
                  <input type="text" disabled={!isOfficer} value={slots[`party_name_${cIdx + 1}`] || `Party ${cIdx + 1}`} onChange={(e) => handleUpdatePartyName(cIdx + 1, e.target.value)} className="w-full text-center bg-transparent text-[10px] font-mono font-black uppercase text-slate-400 outline-none" />
                </div>
              ))}
              {Array.from({ length: rowsCount }).flatMap((_, rIdx) =>
                Array.from({ length: columnsCount }).map((_, cIdx) => {
                  const coordKey = `${cIdx + 1}-${rIdx + 1}`;
                  const slotData = slots[coordKey] || { userId: '', roleLock: '' };
                  const allocatedUserObj = slotData.userId ? members[slotData.userId] : null;
                  const lockedJobObj = slotData.roleLock ? jobsCatalog[slotData.roleLock] : null;
                  const isPartyLeader = !!slotData.isPartyLeader;
                  const isAssignPopoverOpen = activePopover?.coordKey === coordKey && activePopover?.type === 'assign';
                  const isGearPopoverOpen = activePopover?.coordKey === coordKey && activePopover?.type === 'gear';
                  const calendarSignKey = `${session.eventDate}_${session.eventKey}`;
                  return (
                    <div
                      key={coordKey}
                      draggable={isOfficer && !!slotData.userId}
                      onDragStart={(e) => { if (isOfficer && slotData.userId) e.dataTransfer.setData('text/plain', JSON.stringify({ source: 'cell', coordKey, userId: slotData.userId })); }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleCellDropIntercept(e, coordKey)}
                      className={`rounded-xl border p-2 min-h-[90px] flex flex-col relative group bg-slate-950/50 ${isPartyLeader ? 'border-red-800' : 'border-slate-900'}`}
                    >
                      {isOfficer && (
                        <div className="absolute bottom-1 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 z-20 bg-slate-950/80 rounded-lg p-0.5">
                          <button type="button" onClick={(e) => { e.stopPropagation(); setActivePopover(isGearPopoverOpen ? null : { coordKey, type: 'gear' }); }} className="p-1 text-slate-500 hover:text-amber-400"><Settings size={13} /></button>
                          <button type="button" disabled={!slotData.userId} onClick={(e) => { e.stopPropagation(); handleBindMemberToCell(coordKey, ''); }} className="p-1 text-slate-500 hover:text-rose-400 disabled:opacity-20"><Trash2 size={13} /></button>
                        </div>
                      )}
                      <div className="flex-1 cursor-pointer pt-3" onClick={() => { if (!isOfficer) return; setActivePopover(isAssignPopoverOpen ? null : { coordKey, type: 'assign' }); }}>
                        {allocatedUserObj ? (
                          <RaidMemberCard allocatedUserObj={allocatedUserObj} jobObj={jobsCatalog[allocatedUserObj.jobCode]} currentStatus={commitments[calendarSignKey]?.[slotData.userId]?.status} isVoiceActive={false} isPartyLeader={isPartyLeader} />
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center text-slate-700 py-2">
                            {lockedJobObj ? (
                              <>
                                <img src={`/assets/icons/classes/${lockedJobObj.iconFile || 'default.svg'}`} alt="" className="w-5 h-5 object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
                                <span className="text-[8px] font-bold uppercase text-slate-400">{lockedJobObj.name}</span>
                              </>
                            ) : <UserPlus size={20} />}
                          </div>
                        )}
                      </div>
                      {isGearPopoverOpen && (
                        <>
                          <div className="fixed inset-0 z-[90]" onClick={() => setActivePopover(null)} />
                          <div className="absolute top-full mt-2 right-0 bg-slate-900 border border-slate-800 p-2 rounded-xl shadow-2xl z-[100] w-56 space-y-1">
                            <button type="button" disabled={!slotData.userId} onClick={() => handleSetPartyLeader(coordKey)} className={`w-full px-2 py-1.5 rounded-lg text-left text-[10px] font-semibold flex items-center gap-1.5 ${isPartyLeader ? 'text-red-400 bg-red-950/50' : 'text-slate-300 hover:bg-slate-800'}`}>
                              <Flag size={11} /> {isPartyLeader ? 'Remove Leader' : 'Set as Leader'} {isPartyLeader && <Crown size={10} className="ml-auto" />}
                            </button>
                            <button type="button" onClick={() => handleSetCellRoleLock(coordKey, '')} className="w-full px-2 py-1 rounded-lg text-left text-[10px] text-slate-400 hover:bg-slate-800 flex items-center gap-1.5"><Ban size={12} /> Clear Role Lock</button>
                            {Object.entries(jobsCatalog).map(([code, j]) => (
                              <button key={code} type="button" onClick={() => handleSetCellRoleLock(coordKey, code)} className="w-full px-2 py-1 rounded-lg text-left text-[10px] text-slate-200 hover:bg-slate-800 flex items-center justify-between">
                                <span className="truncate">{j.name}</span>
                                {slotData.roleLock === code && <Check size={10} className="text-indigo-400" />}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                      {isAssignPopoverOpen && (
                        <>
                          <div className="fixed inset-0 z-[90]" onClick={() => setActivePopover(null)} />
                          <div className="absolute top-full mt-2 left-0 bg-slate-900 border border-slate-800 p-2 rounded-xl shadow-2xl z-[100] w-56 max-h-56 overflow-y-auto">
                            <div className="flex items-center gap-1.5 px-1 pb-2">
                              <Search size={11} className="text-slate-500" />
                              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Filter…" className="w-full bg-transparent text-[10px] text-slate-200 outline-none" />
                            </div>
                            {[...categorizedRosterPools.standby, ...categorizedRosterPools.uncommitted].slice(0, 40).map((player) => (
                              <button key={player.uid} type="button" onClick={() => handleBindMemberToCell(coordKey, player.uid)} className="w-full px-2 py-1 rounded-lg text-left text-[10px] text-slate-200 hover:bg-slate-800 truncate">{player.displayName}</button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
        {!rightPanelCollapsed && (
          <div className="col-span-12 xl:col-span-3">
            <RosterSidebar
              standbyList={categorizedRosterPools.standby}
              uncommittedList={categorizedRosterPools.uncommitted}
              leaveList={categorizedRosterPools.leave}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              isOfficer={isOfficer}
              jobsCatalog={jobsCatalog}
              setRightPanelCollapsed={setRightPanelCollapsed}
            />
          </div>
        )}
      </div>
    </div>
  );
}

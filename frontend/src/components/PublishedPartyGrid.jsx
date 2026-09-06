import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Ban, Check, ChevronLeft, Crown, Eraser, Flag, Save, Search, Settings, Trash2, UserPlus, Users, ShieldOff,
} from 'lucide-react';
import RaidMemberCard from './RaidMemberCard';
import RosterSidebar from './RosterSidebar';
import { apiFetch } from '../services/apiClient';
import { isSlotCoordKey } from '@guildname/shared/compositionTabs';

export default function PublishedPartyGrid({
  published,
  members,
  jobsCatalog,
  commitments,
  isOfficer,
  onPublishedChange,
}) {
  const [localGrids, setLocalGrids] = useState(published?.grids || {});
  const [activeTabConfigId, setActiveTabConfigId] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activePopover, setActivePopover] = useState(null);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);

  const persistTimer = useRef(null);
  const isDirtyRef = useRef(false);
  const localGridsRef = useRef(published?.grids || {});
  const publishedId = published?.id || '';

  useEffect(() => {
    if (isDirtyRef.current) return;
    const grids = published?.grids || {};
    setLocalGrids(grids);
    localGridsRef.current = grids;
    const firstTab = (published?.selectedGridIds || Object.keys(grids))[0] || '';
    setActiveTabConfigId((prev) => (prev && grids[prev] ? prev : firstTab));
  }, [publishedId, published?.lastUpdated]);

  const persistGrids = async (grids) => {
    if (!publishedId || !isOfficer) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/attendance/published/${encodeURIComponent(publishedId)}/save-grids`, {
        method: 'POST',
        body: JSON.stringify({ grids }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to save party grid.');
      isDirtyRef.current = false;
      setIsDirty(false);
      if (data.published && onPublishedChange) onPublishedChange(data.published);
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

  useEffect(() => () => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
  }, []);

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
      slotAlloc[coordKey] = { ...slotAlloc[coordKey], isPartyLeader: !isAlready };
      gridObj.slots_allocation = slotAlloc;
      return { ...prev, [activeTabConfigId]: gridObj };
    });
  };

  const handleSetRaidLeader = (coordKey) => {
    if (!activeTabConfigId) return;
    applyLocalGridsAndPersist((prev) => {
      const gridObj = { ...prev[activeTabConfigId] };
      const slotAlloc = { ...(gridObj.slots_allocation || {}) };
      const isAlready = slotAlloc[coordKey]?.isRaidLeader === true;
      Object.keys(slotAlloc).forEach((k) => {
        if (slotAlloc[k]?.isRaidLeader) slotAlloc[k] = { ...slotAlloc[k], isRaidLeader: false };
      });
      if (!isAlready) slotAlloc[coordKey] = { ...slotAlloc[coordKey], isRaidLeader: true };
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
    const compositeKey = published ? `${published.eventDate}_${published.eventKey}` : '';
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
  }, [members, commitments, published, localGrids, searchQuery]);

  const slots = localGrids[activeTabConfigId]?.slots_allocation || {};
  const columnsCount = parseInt(slots.meta_columnsCount, 10) || 8;
  const rowsCount = parseInt(slots.meta_rowsCount, 10) || 5;
  const tabIds = published?.selectedGridIds || Object.keys(localGrids);
  const calendarSignKey = published ? `${published.eventDate}_${published.eventKey}` : '';

  if (!tabIds.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 px-6 py-10 text-center">
        <p className="text-xs text-slate-400">No raid config on this composition yet.</p>
        <p className="text-[10px] text-slate-600 mt-1">Use Add Raid config, then slot members here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-mono text-slate-500">
          {saving ? 'Saving…' : isDirty ? 'Unsaved changes' : 'Synced'}
          {published?.configTitle ? ` · ${published.configTitle}` : ''}
        </p>
        {isOfficer && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => mutateActiveGridSlots((s) => ({ ...s, userId: '' }))} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-800 bg-slate-950 text-[10px] font-mono font-bold text-slate-400 cursor-pointer">
              <Users size={12} /> Clear Members
            </button>
            <button type="button" onClick={() => mutateActiveGridSlots((s) => ({ ...s, roleLock: '' }))} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-800 bg-slate-950 text-[10px] font-mono font-bold text-slate-400 cursor-pointer">
              <ShieldOff size={12} /> Clear Job Class
            </button>
            <button type="button" onClick={() => mutateActiveGridSlots(() => ({ userId: '', roleLock: '' }))} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-800 bg-slate-950 text-[10px] font-mono font-bold text-slate-400 cursor-pointer">
              <Eraser size={12} /> Clear All
            </button>
            <button type="button" onClick={() => persistGrids(localGridsRef.current)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-800 bg-slate-950 text-[10px] font-mono font-bold text-slate-400 cursor-pointer">
              <Save size={12} /> Save
            </button>
          </div>
        )}
      </div>

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
            <div className="grid gap-2 p-2" style={{ gridTemplateColumns: `repeat(${columnsCount}, minmax(130px, 1fr))` }}>
              <div className="col-span-full bg-slate-950/80 border border-slate-900 rounded-xl p-3 mb-2 text-center" style={{ gridColumn: '1 / -1' }}>
                <span className="text-[9px] font-mono font-bold tracking-widest text-slate-500 uppercase block">{published?.eventTitle || 'Raid'}</span>
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
                  const isRaidLeader = !!slotData.isRaidLeader;
                  const isAssignPopoverOpen = activePopover?.coordKey === coordKey && activePopover?.type === 'assign';
                  const isGearPopoverOpen = activePopover?.coordKey === coordKey && activePopover?.type === 'gear';
                  return (
                    <div
                      key={coordKey}
                      draggable={isOfficer && !!slotData.userId}
                      onDragStart={(e) => { if (isOfficer && slotData.userId) e.dataTransfer.setData('text/plain', JSON.stringify({ source: 'cell', coordKey, userId: slotData.userId })); }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleCellDropIntercept(e, coordKey)}
                      className={`rounded-xl border p-2 min-h-[90px] flex flex-col relative group bg-slate-950/50 ${isRaidLeader ? 'border-red-800' : isPartyLeader ? 'border-blue-700' : 'border-slate-900'}`}
                    >
                      {isOfficer && (
                        <div className="absolute bottom-1 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 z-20 bg-slate-950/80 rounded-lg p-0.5">
                          <button type="button" onClick={(e) => { e.stopPropagation(); setActivePopover(isGearPopoverOpen ? null : { coordKey, type: 'gear' }); }} className="p-1 text-slate-500 hover:text-amber-400"><Settings size={13} /></button>
                          <button type="button" disabled={!slotData.userId} onClick={(e) => { e.stopPropagation(); handleBindMemberToCell(coordKey, ''); }} className="p-1 text-slate-500 hover:text-rose-400 disabled:opacity-20"><Trash2 size={13} /></button>
                        </div>
                      )}
                      <div className="flex-1 cursor-pointer pt-3" onClick={() => { if (!isOfficer) return; setActivePopover(isAssignPopoverOpen ? null : { coordKey, type: 'assign' }); }}>
                        {allocatedUserObj ? (
                          <RaidMemberCard allocatedUserObj={allocatedUserObj} jobObj={jobsCatalog[allocatedUserObj.jobCode]} currentStatus={commitments[calendarSignKey]?.[slotData.userId]?.status} isVoiceActive={false} isPartyLeader={isPartyLeader} isRaidLeader={isRaidLeader} />
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
                            <button type="button" disabled={!slotData.userId} onClick={() => handleSetRaidLeader(coordKey)} className={`w-full px-2 py-1.5 rounded-lg text-left text-[10px] font-semibold flex items-center gap-1.5 ${isRaidLeader ? 'text-red-400 bg-red-950/50' : 'text-slate-300 hover:bg-slate-800'}`}>
                              <Crown size={11} className={isRaidLeader ? 'text-red-500 fill-red-500' : ''} /> {isRaidLeader ? 'Remove Raid Leader' : 'Set as Raid Leader'}
                            </button>
                            <button type="button" disabled={!slotData.userId} onClick={() => handleSetPartyLeader(coordKey)} className={`w-full px-2 py-1.5 rounded-lg text-left text-[10px] font-semibold flex items-center gap-1.5 ${isPartyLeader ? 'text-blue-400 bg-blue-950/50' : 'text-slate-300 hover:bg-slate-800'}`}>
                              <Flag size={11} className={isPartyLeader ? 'text-blue-500 fill-blue-500' : ''} /> {isPartyLeader ? 'Remove Sub Leader' : 'Set as Sub Leader'}
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
        {rightPanelCollapsed ? (
          <div className="col-span-12 xl:col-span-3 xl:max-w-[3rem]">
            <button
              type="button"
              onClick={() => setRightPanelCollapsed(false)}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-indigo-400 hover:text-white cursor-pointer"
            >
              <ChevronLeft size={14} />
            </button>
          </div>
        ) : (
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

// frontend/src/pages/RaidPartyTab.jsx
import { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Copy, 
  Trash2, 
  Settings, 
  MoreVertical, 
  Search, 
  Calendar, 
  AlertCircle, 
  Check, 
  X, 
  UserPlus, 
  ShieldAlert, 
  Save 
} from 'lucide-react';

const backendUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';

export default function RaidPartyTab({ user }) {
  const isOfficer = user?.isOfficer === true;

  // --- Real-time Core Database States ---
  const [loading, setLoading] = useState(true);
  const [compositions, setCompositions] = useState({});
  const [members, setMembers] = useState({});
  const [jobsCatalog, setJobsCatalog] = useState({});
  const [commitments, setCommitments] = useState({});

  // --- Workspace Planning States ---
  const [selectedConfigId, setSelectedConfigId] = useState('');
  const [simulationDate, setSimulationDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  // --- Local Staging Mirror States (Prevents Constant DB Commits) ---
  const [localTitle, setLocalTitle] = useState('');
  const [localGridMatrix, setLocalGridMatrix] = useState({}); // Key: "col-row" => { userId, roleLock }
  const [isDirty, setIsDirty] = useState(false);

  // --- UI Layout Presentation States ---
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenuConfigId, setActiveMenuConfigId] = useState(null);
  const [activePopover, setActivePopover] = useState(null); // Tracks { coordKey, type: 'assign' | 'gear' }
  const [selectedPopoverJob, setSelectedPopoverJob] = useState('');

  // --- Accordion Sidebar Selection Toggle States ---
  const [openAccordion, setOpenAccordion] = useState({ standby: true, uncommitted: true, leave: false });

  // Core Static Geometry Grid Layout Dimensions (Rigid 8 Columns x 5 Rows In-game Mirror)
  const columnsCount = 8;
  const rowsCount = 5;

  // --- Collapsible Layout Drawer Toggles ---
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);

  const centerColSpanClass = useMemo(() => {
    if (leftPanelCollapsed && rightPanelCollapsed) return 'col-span-12 xl:col-span-10';
    if (leftPanelCollapsed) return 'col-span-12 xl:col-span-8';
    if (rightPanelCollapsed) return 'col-span-12 xl:col-span-9';
    return 'col-span-12 xl:col-span-7';
  }, [leftPanelCollapsed, rightPanelCollapsed]);

  // --- 1. Unified Backend API Sync Pipeline (Matches MasterList / Scheduler logic) ---
  const loadRaidPartyWorkspace = async () => {
    try {
      setLoading(true);
      const savedUserSession = localStorage.getItem('dynasty_raid_session');
      const headers = { 'Content-Type': 'application/json' };
      if (savedUserSession) headers['x-user-profile'] = encodeURIComponent(savedUserSession);

      // Fetch master lists using your existing working backend endpoints
      const initRes = await fetch(`${backendUrl}/api/requests/init`, { method: 'GET', headers, credentials: 'include' });
      const initData = await initRes.json();
      if (initData.success) {
        setMembers(initData.members || {});
        setCommitments(initData.commitments || {});
      }

      const configRes = await fetch(`${backendUrl}/api/requests/settings/get`, { method: 'GET', headers, credentials: 'include' });
      const configData = await configRes.json();
      if (configData.success && configData.config?.jobs) {
        setJobsCatalog(configData.config.jobs);
      }

      // Fetch saved matrix configurations out of your backend endpoint
      const compsRes = await fetch(`${backendUrl}/api/attendance/compositions`, { method: 'GET', headers, credentials: 'include' });
      const compsData = await compsRes.json();
      if (compsData.success) {
        setCompositions(compsData.compositions || {});
        if (compsData.compositions && Object.keys(compsData.compositions).length > 0 && !selectedConfigId) {
          const firstKey = Object.keys(compsData.compositions)[0];
          setSelectedConfigId(firstKey);
        }
      }
    } catch (err) {
      console.error("Workspace load error:", err);
    } finally {
      setLoading(false);
    }
  };

  const refreshCompositionsOnly = async () => {
    try {
      const savedUserSession = localStorage.getItem('dynasty_raid_session');
      const headers = { 'Content-Type': 'application/json' };
      if (savedUserSession) headers['x-user-profile'] = encodeURIComponent(savedUserSession);

      const compsRes = await fetch(`${backendUrl}/api/attendance/compositions`, { method: 'GET', headers, credentials: 'include' });
      const compsData = await compsRes.json();
      if (compsData.success) {
        setCompositions(compsData.compositions || {});
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadRaidPartyWorkspace();
  }, [user]);

  // --- 2. Load Selected Config Into Local Mirror Cache ---
  const [prevConfigId, setPrevConfigId] = useState('');
  
  useEffect(() => {
    if (selectedConfigId && compositions[selectedConfigId]) {
      const activeConfig = compositions[selectedConfigId];
      
      if (selectedConfigId !== prevConfigId) {
        setLocalTitle(activeConfig.title || '');
        setPrevConfigId(selectedConfigId);
      }
      
      // Normalize layout parameters cleanly
      const normalizedMatrix = {};
      for (let c = 1; c <= columnsCount; c++) {
        for (let r = 1; r <= rowsCount; r++) {
          const coordKey = `${c}-${r}`;
          const loadedSlot = activeConfig.slots_allocation?.[coordKey];
          normalizedMatrix[coordKey] = {
            userId: loadedSlot?.userId || '',
            roleLock: loadedSlot?.roleLock || ''
          };
        }
      }
      setLocalGridMatrix(normalizedMatrix);
      setIsDirty(false);
    } else {
      setLocalTitle('');
      setLocalGridMatrix({});
      setIsDirty(false);
    }
    setActivePopover(null);
  }, [selectedConfigId, compositions]);

  // --- 3. Compute Roster Status Groups via Simulation Date ---
  const categorizedRosterPools = useMemo(() => {
    const standby = [];
    const uncommitted = [];
    const leave = [];

    // Collect user maps presently assigned in the layout to display location indicators
    const assignedUserLocationsMap = {};
    Object.entries(localGridMatrix).forEach(([coord, slot]) => {
      if (slot.userId) {
        assignedUserLocationsMap[slot.userId] = coord;
      }
    });

    // Extract raw schedule parameters for the chosen target date
    const dateSignaturesMap = {};
    Object.entries(commitments).forEach(([compositeKey, signsSubNode]) => {
      if (compositeKey.startsWith(simulationDate)) {
        Object.entries(signsSubNode).forEach(([uid, payload]) => {
          dateSignaturesMap[uid] = payload.status;
        });
      }
    });

    Object.entries(members).forEach(([uid, profile]) => {
      // ⚠️ CRITICAL RULES ENFORCEMENT: A profile must be explicitly vetted as true roster inside MasterList Tab to populate lists
      if (profile.isRaidRoster !== true) return; 

      const nameMatch = profile.displayName || 'Unknown';
      if (searchQuery.trim() && !nameMatch.toLowerCase().includes(searchQuery.toLowerCase())) {
        return;
      }

      const calendarStatus = dateSignaturesMap[uid];
      const assignedCellCoord = assignedUserLocationsMap[uid];
      
      let locationBadge = '';
      if (assignedCellCoord) {
        const [col, row] = assignedCellCoord.split('-');
        locationBadge = `P${col}-S${row}`;
      }

      const enrichedRow = {
        uid,
        displayName: profile.displayName || 'Raid Member',
        jobCode: profile.jobCode || '',
        assignedLocation: locationBadge
      };

      if (calendarStatus === 'Leave') {
        leave.push(enrichedRow);
      } else if (calendarStatus === 'Confirmed') {
        standby.push(enrichedRow);
      } else {
        // No logged entry matching simulation date parameters -> group into Rule Break Tracker pool
        uncommitted.push(enrichedRow);
      }
    });

    const alphaSort = (a, b) => a.displayName.localeCompare(b.displayName);
    return {
      standby: standby.sort(alphaSort),
      uncommitted: uncommitted.sort(alphaSort),
      leave: leave.sort(alphaSort)
    };
  }, [members, commitments, simulationDate, localGridMatrix, searchQuery]);

  // --- 4. Administrative Configuration Command Handlers (Express API driven) ---
  const handleCreateBlankConfig = async () => {
    if (!isOfficer) return;
    try {
      const savedUserSession = localStorage.getItem('dynasty_raid_session');
      const headers = { 'Content-Type': 'application/json' };
      if (savedUserSession) headers['x-user-profile'] = encodeURIComponent(savedUserSession);

      const res = await fetch(`${backendUrl}/api/attendance/compositions/create`, {
        method: 'POST',
        headers,
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        setSelectedConfigId(data.id);
        await refreshCompositionsOnly();
      } else {
        alert(data.error || "Failed to generate blank configuration tree.");
      }
    } catch (err) {
      console.error("Failed to generate blank configuration tree:", err);
    }
  };

  const handleDuplicateConfig = async (targetId) => {
    if (!isOfficer || !compositions[targetId]) return;
    try {
      const sourceConfig = compositions[targetId];
      const blacklistedLeaveUids = new Set(categorizedRosterPools.leave.map(u => u.uid));
      const cleanAllocationPayload = {};

      if (sourceConfig.slots_allocation) {
        Object.entries(sourceConfig.slots_allocation).forEach(([coord, slot]) => {
          const targetUid = slot?.userId || '';
          const isUserOnLeave = blacklistedLeaveUids.has(targetUid);
          cleanAllocationPayload[coord] = {
            userId: isUserOnLeave ? '' : targetUid,
            roleLock: slot?.roleLock || ''
          };
        });
      }

      const savedUserSession = localStorage.getItem('dynasty_raid_session');
      const headers = { 'Content-Type': 'application/json' };
      if (savedUserSession) headers['x-user-profile'] = encodeURIComponent(savedUserSession);

      const res = await fetch(`${backendUrl}/api/attendance/compositions/duplicate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ sourceId: targetId, cleanAllocationPayload }),
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        setSelectedConfigId(data.id);
        setActiveMenuConfigId(null);
        await refreshCompositionsOnly();
      } else {
        alert(data.error || "Failed to duplicate configuration matrix.");
      }
    } catch (err) {
      console.error("Failed to duplicate configuration matrix:", err);
    }
  };

  const handleDeleteConfig = async (targetId) => {
    if (!isOfficer) return;
    if (!window.confirm("Permanently erase this composition grid configuration? This action cannot be undone.")) return;
    try {
      const savedUserSession = localStorage.getItem('dynasty_raid_session');
      const headers = { 'Content-Type': 'application/json' };
      if (savedUserSession) headers['x-user-profile'] = encodeURIComponent(savedUserSession);

      const res = await fetch(`${backendUrl}/api/attendance/compositions/delete/${targetId}`, {
        method: 'DELETE',
        headers,
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        setActiveMenuConfigId(null);
        if (selectedConfigId === targetId) {
          setSelectedConfigId('');
        }
        await refreshCompositionsOnly();
      } else {
        alert(data.error || "Failed to delete configuration node.");
      }
    } catch (err) {
      console.error("Failed to delete configuration node:", err);
    }
  };

  const handleCommitLocalMirrorToFirebase = async () => {
    if (!selectedConfigId || !isOfficer) return;
    try {
      const savedUserSession = localStorage.getItem('dynasty_raid_session');
      const headers = { 'Content-Type': 'application/json' };
      if (savedUserSession) headers['x-user-profile'] = encodeURIComponent(savedUserSession);

      const res = await fetch(`${backendUrl}/api/attendance/compositions/save`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          configId: selectedConfigId,
          title: localTitle,
          gridMatrix: localGridMatrix
        }),
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        setIsDirty(false);
        alert("💾 SUCCESS: Composition layout batch saved and committed to Firebase Realtime Database.");
        await refreshCompositionsOnly();
      } else {
        alert(data.error || "Batch save transaction failed.");
      }
    } catch (err) {
      console.error("Batch save transaction failed:", err);
    }
  };

  // --- 5. Interactive Cell Grid Allocations Modifier Actions ---
  const handleToggleCellRoleLock = (coordKey, jobCode) => {
    setLocalGridMatrix(prev => ({
      ...prev,
      [coordKey]: {
        ...prev[coordKey],
        roleLock: jobCode
      }
    }));
    setIsDirty(true);
    setActivePopover(null);
  };

  const handleBindMemberToCell = (coordKey, uid) => {
    setLocalGridMatrix(prev => {
      const updated = { ...prev };
      
      // Strict Anti-Cloning Guard: Erase player out of old positions if already allocated elsewhere on the matrix
      if (uid) {
        Object.keys(updated).forEach(k => {
          if (updated[k].userId === uid) {
            updated[k] = { ...updated[k], userId: '' };
          }
        });
      }

      updated[coordKey] = {
        ...updated[coordKey],
        userId: uid
      };
      return updated;
    });
    setIsDirty(true);
    setActivePopover(null);
  };

  return (
    <div className="space-y-4 max-w-[98vw] mx-auto p-1 font-sans text-slate-200 overflow-visible relative">
      
      {/* GLOBAL MACRO FRAME CONSOLE HEADER */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 shadow-md flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 select-none">
        <div className="w-full lg:w-auto">
          <div className="text-[10px] font-mono font-bold tracking-widest text-slate-500 uppercase">Raid Party Workspace</div>
          {selectedConfigId ? (
            <input 
              type="text"
              value={localTitle}
              disabled={!isOfficer}
              onChange={(e) => { setLocalTitle(e.target.value); setIsDirty(true); }}
              className="mt-1 bg-transparent text-lg font-black text-slate-100 outline-none border-b border-dashed border-slate-700 focus:border-indigo-500 font-sans transition-all py-0.5 w-full lg:w-80"
              placeholder="Edit Configuration Name..."
            />
          ) : (
            <h1 className="text-lg font-bold tracking-wider text-slate-400 uppercase mt-1">No Configuration Selected</h1>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto justify-end">
          {/* SIMULATION DATE TRACKER */}
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800/80 rounded-xl p-2 px-3 shadow-inner">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5"><Calendar size={13} /> Target Simulation Date:</span>
            <input 
              type="date"
              value={simulationDate}
              onChange={(e) => setSimulationDate(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-xs text-center text-indigo-400 font-bold font-mono outline-none cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* THREE-COLUMN INTERFACE SPLITTER */}
      <div className="grid grid-cols-12 gap-4 items-stretch relative overflow-visible">
        
        {/* ================= COLUMN 1: LEFT CONFIGURATIONS PANEL ================= */}
        {leftPanelCollapsed ? (
          <div className="col-span-12 xl:col-span-1 border border-slate-900 bg-slate-950/60 rounded-2xl p-2 flex flex-col items-center shadow-md min-h-[45rem] h-auto justify-start select-none py-4">
            <button
              type="button"
              onClick={() => setLeftPanelCollapsed(false)}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-indigo-400 hover:text-white transition cursor-pointer font-bold text-xs"
              title="Expand Configurations Menu"
            >
              📁
            </button>
            <div className="text-[9px] uppercase font-mono font-bold tracking-widest text-slate-600 mt-8 [writing-mode:vertical-lr]">CONFIGS</div>
          </div>
        ) : (
          <div className="col-span-12 xl:col-span-2 border border-slate-800 bg-slate-950/40 rounded-2xl p-3 flex flex-col space-y-4 shadow-md min-h-[45rem] h-auto pb-8">
            <div className="border-b border-slate-900 pb-2 flex items-center justify-between select-none">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setLeftPanelCollapsed(true)}
                  className="p-0.5 rounded text-slate-500 hover:text-slate-300 font-bold transition-colors cursor-pointer text-[10px]"
                  title="Collapse Panel"
                >
                  ◀
                </button>
                <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest">Configurations</span>
              </div>
              {isOfficer && (
                <button 
                  type="button"
                  onClick={handleCreateBlankConfig}
                  className="p-1 rounded bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-600 hover:text-white transition cursor-pointer"
                  title="Create New Blank Configuration Layout"
                >
                  <Plus size={14} />
                </button>
              )}
            </div>

            <div className="space-y-2 overflow-y-auto pr-0.5 scrollbar-thin flex-1 relative">
              {Object.keys(compositions).length > 0 ? (
                Object.entries(compositions).map(([id, comp]) => {
                  const isSelected = selectedConfigId === id;
                  const isMenuOpen = activeMenuConfigId === id;
                  return (
                    <div 
                      key={id}
                      className={`p-3 rounded-xl border relative shadow-sm transition-all duration-150 ${
                        isSelected 
                          ? 'bg-slate-900 border-indigo-500/60 shadow-md' 
                          : 'bg-slate-900/10 border-slate-900 hover:border-slate-800'
                      }`}
                    >
                      <div 
                        onClick={() => setSelectedConfigId(id)}
                        className="cursor-pointer pr-6 min-w-0"
                      >
                        <h4 className={`text-xs font-bold truncate ${isSelected ? 'text-indigo-400' : 'text-slate-300'}`}>
                          {comp.title || 'Untitled Configuration'}
                        </h4>
                        <span className="text-[9px] font-mono text-slate-600 block mt-0.5">{id}</span>
                      </div>

                      {/* CONTEXT ACTIONS CONTROLLER */}
                      {isOfficer && (
                        <div className="absolute right-2 top-2.5">
                          <button
                            type="button"
                            onClick={() => setActiveMenuConfigId(isMenuOpen ? null : id)}
                            className="text-slate-500 hover:text-slate-300 p-0.5 transition cursor-pointer"
                          >
                            <MoreVertical size={13} />
                          </button>

                          {isMenuOpen && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setActiveMenuConfigId(null)} />
                              <div className="absolute right-0 mt-1 bg-slate-900 border border-slate-800 p-1.5 rounded-xl shadow-2xl z-50 w-32 text-left space-y-0.5 origin-top-right">
                                <button 
                                  type="button"
                                  onClick={() => handleDuplicateConfig(id)}
                                  className="w-full px-2 py-1.5 rounded-lg text-left text-[10px] uppercase font-bold tracking-wide text-slate-400 hover:text-white hover:bg-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer"
                                >
                                  <Copy size={11} /> Duplicate
                                </button>
                                <button 
                                  type="button"
                                  onClick={() => handleDeleteConfig(id)}
                                  className="w-full px-2 py-1.5 rounded-lg text-left text-[10px] uppercase font-bold tracking-wide text-rose-400 hover:text-white hover:bg-rose-600 flex items-center gap-1.5 transition-colors cursor-pointer"
                                >
                                  <Trash2 size={11} /> Delete
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-16 text-[11px] text-slate-600 font-mono italic select-none">
                  No active configurations.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= COLUMN 2: CENTER GRID CANVAS PANEL ================= */}
        <div className={`${centerColSpanClass} border border-slate-800 bg-slate-950/60 rounded-2xl p-4 shadow-xl flex flex-col justify-between min-h-[45rem] h-auto pb-8 overflow-visible transition-all duration-300`}>
          <div className="overflow-x-auto overflow-visible scrollbar-thin pr-1 flex-1">
            {selectedConfigId ? (
              <div 
                className="grid gap-2 min-w-[850px] pb-12 overflow-visible"
                style={{ gridTemplateColumns: `repeat(${columnsCount}, minmax(0, 1fr))` }}
              >
                {/* Header Row: Party 1 to 8 */}
                {Array.from({ length: columnsCount }).map((_, cIdx) => (
                  <div key={cIdx} className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest text-center py-1 select-none border-b border-slate-900 pb-2">
                    Party {cIdx + 1}
                  </div>
                ))}

                {/* Grid Matrix Renderer */}
                {Array.from({ length: rowsCount }).map((_, rIdx) => {
                  return Array.from({ length: columnsCount }).map((_, cIdx) => {
                    const coordKey = `${cIdx + 1}-${rIdx + 1}`;
                    const slotData = localGridMatrix[coordKey] || { userId: '', roleLock: '' };

                    // Two-axis boundary alignment guard: prevents boundary popover edge clipping entirely
                    const popoverAlignClass = cIdx === 0 
                      ? "left-0 text-left" 
                      : cIdx === columnsCount - 1 
                        ? "right-0 text-right" 
                        : "left-1/2 -translate-x-1/2 text-left";
                    
                    const popoverVAlignClass = rIdx >= 3 ? "bottom-full mb-2" : "top-full mt-2";

                    const allocatedUserObj = slotData.userId ? members[slotData.userId] : null;
                    const lockedJobObj = slotData.roleLock ? jobsCatalog[slotData.roleLock] : null;
                    
                    const isCellRoleLocked = !!slotData.roleLock;
                    const cellColorTheme = lockedJobObj?.colorTheme || '#1e293b';

                    const isAssignPopoverOpen = activePopover?.coordKey === coordKey && activePopover?.type === 'assign';
                    const isGearPopoverOpen = activePopover?.coordKey === coordKey && activePopover?.type === 'gear';

                    return (
                      <div
                        key={coordKey}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const droppedUid = e.dataTransfer.getData("text/plain");
                          if (droppedUid) handleBindMemberToCell(coordKey, droppedUid);
                        }}
                        className={`rounded-xl border p-2 min-h-[90px] flex flex-col justify-between transition-all font-mono text-xs shadow-inner relative group select-none bg-slate-950/50 border-slate-900 hover:border-slate-800 overflow-visible ${
                          isAssignPopoverOpen || isGearPopoverOpen ? 'z-40 ring-2 ring-indigo-500/50 shadow-lg' : 'z-0'
                        }`}
                        style={{
                          backgroundColor: isCellRoleLocked ? `${cellColorTheme}12` : undefined,
                          borderColor: isCellRoleLocked ? `${cellColorTheme}40` : undefined,
                          boxShadow: isCellRoleLocked ? `inset 0 0 10px ${cellColorTheme}10` : undefined
                        }}
                      >
                        {/* THE GEAR ROLE LOCK POPUP ICON */}
                        {isOfficer && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActivePopover(isGearPopoverOpen ? null : { coordKey, type: 'gear' });
                            }}
                            className={`absolute top-1 right-1 p-1 rounded transition opacity-0 group-hover:opacity-100 cursor-pointer ${
                              isGearPopoverOpen ? 'opacity-100 bg-slate-800 text-amber-400' : 'text-slate-600 hover:text-slate-300'
                            }`}
                          >
                            <Settings size={11} />
                          </button>
                        )}

                        {/* CELL SELECTION WORKFLOW ACTION HANDLER */}
                        <div 
                          className="flex-1 flex flex-col justify-between cursor-pointer pt-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isOfficer) return;
                            setActivePopover(isAssignPopoverOpen ? null : { coordKey, type: 'assign' });
                            setSelectedPopoverJob(slotData.roleLock || '');
                          }}
                        >
                          {allocatedUserObj ? (
                            <div className="space-y-1">
                              <div className="font-sans font-bold text-slate-200 text-[11px] truncate max-w-[90px]" title={allocatedUserObj.displayName}>
                                {allocatedUserObj.displayName}
                              </div>
                              <div 
                                className="text-[9px] font-sans font-semibold tracking-wide truncate max-w-[90px]"
                                style={{ color: jobsCatalog[allocatedUserObj.jobCode]?.colorTheme || '#64748b' }}
                              >
                                {jobsCatalog[allocatedUserObj.jobCode]?.name || 'No Class'}
                              </div>
                            </div>
                          ) : (
                            <div className="h-full flex flex-col items-center justify-center space-y-1 text-slate-700 group-hover:text-slate-500 transition-colors py-2">
                              {isCellRoleLocked ? (
                                <>
                                  <ShieldAlert size={14} style={{ color: cellColorTheme }} />
                                  <span className="text-[8px] font-bold uppercase tracking-wider text-center max-w-full truncate px-0.5" style={{ color: cellColorTheme }}>
                                    {lockedJobObj?.name}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <UserPlus size={13} strokeWidth={2.5} />
                                  <span className="text-[8px] font-bold tracking-widest text-slate-800 font-sans uppercase">Vacant</span>
                                </>
                              )}
                            </div>
                          )}
                        </div>

                        {/* ================= IN-GRID CELL OVERLAY POPUPS (ZERO OUT-OF-BOUND CLIPPING) ================= */}
                        {isGearPopoverOpen && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setActivePopover(null)} />
                            <div className={`absolute ${popoverAlignClass} ${popoverVAlignClass} bg-slate-900 border border-slate-800 p-2 rounded-xl shadow-2xl z-50 w-44 font-sans space-y-1.5 animate-fadeIn text-left`}>
                              <div className="text-[9px] font-mono font-bold uppercase text-slate-500 tracking-wider select-none px-1 border-b border-slate-800 pb-1">Pre-Assign Job Role</div>
                              <div className="max-h-36 overflow-y-auto space-y-0.5 pr-0.5 scrollbar-thin text-left">
                                <button
                                  type="button"
                                  onClick={() => handleToggleCellRoleLock(coordKey, '')}
                                  className="w-full px-2 py-1 rounded-lg text-left text-[10px] font-medium text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                                >
                                  ❌ Clear Role Lock
                                </button>
                                {Object.entries(jobsCatalog).map(([code, j]) => (
                                  <button
                                    key={code}
                                    type="button"
                                    onClick={() => handleToggleCellRoleLock(coordKey, code)}
                                    className="w-full px-2 py-1 rounded-lg text-left text-[10px] font-semibold hover:bg-slate-800 cursor-pointer flex items-center justify-between"
                                    style={{ color: j.colorTheme || '#cbd5e1' }}
                                  >
                                    <span>{j.name}</span>
                                    {slotData.roleLock === code && <Check size={10} />}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </>
                        )}

                        {isAssignPopoverOpen && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setActivePopover(null)} />
                            <div className={`absolute ${popoverAlignClass} ${popoverVAlignClass} bg-slate-900 border border-slate-800 p-2 rounded-xl shadow-2xl z-50 w-52 font-sans space-y-2 animate-fadeIn text-left`}>
                              
                              {/* Workflow Step 1: Filter Selection (Hidden if hard role-locked) */}
                              {!slotData.roleLock ? (
                                <div className="space-y-1 border-b border-slate-800 pb-1.5 text-left">
                                  <div className="text-[9px] font-mono font-bold uppercase text-slate-500 tracking-wider select-none px-1">Filter Class Profile:</div>
                                  <select
                                    value={selectedPopoverJob}
                                    onChange={(e) => setSelectedPopoverJob(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-300 font-semibold outline-none cursor-pointer"
                                  >
                                    <option value="">-- Display All Classes --</option>
                                    {Object.entries(jobsCatalog).map(([code, j]) => (
                                      <option key={code} value={code} className="bg-slate-950" style={{ color: j.colorTheme }}>{j.name}</option>
                                    ))}
                                  </select>
                               </div>
                              ) : (
                                <div className="text-[9px] font-mono font-bold uppercase tracking-wider select-none px-1 border-b border-slate-800 pb-1 flex items-center justify-between" style={{ color: cellColorTheme }}>
                                  <span>🔒 Role Lock: {lockedJobObj?.name}</span>
                                </div>
                              )}

                              {/* Workflow Step 2: Candidates List */}
                              <div className="space-y-1 text-left">
                                <div className="text-[9px] font-mono font-bold uppercase text-slate-500 tracking-wider select-none px-1">Select Candidate:</div>
                                <div className="max-h-48 overflow-y-auto space-y-0.5 pr-0.5 scrollbar-thin text-left">
                                  {slotData.userId && (
                                    <button
                                      type="button"
                                      onClick={() => handleBindMemberToCell(coordKey, '')}
                                      className="w-full px-2 py-1.5 rounded-lg text-left text-[10px] uppercase font-bold text-rose-400 hover:text-white hover:bg-rose-600 cursor-pointer transition-colors"
                                    >
                                      ✖ Unassign Position
                                    </button>
                                  )}
                                  
                                  {(() => {
                                    const poolGroup = [...categorizedRosterPools.standby, ...categorizedRosterPools.uncommitted];
                                    const targetJobFilter = slotData.roleLock || selectedPopoverJob;
                                    
                                    const matchingCandidates = poolGroup.filter(player => {
                                      if (targetJobFilter && player.jobCode !== targetJobFilter) return false;
                                      return true;
                                    });

                                    if (matchingCandidates.length === 0) {
                                      return <div className="text-[10px] text-slate-600 italic px-2 py-1">No standing candidates match.</div>;
                                    }

                                    return matchingCandidates.map(player => {
                                      const isCurrentlySlottedInCell = slotData.userId === player.uid;
                                      return (
                                        <button
                                          key={player.uid}
                                          type="button"
                                          onClick={() => handleBindMemberToCell(coordKey, player.uid)}
                                          className={`w-full px-2 py-1 rounded-lg text-left text-[11px] font-medium transition flex items-center justify-between cursor-pointer ${
                                            isCurrentlySlottedInCell ? 'bg-indigo-600 text-white font-bold' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                                          }`}
                                        >
                                          <span className="truncate max-w-[140px]">{player.displayName}</span>
                                          {player.assignedLocation && (
                                            <span className="text-[8px] bg-slate-950 border border-slate-800 px-1 py-0.5 rounded text-slate-400 font-mono font-bold shrink-0 ml-1">
                                              {player.assignedLocation}
                                            </span>
                                          )}
                                        </button>
                                      );
                                    });
                                  })()}
                                </div>
                              </div>

                            </div>
                          </>
                        )}

                      </div>
                    );
                  });
                })}
              </div>
            ) : (
              <div className="text-center py-24 bg-slate-900/10 border border-dashed border-slate-800 rounded-3xl text-xs text-slate-500 font-mono italic select-none">
                Select or initialize a grid configuration from the Left side panel to operate the layout deck.
              </div>
            )}
          </div>

          {/* RUNTIME STORAGE PERSISTENCE COMMIT TRIGGER */}
          {selectedConfigId && isOfficer && (
            <div className="border-t border-slate-900 pt-3 flex items-center justify-end select-none shrink-0">
              <button
                type="button"
                onClick={handleCommitLocalMirrorToFirebase}
                disabled={!isDirty}
                className={`flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-xs font-bold uppercase tracking-wider text-white transition-all shadow-xl select-none cursor-pointer ${
                  isDirty 
                    ? 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20' 
                    : 'bg-slate-900 border border-slate-800 text-slate-600 cursor-not-allowed shadow-none'
                }`}
              >
                <Save size={14} /> {isDirty ? 'Commit Layout Changes' : 'Configurations Synchronized'}
              </button>
            </div>
          )}
        </div>

        {/* ================= COLUMN 3: RIGHT ROSTER PANEL (25% WIDTH) ================= */}
        {rightPanelCollapsed ? (
          <div className="col-span-12 xl:col-span-1 border border-slate-900 bg-slate-950/60 rounded-2xl p-2 flex flex-col items-center shadow-md min-h-[45rem] h-auto justify-start select-none py-4">
            <button
              type="button"
              onClick={() => setRightPanelCollapsed(false)}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-indigo-400 hover:text-white transition cursor-pointer font-bold text-xs"
              title="Expand Roster Lists"
            >
              👥
            </button>
            <div className="text-[9px] uppercase font-mono font-bold tracking-widest text-slate-600 mt-8 [writing-mode:vertical-lr]">ROSTER REGISTRIES</div>
          </div>
        ) : (
          <div className="col-span-12 xl:col-span-3 border border-slate-800 bg-slate-950/40 rounded-2xl p-3.5 flex flex-col space-y-4 shadow-md min-h-[45rem] h-auto pb-8">
            <div className="space-y-2 select-none shrink-0 border-b border-slate-900 pb-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest block">Roster Registries</span>
                <button
                  type="button"
                  onClick={() => setRightPanelCollapsed(true)}
                  className="p-0.5 rounded text-slate-500 hover:text-slate-300 font-bold transition-colors cursor-pointer text-[10px]"
                  title="Collapse Panel"
                >
                  ▶
                </button>
              </div>
            <div className="relative w-full mt-1.5">
              <input 
                type="text" 
                placeholder="Search Active Roster..." 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)} 
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-[11px] text-slate-200 font-medium placeholder-slate-650 outline-none focus:border-slate-700 font-sans transition-all shadow-inner" 
              />
              <div className="absolute left-2.5 top-2.5 text-slate-500"><Search size={14} /></div>
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery('')} className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-200 font-sans text-xs cursor-pointer">✖</button>
              )}
            </div>
            
            {/* ⚠️ HIGH-VISIBILITY COMPLIANCE EXPLANATION CARD (Addresses why schedule signups don't show up right away) */}
            <div className="mt-2 p-2 bg-slate-900/60 border border-slate-800 rounded-xl text-[10px] text-slate-400 leading-normal font-sans">
              <span className="text-amber-500 font-bold uppercase font-mono text-[9px] block">Roster Sync Note:</span>
              Members must be marked as <strong className="text-slate-200 font-semibold">True Roster</strong> inside the <strong className="text-indigo-400 font-semibold">MasterList Tab</strong> to synchronize their active schedule preferences into these planning arrays.
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pr-0.5 space-y-3 scrollbar-thin">
            
            {/* BUCKET A: THE STANDBY POOL */}
            <div className="border border-slate-900 bg-slate-950/30 rounded-xl overflow-hidden">
              <div 
                onClick={() => setOpenAccordion(prev => ({ ...prev, standby: !prev.standby }))}
                className="p-2.5 px-3 bg-slate-900/40 flex items-center justify-between cursor-pointer select-none text-xs font-bold font-sans"
              >
                <span className="text-emerald-400 flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-emerald-400 fill-emerald-500/10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  Standby Pool ({categorizedRosterPools.standby.length})
                </span>
                <span className="text-slate-600 font-mono text-[10px]">{openAccordion.standby ? '▲' : '▼'}</span>
              </div>
              {openAccordion.standby && (
                <div className="p-2 space-y-1.5 max-h-64 overflow-y-auto pr-0.5 scrollbar-thin border-t border-slate-900">
                  {categorizedRosterPools.standby.length === 0 ? (
                    <div className="text-center py-4 text-[10px] text-slate-600 font-mono italic">No standby entries mapped.</div>
                  ) : (
                    categorizedRosterPools.standby.map(player => {
                      const isSlotted = !!player.assignedLocation;
                      const roleColorTheme = jobsCatalog[player.jobCode]?.colorTheme || '#475569';
                      return (
                        <div 
                          key={player.uid}
                          draggable={!isSlotted}
                          onDragStart={(e) => { e.dataTransfer.setData("text/plain", player.uid); }}
                          className={`p-2.5 rounded-xl border font-mono text-[11px] shadow-sm flex items-center justify-between transition-all ${
                            isSlotted 
                              ? 'bg-slate-950/50 border-slate-900 opacity-40 select-none cursor-not-allowed' 
                              : 'bg-slate-900/30 border-slate-800/80 hover:border-slate-700 cursor-grab active:cursor-grabbing'
                          }`}
                        >
                          <div className="truncate pr-2">
                            <div className="font-sans font-semibold text-slate-200 text-xs truncate flex items-center gap-1.5">
                              {player.displayName}
                            </div>
                            <span className="text-[9px] font-sans font-medium block mt-0.5" style={{ color: roleColorTheme }}>
                              {jobsCatalog[player.jobCode]?.name || 'Unassigned'}
                            </span>
                          </div>
                          {isSlotted && (
                            <span className="bg-indigo-950/40 border border-indigo-900/40 text-indigo-400 px-2 py-0.5 rounded text-[9px] font-bold tracking-wide shrink-0">
                              {player.assignedLocation}
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* BUCKET B: THE UNCOMMITTED POOL */}
            <div className="border border-slate-900 bg-slate-950/30 rounded-xl overflow-hidden">
              <div 
                onClick={() => setOpenAccordion(prev => ({ ...prev, uncommitted: !prev.uncommitted }))}
                className="p-2.5 px-3 bg-slate-900/40 flex items-center justify-between cursor-pointer select-none text-xs font-bold font-sans"
              >
                <span className="text-slate-200 flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-slate-400 fill-slate-500/10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  Uncommitted Pool ({categorizedRosterPools.uncommitted.length})
                </span>
                <span className="text-slate-600 font-mono text-[10px]">{openAccordion.uncommitted ? '▲' : '▼'}</span>
              </div>
              {openAccordion.uncommitted && (
                <div className="p-2 space-y-1.5 max-h-64 overflow-y-auto pr-0.5 scrollbar-thin border-t border-slate-900">
                  {categorizedRosterPools.uncommitted.length === 0 ? (
                    <div className="text-center py-4 text-[10px] text-slate-600 font-mono italic">No compliance omissions caught.</div>
                  ) : (
                    categorizedRosterPools.uncommitted.map(player => {
                      const isSlotted = !!player.assignedLocation;
                      const roleColorTheme = jobsCatalog[player.jobCode]?.colorTheme || '#475569';
                      return (
                        <div 
                          key={player.uid}
                          draggable={!isSlotted}
                          onDragStart={(e) => { e.dataTransfer.setData("text/plain", player.uid); }}
                          className={`p-2.5 rounded-xl border font-mono text-[11px] shadow-sm flex items-center justify-between transition-all ${
                            isSlotted 
                              ? 'bg-slate-950/50 border-slate-900 opacity-40 select-none cursor-not-allowed' 
                              : 'bg-slate-900/30 border-slate-800/80 hover:border-slate-700 cursor-grab active:cursor-grabbing'
                          }`}
                        >
                          <div className="truncate pr-2">
                            <div className="font-sans font-semibold text-slate-200 text-xs truncate flex items-center gap-1.5">
                              {player.displayName}
                            </div>
                            <span className="text-[9px] font-sans font-medium block mt-0.5" style={{ color: roleColorTheme }}>
                              {jobsCatalog[player.jobCode]?.name || 'Unassigned'}
                            </span>
                          </div>
                          {isSlotted ? (
                            <span className="bg-indigo-950/40 border border-indigo-900/40 text-indigo-400 px-2 py-0.5 rounded text-[9px] font-bold tracking-wide shrink-0">
                              {player.assignedLocation}
                            </span>
                          ) : (
                            <span className="text-[8px] text-red-400 tracking-tighter uppercase font-bold px-1.5 py-0.5 bg-red-950/40 border border-red-900/40 rounded shrink-0 select-none">No Entry</span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* BUCKET C: THE ABSENT ON-LEAVE POOL */}
            <div className="border border-slate-900 bg-slate-950/30 rounded-xl overflow-hidden">
              <div 
                onClick={() => setOpenAccordion(prev => ({ ...prev, leave: !prev.leave }))}
                className="p-2.5 px-3 bg-slate-900/40 flex items-center justify-between cursor-pointer select-none text-xs font-bold font-sans"
              >
                <span className="text-slate-500 flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-rose-400 fill-rose-500/10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  Absent / On Leave ({categorizedRosterPools.leave.length})
                </span>
                <span className="text-slate-600 font-mono text-[10px]">{openAccordion.leave ? '▲' : '▼'}</span>
              </div>
              {openAccordion.leave && (
                <div className="p-2 space-y-1.5 max-h-60 overflow-y-auto pr-0.5 scrollbar-thin border-t border-slate-900">
                  {categorizedRosterPools.leave.length === 0 ? (
                    <div className="text-center py-4 text-[10px] text-slate-600 font-mono italic">No formal leave requests filed.</div>
                  ) : (
                    categorizedRosterPools.leave.map(player => {
                      return (
                        <div 
                          key={player.uid}
                          className="p-2.5 rounded-xl border border-red-900/30 bg-red-950/10 font-mono text-[11px] shadow-none flex items-center justify-between select-none"
                        >
                          <div className="truncate pr-2">
                            <div className="font-sans font-bold text-red-400 text-xs truncate flex items-center gap-1.5">
                              <X size={11} className="text-red-500 shrink-0" /> {player.displayName}
                            </div>
                            <span className="text-[9px] font-sans font-medium block mt-0.5 text-slate-500">
                              {jobsCatalog[player.jobCode]?.name || 'Unassigned'}
                            </span>
                          </div>
                          <span className="bg-red-950/60 border border-red-500/30 text-red-400 px-2 py-0.5 rounded text-[8px] font-mono font-bold tracking-wider uppercase shrink-0">
                            On Leave
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

          </div>
        </div>
       )}

      </div>

    </div>
  );
}
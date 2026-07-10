// frontend/src/pages/LiveRaidTab.jsx
import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Play, 
  ArrowLeft, 
  LogOut, 
  Plus, 
  Copy, 
  Trash2, 
  Settings, 
  MoreVertical, 
  Search, 
  Calendar, 
  Check, 
  X, 
  UserPlus, 
  ShieldAlert, 
  Save,
  Grid,
  ChevronLeft,
  ChevronRight,
  Info,
  Volume2,
  AlertTriangle
} from 'lucide-react';

const backendUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';

export default function LiveRaidTab({ user }) {
  const isOfficer = user?.isOfficer === true;

  // --- Real-time Core Database States ---
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null); // Active Live Session
  const [localStep, setLocalStep] = useState(1); // Local wizard step when session is null

  // --- Master Registries Loaded from Settings ---
  const [eventsCatalog, setEventsCatalog] = useState({});
  const [compositions, setCompositions] = useState({});
  const [members, setMembers] = useState({});
  const [jobsCatalog, setJobsCatalog] = useState({});
  const [commitments, setCommitments] = useState({});
  const [warRoomsCatalog, setWarRoomsCatalog] = useState({});
  const [maxConfigsLimit, setMaxConfigsLimit] = useState(5);
  const [maxWarRoomsLimit, setMaxWarRoomsLimit] = useState(2);

  // --- Step 2 Setup Forms States ---
  const [selectedEventKey, setSelectedEventKey] = useState('');
  const [selectedEventDate, setSelectedEventDate] = useState('');
  const [selectedConfigIds, setSelectedConfigIds] = useState([]);
  const [selectedWarRooms, setSelectedWarRooms] = useState([]);

  // --- Step 3 Execution mirror states ---
  const [activeTabConfigId, setActiveTabConfigId] = useState('');
  const [localGrids, setLocalGrids] = useState({});
  const [isDirty, setIsDirty] = useState(false);
  const [liveVoiceUids, setLiveVoiceUids] = useState([]); // Array of UIDs in voice rooms currently
  
  // UI Panels states
  const [activePopover, setActivePopover] = useState(null); // { coordKey, type: 'assign' | 'gear' }
  const [selectedPopoverJob, setSelectedPopoverJob] = useState('');
  const [dragHoveredCoord, setDragHoveredCoord] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [openAccordion, setOpenAccordion] = useState({ standby: true, uncommitted: true, leave: false });
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);

  const gridRef = useRef(null);

  // Unified Request Headers
  const getRequestHeaders = () => {
    const savedUserSession = localStorage.getItem('dynasty_raid_session');
    const headers = { 'Content-Type': 'application/json' };
    if (savedUserSession) {
      headers['x-user-profile'] = encodeURIComponent(savedUserSession);
    }
    return headers;
  };

  // Compute Layout spans matching RaidPartyTab
  const centerColSpanClass = useMemo(() => {
    if (leftPanelCollapsed && rightPanelCollapsed) return 'col-span-12 xl:col-span-10';
    if (leftPanelCollapsed) return 'col-span-12 xl:col-span-8';
    if (rightPanelCollapsed) return 'col-span-12 xl:col-span-9';
    return 'col-span-12 xl:col-span-7';
  }, [leftPanelCollapsed, rightPanelCollapsed]);

  // Load Setup Master lists
  const loadMasterSetupData = async () => {
    try {
      const headers = getRequestHeaders();
      const initRes = await fetch(`${backendUrl}/api/requests/init`, { method: 'GET', headers, credentials: 'include' });
      const initData = await initRes.json();
      if (initData.success) {
        setMembers(initData.members || {});
        setCommitments(initData.commitments || {});
      }

      const settingsRes = await fetch(`${backendUrl}/api/requests/settings/get`, { method: 'GET', headers, credentials: 'include' });
      const settingsData = await settingsRes.json();
      if (settingsData.success && settingsData.config) {
        setJobsCatalog(settingsData.config.jobs || {});
        setEventsCatalog(settingsData.config.events || {});
        setWarRoomsCatalog(settingsData.config.warRooms || {});
        setMaxConfigsLimit(settingsData.config.liveRaidMaxConfigs || 5);
        setMaxWarRoomsLimit(settingsData.config.liveRaidMaxWarRooms || 2);
      }

      const compsRes = await fetch(`${backendUrl}/api/attendance/compositions`, { method: 'GET', headers, credentials: 'include' });
      const compsData = await compsRes.json();
      if (compsData.success) {
        setCompositions(compsData.compositions || {});
      }
    } catch (err) {
      console.error("Error loading master setup lists:", err);
    }
  };

  // Poll Active Live Session lifecycle
  const fetchActiveLiveSession = async (isInitial = false) => {
    try {
      const headers = getRequestHeaders();
      const res = await fetch(`${backendUrl}/api/live-raid/session`, { 
        method: 'GET', 
        headers, 
        credentials: 'include' 
      });
      const data = await res.json();
      if (data.success && data.session) {
        setSession(data.session);
        if (Array.isArray(data.session.lastVoicePoll?.presentUids)) {
          setLiveVoiceUids(data.session.lastVoicePoll.presentUids);
        }
        // Sync local grid changes copy if not editing locally or initial load
        if (isInitial || !isDirty) {
          setLocalGrids(data.session.grids || {});
          if (data.session.selectedConfigIds?.length > 0 && !activeTabConfigId) {
            setActiveTabConfigId(data.session.selectedConfigIds[0]);
          }
        }
      } else {
        setSession(null);
        setLocalGrids({});
      }
    } catch (err) {
      console.error("Failed to sync live session status:", err);
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  // Fetch real-time Voice Presence from backend
  const fetchVoicePresenceList = async (activeSession = session) => {
    const warRoomRefs = activeSession?.selectedWarRoomIds?.length
      ? activeSession.selectedWarRoomIds
      : activeSession?.selectedWarRooms;
    if (!activeSession || !warRoomRefs?.length) return;
    try {
      const headers = getRequestHeaders();
      const channelsParam = warRoomRefs.join(',');
      const res = await fetch(`${backendUrl}/api/live-raid/voice-presence?channels=${encodeURIComponent(channelsParam)}`, {
        method: 'GET',
        headers,
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success && data.presentUids) {
        setLiveVoiceUids(data.presentUids);
      }
    } catch (err) {
      console.error("Voice presence fetching error:", err);
    }
  };

  // Lifecycle Initialization
  useEffect(() => {
    loadMasterSetupData();
    fetchActiveLiveSession(true);
  }, [user]);

  // Periodic Polling synchronization (Real-time collaboration)
  useEffect(() => {
    if (!session) return undefined;

    const liveSessionPoller = setInterval(() => {
      fetchActiveLiveSession(false);
    }, 4000);

    const voicePoller = setInterval(() => {
      fetchVoicePresenceList(session);
    }, 10000);

    fetchVoicePresenceList(session);

    return () => {
      clearInterval(liveSessionPoller);
      clearInterval(voicePoller);
    };
  }, [session?.selectedWarRoomIds, session?.selectedWarRooms]);

  // Event Date Picker Options Generator
  const computedEventDates = useMemo(() => {
    if (!selectedEventKey || !eventsCatalog[selectedEventKey]) return [];
    const template = eventsCatalog[selectedEventKey];
    const p3 = template.phases?.[3];
    if (!p3) return [];

    const targetDayOfWeek = parseInt(p3.dayStart, 10);
    const options = [];
    const today = new Date();

    // Generate date for current week and next week
    for (let offsetWeeks = 0; offsetWeeks <= 1; offsetWeeks++) {
      const targetDate = new Date();
      const currentDay = today.getDay();
      const diff = targetDayOfWeek - currentDay + (offsetWeeks * 7);
      targetDate.setDate(today.getDate() + diff);

      const yyyy = targetDate.getFullYear();
      const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
      const dd = String(targetDate.getDate()).padStart(2, '0');
      
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      options.push({
        dateVal: dateStr,
        label: `${dateStr} (${dayNames[targetDayOfWeek]})`
      });
    }

    return options;
  }, [selectedEventKey, eventsCatalog]);

  // Automatically select first calculated date when event key changes
  useEffect(() => {
    if (computedEventDates.length > 0) {
      setSelectedEventDate(computedEventDates[0].dateVal);
    } else {
      setSelectedEventDate('');
    }
  }, [computedEventDates]);

  // -------------------------------------------------------------
  // Step 3 layout allocation compiler & sidebar unified filter logic
  // -------------------------------------------------------------
  const activeConfigAllocations = useMemo(() => {
    if (!activeTabConfigId || !localGrids[activeTabConfigId]) return {};
    return localGrids[activeTabConfigId].slots_allocation || {};
  }, [activeTabConfigId, localGrids]);

  // Compute conflicts (RED highlight indicators): tracks userIds present in 2+ active grid layouts
  const allocatedConflictsSet = useMemo(() => {
    const counts = {};
    Object.values(localGrids).forEach(grid => {
      if (grid.slots_allocation) {
        Object.entries(grid.slots_allocation).forEach(([coord, slot]) => {
          if (!coord.startsWith("meta_") && !coord.startsWith("party_name_") && slot?.userId) {
            counts[slot.userId] = (counts[slot.userId] || 0) + 1;
          }
        });
      }
    });

    const conflicts = new Set();
    Object.entries(counts).forEach(([uid, count]) => {
      if (count > 1) conflicts.add(uid);
    });
    return conflicts;
  }, [localGrids]);

  // Unified roster lists (hides player cards if placed in ANY selected configuration grids)
  const categorizedRosterPools = useMemo(() => {
    const standby = [];
    const uncommitted = [];
    const leave = [];

    // Map user placements across ALL grids in this session
    const globallyPlacedUids = new Set();
    Object.values(localGrids).forEach(grid => {
      if (grid.slots_allocation) {
        Object.entries(grid.slots_allocation).forEach(([coord, slot]) => {
          if (!coord.startsWith("meta_") && !coord.startsWith("party_name_") && slot?.userId) {
            globallyPlacedUids.add(slot.userId);
          }
        });
      }
    });

    const targetRawDate = session?.eventDate || selectedEventDate;
    const targetEventKey = session?.eventKey || selectedEventKey;

    // Format converter normalizing YYYY-MM-DD hyphens over to standard backend M/D/YYYY slashes
    const targetDate = targetRawDate && targetRawDate.includes('-')
      ? (() => { const [y, m, d] = targetRawDate.split('-'); return `${parseInt(m, 10)}/${parseInt(d, 10)}/${y}`; })()
      : targetRawDate;

    const compositeKey = `${targetDate}_${targetEventKey}`;

    const dateSignaturesMap = {};
    if (commitments[compositeKey]) {
      Object.entries(commitments[compositeKey]).forEach(([uid, payload]) => {
        dateSignaturesMap[uid] = payload.status;
      });
    }

    Object.entries(members).forEach(([uid, profile]) => {
      if (profile.isRaidRoster !== true) return;

      const nameMatch = profile.displayName || 'Unknown';
      if (searchQuery.trim() && !nameMatch.toLowerCase().includes(searchQuery.toLowerCase())) {
        return;
      }

      // Hide card if placed globally (except when matching filter query to search grid location highlight)
      if (globallyPlacedUids.has(uid) && !searchQuery.trim()) {
        return;
      }

      const calendarStatus = dateSignaturesMap[uid];
      const enrichedRow = {
        uid,
        displayName: profile.displayName || 'Raid Member',
        jobCode: profile.jobCode || '',
        assignedLocation: globallyPlacedUids.has(uid) ? 'Already Slotted' : '',
        attendanceStatus: calendarStatus || 'None'
      };

      if (calendarStatus === 'Leave') {
        if (!globallyPlacedUids.has(uid)) leave.push(enrichedRow);
      } else if (calendarStatus === 'Confirmed' || calendarStatus === 'Confirm') {
        if (!globallyPlacedUids.has(uid)) standby.push(enrichedRow);
      } else {
        if (!globallyPlacedUids.has(uid)) uncommitted.push(enrichedRow);
      }
    });

    const alphaSort = (a, b) => a.displayName.localeCompare(b.displayName);
    return {
      standby: standby.sort(alphaSort),
      uncommitted: uncommitted.sort(alphaSort),
      leave: leave.sort(alphaSort)
    };
  }, [members, commitments, selectedEventDate, selectedEventKey, session, localGrids, searchQuery]);

  // -------------------------------------------------------------
  // administrative session handlers
  // -------------------------------------------------------------
  const handleToggleConfigSelection = (id) => {
    setSelectedConfigIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(c => c !== id);
      }
      if (prev.length >= maxConfigsLimit) {
        alert(`Maximum selectable Configurations reached: ${maxConfigsLimit}`);
        return prev;
      }
      return [...prev, id];
    });
  };

  const handleToggleWarRoomSelection = (roomId) => {
    setSelectedWarRooms(prev => {
      if (prev.includes(roomId)) {
        return prev.filter(r => r !== roomId);
      }
      if (prev.length >= maxWarRoomsLimit) {
        alert(`Maximum selectable War Rooms reached: ${maxWarRoomsLimit}`);
        return prev;
      }
      return [...prev, roomId];
    });
  };

  const handleLaunchLiveSession = async () => {
    if (!selectedEventKey || !selectedEventDate) {
      return alert("Select target event cycle date.");
    }
    if (selectedConfigIds.length === 0) {
      return alert("Select at least one Raid Configuration.");
    }
    if (selectedWarRooms.length === 0) {
      return alert("Select at least one Discord War Room.");
    }

    try {
      const headers = getRequestHeaders();
      const bodyPayload = {
        eventKey: selectedEventKey,
        eventDate: selectedEventDate,
        eventTitle: eventsCatalog[selectedEventKey]?.title || 'Raid Session',
        selectedConfigIds,
        selectedWarRooms: selectedWarRooms
      };

      const res = await fetch(`${backendUrl}/api/live-raid/create`, {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyPayload),
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        setSession(data.session);
        setLocalGrids(data.session.grids || {});
        if (data.session.selectedConfigIds?.length > 0) {
          setActiveTabConfigId(data.session.selectedConfigIds[0]);
        }
        setIsDirty(false);
      } else {
        alert(data.error || "Failed to create Live Session.");
      }
    } catch (err) {
      console.error(err);
      alert("Network transmission failure launching raid.");
    }
  };

  const handleCommitLiveGridsChanges = async () => {
    if (!session || !isOfficer) return;
    try {
      const headers = getRequestHeaders();
      const res = await fetch(`${backendUrl}/api/live-raid/update`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          session: {
            grids: localGrids,
            version: (session.version || 1) + 1
          }
        }),
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        setIsDirty(false);
        alert("💾 SUCCESS: Session snapshots committed to Firebase Realtime Database.");
        fetchActiveLiveSession(false);
      } else {
        alert(data.error || "Failed to sync updates.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleEndLiveRaid = async () => {
    if (!session || !isOfficer) return;
    if (!window.confirm("ARE YOU ABSOLUTELY CERTAIN YOU WANT TO END THE RAID SESSION?\nThis action will stop background polling, save attendance metrics, and wipe active session datasets.")) {
      return;
    }
    if (!window.confirm("DOUBLE CONFIRMATION:\nSave entries to history logs and clear the execution deck?")) {
      return;
    }

    try {
      const headers = getRequestHeaders();
      const res = await fetch(`${backendUrl}/api/live-raid/end`, {
        method: 'POST',
        headers,
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        alert("Raid finalized and archived to history ledger.");
        setSession(null);
        setLocalGrids({});
        setIsDirty(false);
        setLocalStep(1);
      } else {
        alert(data.error || "Failed to terminate raid session.");
      }
    } catch (err) {
      console.error(err);
      alert("Network error ending raid.");
    }
  };

  // -------------------------------------------------------------
  // Grid manipulation handlers inside execution tab
  // -------------------------------------------------------------
  const handleUpdatePartyName = (colIdx, value) => {
    if (!activeTabConfigId || !localGrids[activeTabConfigId]) return;
    setLocalGrids(prev => {
      const updated = { ...prev };
      const configObj = { ...updated[activeTabConfigId] };
      const slotAlloc = { ...configObj.slots_allocation };
      slotAlloc[`party_name_${colIdx}`] = value;
      configObj.slots_allocation = slotAlloc;
      updated[activeTabConfigId] = configObj;
      return updated;
    });
    setIsDirty(true);
  };

  const handleBindMemberToCell = async (coordKey, uid) => {
    if (!activeTabConfigId || !localGrids[activeTabConfigId]) return;
    
    // Instantly modify state locally for optimal user interaction speed
    setLocalGrids(prev => {
      const updated = { ...prev };
      const configObj = { ...updated[activeTabConfigId] };
      const slotAlloc = { ...configObj.slots_allocation };
      if (uid) {
        Object.keys(slotAlloc).forEach(k => {
          if (slotAlloc[k] && slotAlloc[k].userId === uid) slotAlloc[k] = { ...slotAlloc[k], userId: '' };
        });
      }
      slotAlloc[coordKey] = { ...slotAlloc[coordKey], userId: uid };
      configObj.slots_allocation = slotAlloc;
      updated[activeTabConfigId] = configObj;
      return updated;
    });
    setActivePopover(null);

    // Stream the atomic path mutation directly down the real-time database pipeline
    try {
      await fetch(`${backendUrl}/api/live-raid/cell-update`, {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ configId: activeTabConfigId, coordKey, userId: uid }),
        credentials: 'include'
      });
    } catch (err) {
      console.error("Granular database write exception caught:", err);
    }
  };

  // HTML5 Drag-Drop hooks
  const handleCellDragStart = (e, coordKey, userId) => {
    if (!isOfficer || !userId) return;
    e.dataTransfer.setData("text/plain", JSON.stringify({ source: 'cell', coordKey, userId }));
  };

  const handleCellDropIntercept = (e, destCoordKey) => {
    e.preventDefault();
    if (!isOfficer || !activeTabConfigId || !localGrids[activeTabConfigId]) return;
    try {
      const rawData = e.dataTransfer.getData("text/plain");
      if (!rawData) return;

      if (rawData.trim().startsWith('{')) {
        const parsed = JSON.parse(rawData);
        if (parsed.source === 'cell') {
          const srcCoord = parsed.coordKey;
          const srcUid = parsed.userId;

          setLocalGrids(prev => {
            const updated = { ...prev };
            const configObj = { ...updated[activeTabConfigId] };
            const slotAlloc = { ...configObj.slots_allocation };

            const destUid = slotAlloc[destCoordKey]?.userId || '';
            slotAlloc[srcCoord] = { ...slotAlloc[srcCoord], userId: destUid };
            slotAlloc[destCoordKey] = { ...slotAlloc[destCoordKey], userId: srcUid };

            configObj.slots_allocation = slotAlloc;
            updated[activeTabConfigId] = configObj;
            return updated;
          });
          setIsDirty(true);
        }
      } else {
        handleBindMemberToCell(destCoordKey, rawData);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleFeederPoolDropIntercept = (e) => {
    e.preventDefault();
    setDragHoveredCoord(null);
    if (!isOfficer) return;
    try {
      const rawData = e.dataTransfer.getData("text/plain");
      if (rawData && rawData.trim().startsWith('{')) {
        const parsed = JSON.parse(rawData);
        if (parsed.source === 'cell') {
          handleBindMemberToCell(parsed.coordKey, '');
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Render Core Wizards
  return (
    <div className="space-y-4 max-w-[98vw] mx-auto p-1 font-sans text-slate-200 overflow-visible relative">
      
      {/* -------------------- STEP 1: CREATE SESSION BUTTON -------------------- */}
      {session === null && localStep === 1 && (
        <div className="flex flex-col items-center justify-center min-h-[75vh] select-none text-center">
          <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-8 max-w-lg shadow-2xl space-y-6">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center animate-pulse">
              <Play size={32} />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-wide text-slate-100 uppercase">Live Raid Operations</h1>
              <p className="text-xs text-slate-400 font-sans mt-2 leading-relaxed">
                Start a shared live raid event session to synchronize Discord voice attendance, map real-time team lists, and resolve layout overrides interactively.
              </p>
            </div>
            
            {isOfficer ? (
              <button
                type="button"
                onClick={() => setLocalStep(2)}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold uppercase tracking-wider py-3.5 px-6 rounded-2xl transition-all duration-150 shadow-xl shadow-indigo-600/10 cursor-pointer"
              >
                Create Live Session
              </button>
            ) : (
              <div className="text-xs text-rose-400 font-mono bg-rose-950/20 border border-rose-900/30 p-3 rounded-xl">
                ⚠️ Administrative privileges required to launch operations deck.
              </div>
            )}
          </div>
        </div>
      )}

      {/* -------------------- STEP 2: SELECT SETTINGS FORM -------------------- */}
      {session === null && localStep === 2 && (
        <div className="mx-auto max-w-3xl bg-slate-900/40 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-4 select-none">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setLocalStep(1)}
                className="p-2 rounded-xl bg-slate-950 border border-slate-850 hover:border-slate-800 text-slate-400 hover:text-slate-200 transition cursor-pointer"
              >
                <ArrowLeft size={14} />
              </button>
              <div>
                <h2 className="text-sm font-black uppercase text-slate-100 tracking-wider">Configure Live Session</h2>
                <p className="text-[10px] text-slate-500 font-sans">Set cycle boundaries and map blueprints.</p>
              </div>
            </div>
            <button 
              onClick={() => setLocalStep(1)} 
              className="text-slate-500 hover:text-slate-350 p-1 transition cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          <div className="space-y-5">
            {/* a. Select Event Cycle & Dates */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">1. Select Target Event</label>
                <select
                  value={selectedEventKey}
                  onChange={(e) => setSelectedEventKey(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-3.5 py-2.5 text-xs outline-none cursor-pointer focus:border-slate-700 transition"
                >
                  <option value="" disabled>-- Select Scheduled Event Template --</option>
                  {Object.entries(eventsCatalog).map(([key, ev]) => (
                    <option key={key} value={key} className="bg-slate-950">{ev.title || 'Untitled Event'}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">2. Event Occurrence Date</label>
                <select
                  value={selectedEventDate}
                  onChange={(e) => setSelectedEventDate(e.target.value)}
                  disabled={!selectedEventKey}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-3.5 py-2.5 text-xs outline-none cursor-pointer focus:border-slate-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="" disabled>-- Select Target Date --</option>
                  {computedEventDates.map(opt => (
                    <option key={opt.dateVal} value={opt.dateVal} className="bg-slate-950">{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* b. Select Configurations (Max configured limit) */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono block">
                3. Choose Configurations (Select up to {maxConfigsLimit})
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto scrollbar-thin pr-1">
                {Object.values(compositions).map((comp) => {
                  const isChecked = selectedConfigIds.includes(comp.id);
                  return (
                    <div 
                      key={comp.id}
                      onClick={() => handleToggleConfigSelection(comp.id)}
                      className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer select-none transition-all ${
                        isChecked 
                          ? 'bg-indigo-600/10 border-indigo-500 text-indigo-400 shadow-md' 
                          : 'bg-slate-950/40 border-slate-800 hover:border-slate-750 text-slate-300'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${isChecked ? 'bg-indigo-600 border-indigo-500' : 'border-slate-700 bg-slate-950'}`}>
                        {isChecked && <Check size={11} className="text-white" />}
                      </div>
                      <span className="text-[11px] font-bold font-sans truncate">{comp.title || 'Untitled Config'}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* c. Select War Rooms (Max configured limit) */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono block">
                4. Select Discord War Rooms (Select up to {maxWarRoomsLimit})
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.entries(warRoomsCatalog).map(([roomId, roomObj]) => {
                  const isChecked = selectedWarRooms.includes(roomId);
                  return (
                    <div 
                      key={roomId}
                      onClick={() => handleToggleWarRoomSelection(roomId)}
                      className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer select-none transition-all ${
                        isChecked 
                          ? 'bg-indigo-600/10 border-indigo-500 text-indigo-400 shadow-md' 
                          : 'bg-slate-950/40 border-slate-800 hover:border-slate-750 text-slate-300'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${isChecked ? 'bg-indigo-600 border-indigo-500' : 'border-slate-700 bg-slate-950'}`}>
                        {isChecked && <Check size={11} className="text-white" />}
                      </div>
                      <div className="truncate">
                        <span className="text-[11px] font-bold font-sans block truncate">{roomObj.name || 'Unnamed Channel'}</span>
                        <span className="text-[8px] font-mono text-slate-500 mt-0.5 block truncate">{roomObj.envKey}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="border-t border-slate-800/80 pt-4 flex justify-end gap-3 select-none">
            <button
              type="button"
              onClick={() => setLocalStep(1)}
              className="border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleLaunchLiveSession}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 text-[10px] font-bold uppercase tracking-wider rounded-xl transition shadow-lg cursor-pointer"
            >
              Start Live Raid Deck
            </button>
          </div>
        </div>
      )}

      {/* -------------------- STEP 3: STARTED DECK INTERFACE -------------------- */}
      {session !== null && (
        <div className="space-y-4 animate-fadeIn">
          {/* HEADER DECK */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 shadow-md flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 select-none">
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-emerald-600/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-widest animate-pulse">
                  🔴 Live Operations Active
                </span>
                <span className="text-[10px] font-mono text-slate-500 font-bold uppercase tracking-widest">
                  Cycle: {session.eventTitle} ({session.eventDate})
                </span>
              </div>
              <h2 className="text-md font-black text-slate-200 uppercase mt-1">
                Collab Console (Officer: {session.launchedBy})
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Tab Selector */}
              <div className="flex bg-slate-950 border border-slate-800 p-0.5 rounded-xl">
                {session.selectedConfigIds?.map(configId => {
                  const isActive = activeTabConfigId === configId;
                  const cTitle = compositions[configId]?.title || configId;
                  return (
                    <button
                      key={configId}
                      type="button"
                      onClick={() => {
                        setActiveTabConfigId(configId);
                        setActivePopover(null);
                      }}
                      className={`px-3 py-1.5 text-[9px] font-mono font-black uppercase tracking-wider rounded-lg transition-all ${
                        isActive 
                          ? 'bg-indigo-600 text-white shadow' 
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {cTitle}
                    </button>
                  );
                })}
              </div>

              {isOfficer && (
                <button
                  type="button"
                  onClick={handleEndLiveRaid}
                  className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white font-mono font-bold text-[10px] uppercase tracking-wider p-2 px-3 rounded-xl transition shadow-lg cursor-pointer"
                >
                  <LogOut size={12} /> End Raid
                </button>
              )}
            </div>
          </div>

          {/* MAIN THREE-COLUMN SPLITTER */}
          <div className="grid grid-cols-12 gap-4 items-stretch relative overflow-visible">
            
            {/* COLUMN 2: CENTER GRID CANVAS (COLUMN 1 REMOVED FOR COMFORTABLE HORIZONTAL GRID SPACE) */}
            <div className="col-span-12 xl:col-span-9 border border-slate-800 bg-slate-950 rounded-b-2xl rounded-tr-2xl p-4 shadow-xl flex flex-col justify-between min-h-[42rem] pb-8 overflow-visible relative mt-9">
              
              {/* OneNote Notebook Folder Tabs Left-Aligned Row */}
              <div className="absolute -top-[33px] left-0 flex items-end pl-2 z-10">
                {session.selectedConfigIds?.map(configId => {
                  const isActive = activeTabConfigId === configId;
                  const cTitle = compositions[configId]?.title || configId;
                  return (
                    <button
                      key={configId}
                      type="button"
                      onClick={() => {
                        setActiveTabConfigId(configId);
                        setActivePopover(null);
                      }}
                      className={`px-4 py-1.5 text-xs font-mono font-black uppercase tracking-wider rounded-t-xl transition-all border-t border-x ${
                        isActive 
                          ? 'bg-slate-950 text-indigo-400 border-slate-800 border-b-slate-950 z-20 font-bold translate-y-[1px]' 
                          : 'bg-slate-950/30 text-slate-500 border-slate-900/60 hover:text-slate-300 hover:bg-slate-950/50 z-0'
                      }`}
                    >
                      {cTitle}
                    </button>
                  );
                })}
              </div>
              <div className="overflow-x-auto overflow-visible scrollbar-thin pr-1 flex-1">
                {activeTabConfigId && localGrids[activeTabConfigId] ? (() => {
                  const activeConfig = localGrids[activeTabConfigId];
                  const slots = activeConfigAllocations;
                  
                  const columnsCount = parseInt(slots["meta_columnsCount"], 10) || 8;
                  const rowsCount = parseInt(slots["meta_rowsCount"], 10) || 5;

                  // Clean, direct reference to the native hyphenated calendar storage key signature
                  const liveRaidCompositeKey = `${session?.eventDate}_${session?.eventKey}`;

                  return (
                    <div 
                      ref={gridRef}
                      className="grid gap-2 pb-12 overflow-visible p-2"
                      style={{ gridTemplateColumns: `repeat(${columnsCount}, minmax(130px, 1fr))` }}
                    >
                      {/* Grid Title Card */}
                      <div 
                        className="col-span-full bg-slate-950/80 border border-slate-900 rounded-xl p-3 mb-2 flex items-center justify-center select-none shadow-sm"
                        style={{ gridColumn: '1 / -1' }}
                      >
                        <div className="text-center">
                          <span className="text-[9px] font-mono font-bold tracking-widest text-slate-500 uppercase block">Grid Composition Session snapshot</span>
                          <h2 className="text-sm font-black tracking-wide text-indigo-400 font-sans mt-0.5 uppercase">
                            {activeConfig.title || 'Untitled Blueprints'}
                          </h2>
                        </div>
                      </div>

                      {/* Party Header Title row */}
                      {Array.from({ length: columnsCount }).map((_, cIdx) => {
                        const colNum = cIdx + 1;
                        const currentCustomName = slots[`party_name_${colNum}`] || `Party ${colNum}`;
                        return (
                          <div key={cIdx} className="px-1 py-1 border-b border-slate-900 pb-2 flex items-center justify-center">
                            <input
                              type="text"
                              value={currentCustomName}
                              disabled={!isOfficer}
                              onChange={(e) => handleUpdatePartyName(colNum, e.target.value)}
                              className="w-full text-center bg-transparent text-[10px] font-mono font-black uppercase text-slate-400 tracking-wider outline-none border-b border-transparent focus:border-slate-800 focus:text-indigo-400 py-0.5"
                            />
                          </div>
                        );
                      })}

                      {/* Custom grid blocks */}
                      {Array.from({ length: rowsCount }).map((_, rIdx) => {
                        return Array.from({ length: columnsCount }).map((_, cIdx) => {
                          const coordKey = `${cIdx + 1}-${rIdx + 1}`;
                          const slotData = slots[coordKey] || { userId: '', roleLock: '' };

                          const popoverAlignClass = cIdx === 0 
                            ? "left-0 text-left" 
                            : cIdx === columnsCount - 1 
                              ? "right-0 text-right" 
                              : "left-1/2 -translate-x-1/2 text-left";
                          
                          const popoverVAlignClass = rIdx >= Math.max(1, rowsCount - 2) ? "bottom-full mb-2" : "top-full mt-2";

                          const allocatedUserObj = slotData.userId ? members[slotData.userId] : null;
                          const lockedJobObj = slotData.roleLock ? jobsCatalog[slotData.roleLock] : null;
                          const isCellRoleLocked = !!slotData.roleLock;
                          const cellColorTheme = lockedJobObj?.colorTheme || '#1e293b';

                          const isAssignPopoverOpen = activePopover?.coordKey === coordKey && activePopover?.type === 'assign';
                          const isGearPopoverOpen = activePopover?.coordKey === coordKey && activePopover?.type === 'gear';
                          const isDragHovered = dragHoveredCoord === coordKey;

                          const isSearchHighlighted = !!(searchQuery.trim() && allocatedUserObj && 
                            allocatedUserObj.displayName.toLowerCase().includes(searchQuery.toLowerCase()));

                          // Voice channel status indicators
                          const isVoiceConnected = slotData.userId
                            ? liveVoiceUids.includes(slotData.userId)
                            : false;
                          const hasPlacementsConflict = slotData.userId
                            ? allocatedConflictsSet.has(slotData.userId)
                            : false;

                          // Calendar excused absent mapping check
                          const calendarSignKey = `${session.eventDate}_${session.eventKey}`;
                          const isUserOnLeave = !!(slotData.userId && commitments[calendarSignKey]?.[slotData.userId]?.status === 'Leave');

                          return (
                            <div
                              key={coordKey}
                              draggable={isOfficer && !!slotData.userId}
                              onDragStart={(e) => handleCellDragStart(e, coordKey, slotData.userId)}
                              onDragOver={(e) => e.preventDefault()}
                              onDragEnter={(e) => { e.preventDefault(); if (isOfficer) setDragHoveredCoord(coordKey); }}
                              onDragLeave={() => { if (dragHoveredCoord === coordKey) setDragHoveredCoord(null); }}
                              onDrop={(e) => {
                                setDragHoveredCoord(null);
                                handleCellDropIntercept(e, coordKey);
                              }}
                              className={`rounded-xl border p-2 min-h-[90px] flex flex-col justify-between transition-all font-mono text-xs shadow-inner relative group select-none bg-slate-950/50 overflow-visible duration-150 ${
                                isDragHovered
                                  ? 'border-indigo-500 ring-2 ring-indigo-500/30 bg-slate-900/40 z-30'
                                  : (isAssignPopoverOpen || isGearPopoverOpen 
                                      ? 'z-40 ring-2 ring-indigo-500/50 shadow-lg border-slate-800' 
                                      : (isSearchHighlighted 
                                          ? 'border-amber-500 ring-2 ring-amber-500/40 bg-slate-900/60 z-10 scale-[1.01]' 
                                          : (isUserOnLeave 
                                              ? 'z-10 border-2' 
                                              : (hasPlacementsConflict
                                                  ? 'border-red-500 ring-2 ring-red-500/40 shadow-[0_0_12px_rgba(239,68,68,0.4)] z-20'
                                                  : (isVoiceConnected 
                                                      ? 'border-emerald-500 ring-2 ring-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.45)]' 
                                                      : 'border-slate-900 hover:border-slate-800 z-0')))))
                              } ${isOfficer && !!slotData.userId ? 'cursor-grab active:cursor-grabbing' : ''}`}
                              style={{
                                backgroundColor: undefined, // Let the background breathe freely behind the gradient mask
                                borderColor: (isSearchHighlighted || isUserOnLeave || hasPlacementsConflict || isVoiceConnected) ? 'transparent' : (isCellRoleLocked ? `${cellColorTheme}30` : undefined),
                                boxShadow: (isSearchHighlighted || isUserOnLeave || hasPlacementsConflict || isVoiceConnected) ? undefined : (isCellRoleLocked ? `inset 0 -6px 12px ${cellColorTheme}10` : undefined),
                                backgroundImage: isUserOnLeave && !isSearchHighlighted
                                  ? 'linear-gradient(#020617, #020617), repeating-linear-gradient(45deg, #b91c1c, #b91c1c 5px, #3f0c10 5px, #3f0c10 10px)'
                                  : (isCellRoleLocked 
                                      ? `linear-gradient(to bottom, transparent 50%, ${cellColorTheme}26 100%)` // Smooth vertical transition anchoring color to card floor
                                      : undefined),
                                backgroundOrigin: isUserOnLeave && !isSearchHighlighted ? 'border-box' : undefined,
                                backgroundClip: isUserOnLeave && !isSearchHighlighted ? 'padding-box, border-box' : undefined
                              }}
                            >
                              {/* Position tags */}
                              <div className="absolute bottom-1 left-1.5 text-[5px] font-mono font-light tracking-tight text-slate-500/50 select-none pointer-events-none z-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                                P{cIdx + 1}-S{rIdx + 1}
                              </div>

                              {/* Discord presence voice indicators */}
                              {slotData.userId && (
                                <div className="absolute top-2 right-2 flex items-center gap-1 z-10 pointer-events-none">
                                  {hasPlacementsConflict && (
                                    <div className="w-2 h-2 rounded-full bg-red-500 shadow-sm shadow-red-500/50 animate-bounce" title="Roster Placements Conflict" />
                                  )}
                                  {/* Calendar Commitment Dot (Confirmed = Green, Leave = Gray, Explicit Absent = Red, Uncommitted = Neutral Slate) */}
                                  <div className={`w-2 h-2 rounded-full ${
                                    (() => {
                                      const currentStatus = commitments[liveRaidCompositeKey]?.[slotData.userId]?.status;
                                      if (currentStatus === 'Confirmed' || currentStatus === 'Confirm') return 'bg-emerald-500';
                                      if (currentStatus === 'Leave') return 'bg-slate-500';
                                      if (currentStatus === 'Absent') return 'bg-rose-500';
                                      return 'bg-slate-600'; // Fall back to a neutral slate color for uncommitted raiders
                                    })()
                                  }`} />
                                </div>
                              )}

                              {/* Cell Controls Tool Deck */}
                              {isOfficer && (
                                <div className="absolute bottom-1 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20 bg-slate-950/60 backdrop-blur-sm rounded-lg p-0.5 border border-slate-900/60">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActivePopover(isGearPopoverOpen ? null : { coordKey, type: 'gear' });
                                    }}
                                    className={`p-1 rounded hover:bg-slate-800 transition-colors ${
                                      isGearPopoverOpen ? 'text-amber-400 bg-slate-800' : 'text-slate-500 hover:text-slate-350'
                                    }`}
                                    title="Set Class Lock"
                                  >
                                    <Settings size={13} />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActivePopover(activePopover?.coordKey === coordKey && activePopover?.type === 'assign' ? null : { coordKey, type: 'assign' });
                                      setSelectedPopoverJob(slotData.roleLock || '');
                                    }}
                                    className={`p-1 rounded hover:bg-slate-800 transition-colors ${
                                      activePopover?.coordKey === coordKey && activePopover?.type === 'assign' ? 'text-indigo-400 bg-slate-800' : 'text-slate-500 hover:text-slate-350'
                                    }`}
                                    title="Assign Roster Candidate"
                                  >
                                    <Info size={13} />
                                  </button>

                                  <span className="text-slate-800 font-mono text-[10px] mx-0.5 pointer-events-none select-none">|</span>

                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (slotData.userId) handleBindMemberToCell(coordKey, '');
                                    }}
                                    disabled={!slotData.userId}
                                    className="p-1 rounded hover:bg-slate-800 text-slate-650 hover:text-rose-450 transition-colors disabled:opacity-20 disabled:hover:text-slate-600 disabled:cursor-not-allowed"
                                    title="Unassign Position"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              )}

                              {/* Interactive Cell overlay click zones */}
                              <div 
                                className="flex-1 flex flex-col justify-between cursor-pointer pt-4.5"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!isOfficer) return;
                                  setActivePopover(isAssignPopoverOpen ? null : { coordKey, type: 'assign' });
                                  setSelectedPopoverJob(slotData.roleLock || '');
                                }}
                              >
                                {allocatedUserObj ? (
                                  <div className="space-y-1">
                                    <div className="font-sans font-bold text-slate-200 text-[17px] truncate max-w-[90px]" title={allocatedUserObj.displayName}>
                                      {allocatedUserObj.displayName}
                                    </div>
                                    <div 
                                      className="text-[8px] font-sans font-light uppercase tracking-wider truncate max-w-[90px] opacity-80"
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
                                        <UserPlus size={20} strokeWidth={2.2} />
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Inline Popovers */}
                              {isGearPopoverOpen && (
                                <>
                                  <div className="fixed inset-0 z-40" onClick={() => setActivePopover(null)} />
                                  <div className={`absolute ${popoverAlignClass} ${popoverVAlignClass} bg-slate-900 border border-slate-800 p-2 rounded-xl shadow-2xl z-50 w-44 font-sans space-y-1.5 animate-fadeIn text-left`}>
                                    <div className="text-[9px] font-mono font-bold uppercase text-slate-500 tracking-wider select-none px-1 border-b border-slate-800 pb-1">Pre-Assign Job Role</div>
                                    <div className="max-h-36 overflow-y-auto space-y-0.5 pr-0.5 scrollbar-thin text-left">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setLocalGrids(prev => {
                                            const updated = { ...prev };
                                            const configObj = { ...updated[activeTabConfigId] };
                                            const slotAlloc = { ...configObj.slots_allocation };
                                            slotAlloc[coordKey] = { ...slotAlloc[coordKey], roleLock: '' };
                                            configObj.slots_allocation = slotAlloc;
                                            updated[activeTabConfigId] = configObj;
                                            return updated;
                                          });
                                          setIsDirty(true);
                                          setActivePopover(null);
                                        }}
                                        className="w-full px-2 py-1 rounded-lg text-left text-[10px] font-medium text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                                      >
                                        ❌ Clear Role Lock
                                      </button>
                                      {Object.entries(jobsCatalog).map(([code, j]) => (
                                        <button
                                          key={code}
                                          type="button"
                                          onClick={() => {
                                            setLocalGrids(prev => {
                                              const updated = { ...prev };
                                              const configObj = { ...updated[activeTabConfigId] };
                                              const slotAlloc = { ...configObj.slots_allocation };
                                              slotAlloc[coordKey] = { ...slotAlloc[coordKey], roleLock: code };
                                              configObj.slots_allocation = slotAlloc;
                                              updated[activeTabConfigId] = configObj;
                                              return updated;
                                            });
                                            setIsDirty(true);
                                            setActivePopover(null);
                                          }}
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
                                  <div className={`absolute ${popoverAlignClass} ${popoverVAlignClass} bg-slate-900 border border-slate-800 p-2 rounded-xl shadow-2xl z-50 w-64 font-sans space-y-2 animate-fadeIn text-left`}>
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

                                    <div className="space-y-1 text-left">
                                      <div className="text-[9px] font-mono font-bold uppercase text-slate-500 tracking-wider select-none px-1">Select Candidate:</div>
                                      <div className="max-h-48 overflow-y-auto space-y-0.5 pr-0.5 scrollbar-thin text-left">
                                        {slotData.userId && (
                                          <button
                                            type="button"
                                            onClick={() => handleBindMemberToCell(coordKey, '')}
                                            className="w-full px-2 py-1.5 rounded-lg text-left text-[10px] uppercase font-bold text-rose-450 hover:text-white hover:bg-rose-600 cursor-pointer transition-colors"
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
                                                <span className="truncate max-w-[180px]">{player.displayName}</span>
                                                {player.assignedLocation && (
                                                  <span className="text-[8px] bg-slate-950 border border-slate-800 px-1 py-0.5 rounded text-[9px] font-bold text-slate-400 font-mono shrink-0 ml-1">
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
                  );
                })() : (
                  <div className="text-center py-24 bg-slate-900/10 border border-dashed border-slate-800 rounded-3xl text-xs text-slate-500 font-mono italic select-none">
                    Session configs loaded. Select active composition tab cards to view grids.
                  </div>
                )}
              </div>

              {/* Commit changes footer layout */}
              {isOfficer && (
                <div className="border-t border-slate-900 pt-3 flex items-center justify-end select-none shrink-0">
                  <button
                    type="button"
                    onClick={handleCommitLiveGridsChanges}
                    disabled={!isDirty}
                    className={`flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-xs font-bold uppercase tracking-wider text-white transition-all shadow-xl select-none cursor-pointer ${
                      isDirty 
                        ? 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20' 
                        : 'bg-slate-900 border border-slate-800 text-slate-650 cursor-not-allowed shadow-none'
                    }`}
                  >
                    <Save size={14} /> {isDirty ? 'Commit Layout Changes' : 'Live Snapshot Synchronized'}
                  </button>
                </div>
              )}
            </div>

            {/* COLUMN 3: RIGHT ROSTER PANEL */}
            {rightPanelCollapsed ? (
              <div className="col-span-12 xl:col-span-1 border border-slate-900 bg-slate-950/60 rounded-2xl p-2 flex flex-col items-center shadow-md min-h-[42rem] justify-start py-4">
                <button
                  type="button"
                  onClick={() => setRightPanelCollapsed(false)}
                  className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-indigo-400 hover:text-white transition cursor-pointer font-bold text-xs"
                >
                  <ChevronLeft size={14} />
                </button>
                <div className="text-[9px] uppercase font-mono font-bold tracking-widest text-slate-600 mt-8 [writing-mode:vertical-lr]">ROSTERS</div>
              </div>
            ) : (
              <div 
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFeederPoolDropIntercept}
                className="col-span-12 xl:col-span-3 border border-slate-800 bg-slate-950/40 rounded-2xl p-3.5 flex flex-col space-y-4 shadow-md min-h-[42rem] pb-8"
              >
                <div className="space-y-2 select-none shrink-0 border-b border-slate-900 pb-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest block">Roster Registries</span>
                    <button
                      type="button"
                      onClick={() => setRightPanelCollapsed(true)}
                      className="p-0.5 rounded text-slate-500 hover:text-slate-350 transition-colors cursor-pointer"
                    >
                      <ChevronRight size={14} />
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
                </div>

                <div className="flex-1 overflow-y-auto pr-0.5 space-y-3 scrollbar-thin">
                  
                  {/* Standby pool */}
                  <div className="border border-slate-900 bg-slate-950/30 rounded-xl overflow-hidden">
                    <div 
                      onClick={() => setOpenAccordion(prev => ({ ...prev, standby: !prev.standby }))}
                      className="p-2.5 px-3 bg-slate-900/40 flex items-center justify-between cursor-pointer select-none text-xs font-bold font-sans"
                    >
                      <span className="text-emerald-400 flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                        Standby Pool ({categorizedRosterPools.standby.length})
                      </span>
                      <span className="text-slate-600 font-mono text-[10px]">{openAccordion.standby ? '▲' : '▼'}</span>
                    </div>
                    {openAccordion.standby && (
                      <div className="p-2 space-y-1.5 max-h-64 overflow-y-auto pr-0.5 scrollbar-thin border-t border-slate-900">
                        {categorizedRosterPools.standby.length === 0 ? (
                          <div className="text-center py-4 text-[10px] text-slate-650 font-mono italic">No standby entries mapped.</div>
                        ) : (
                          categorizedRosterPools.standby.map(player => {
                            const roleColorTheme = jobsCatalog[player.jobCode]?.colorTheme || '#475569';
                            return (
                              <div 
                                key={player.uid}
                                draggable={isOfficer}
                                onDragStart={(e) => { e.dataTransfer.setData("text/plain", player.uid); }}
                                className="p-2.5 rounded-xl border font-mono text-[11px] shadow-sm flex items-center justify-between transition-all bg-slate-900/30 border-slate-800/80 hover:border-slate-700 cursor-grab active:cursor-grabbing relative overflow-hidden"
                              >
                                {/* Dynamic Voice Connection Top-Left Corner Accent Badge */}
                                {liveVoiceUids.includes(player.uid) && (
                                  <div className="absolute top-0 left-0 w-3 h-3 bg-emerald-500 [clip-path:polygon(0_0,100%_0,0_100%)]" title="Connected to Voice Channel" />
                                )}
                                <div className="truncate pr-2">
                                  <div className="font-sans font-semibold text-slate-200 text-xs truncate flex items-center gap-1.5 pl-1">
                                    {player.displayName}
                                  </div>
                                  <span className="text-[9px] font-sans font-medium block mt-0.5 pl-1" style={{ color: roleColorTheme }}>
                                    {jobsCatalog[player.jobCode]?.name || 'Unassigned'}
                                  </span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>

                  {/* Uncommitted pool */}
                  <div className="border border-slate-900 bg-slate-950/30 rounded-xl overflow-hidden">
                    <div 
                      onClick={() => setOpenAccordion(prev => ({ ...prev, uncommitted: !prev.uncommitted }))}
                      className="p-2.5 px-3 bg-slate-900/40 flex items-center justify-between cursor-pointer select-none text-xs font-bold font-sans"
                    >
                      <span className="text-slate-200 flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
                        Uncommitted Pool ({categorizedRosterPools.uncommitted.length})
                      </span>
                      <span className="text-slate-600 font-mono text-[10px]">{openAccordion.uncommitted ? '▲' : '▼'}</span>
                    </div>
                    {openAccordion.uncommitted && (
                      <div className="p-2 space-y-1.5 max-h-64 overflow-y-auto pr-0.5 scrollbar-thin border-t border-slate-900">
                        {categorizedRosterPools.uncommitted.length === 0 ? (
                          <div className="text-center py-4 text-[10px] text-slate-650 font-mono italic">No compliance omissions caught.</div>
                        ) : (
                          categorizedRosterPools.uncommitted.map(player => {
                            const roleColorTheme = jobsCatalog[player.jobCode]?.colorTheme || '#475569';
                            return (
                              <div 
                                key={player.uid}
                                draggable={isOfficer}
                                onDragStart={(e) => { e.dataTransfer.setData("text/plain", player.uid); }}
                                className="p-2.5 rounded-xl border font-mono text-[11px] shadow-sm flex items-center justify-between transition-all bg-slate-900/30 border-slate-800/80 hover:border-slate-700 cursor-grab active:cursor-grabbing relative overflow-hidden"
                              >
                                {/* Dynamic Voice Connection Top-Left Corner Accent Badge */}
                                {liveVoiceUids.includes(player.uid) && (
                                  <div className="absolute top-0 left-0 w-3 h-3 bg-emerald-500 [clip-path:polygon(0_0,100%_0,0_100%)]" title="Connected to Voice Channel" />
                                )}
                                <div className="truncate pr-2">
                                  <div className="font-sans font-semibold text-slate-200 text-xs truncate flex items-center gap-1.5 pl-1">
                                    {player.displayName}
                                  </div>
                                  <span className="text-[9px] font-sans font-medium block mt-0.5 pl-1" style={{ color: roleColorTheme }}>
                                    {jobsCatalog[player.jobCode]?.name || 'Unassigned'}
                                  </span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>

                  {/* On leave pool */}
                  <div className="border border-slate-900 bg-slate-950/30 rounded-xl overflow-hidden">
                    <div 
                      onClick={() => setOpenAccordion(prev => ({ ...prev, leave: !prev.leave }))}
                      className="p-2.5 px-3 bg-slate-900/40 flex items-center justify-between cursor-pointer select-none text-xs font-bold font-sans"
                    >
                      <span className="text-slate-500 flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                        Absent / On Leave ({categorizedRosterPools.leave.length})
                      </span>
                      <span className="text-slate-600 font-mono text-[10px]">{openAccordion.leave ? '▲' : '▼'}</span>
                    </div>
                    {openAccordion.leave && (
                      <div className="p-2 space-y-1.5 max-h-60 overflow-y-auto pr-0.5 scrollbar-thin border-t border-slate-900">
                        {categorizedRosterPools.leave.length === 0 ? (
                          <div className="text-center py-4 text-[10px] text-slate-650 font-mono italic">No formal leave requests filed.</div>
                        ) : (
                          categorizedRosterPools.leave.map(player => {
                            return (
                              <div 
                                key={player.uid}
                                draggable={isOfficer}
                                onDragStart={(e) => { e.dataTransfer.setData("text/plain", player.uid); }}
                                className="p-2.5 rounded-xl border border-red-900/30 bg-red-950/10 font-mono text-[11px] shadow-none flex items-center justify-between select-none cursor-grab active:cursor-grabbing hover:border-red-700/50 transition-all duration-150"
                              >
                                <div className="truncate pr-2">
                                  <div className="font-sans font-bold text-red-400 text-xs truncate flex items-center gap-1.5">
                                    <X size={11} className="text-red-500 shrink-0" /> {player.displayName}
                                  </div>
                                  <span className="text-[9px] font-sans font-medium block mt-0.5 text-slate-500">
                                    {jobsCatalog[player.jobCode]?.name || 'Unassigned'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className={`w-2 h-2 rounded-full shadow-sm ${
                                    liveVoiceUids.includes(player.uid)
                                      ? 'bg-emerald-500 shadow-emerald-500/50 animate-pulse'
                                      : 'bg-rose-500 shadow-rose-500/50'
                                  }`} title={liveVoiceUids.includes(player.uid) ? 'On Discord' : 'Absent'} />
                                </div>
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
      )}

    </div>
  );
}

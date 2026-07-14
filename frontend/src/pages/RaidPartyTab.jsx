// frontend/src/pages/RaidPartyTab.jsx
import { useState, useEffect, useMemo, useRef } from 'react';
import { 
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
  Save,
  Grid,
  ChevronLeft,
  ChevronRight,
  Info,
  Ban,
  Lock,
  Eraser,
  Users,
  ShieldOff,
  Flag,
  Crown
} from 'lucide-react';
import RaidMemberCard from '../components/RaidMemberCard';
import RosterSidebar from '../components/RosterSidebar';
import { buildMemberTrendTimeline } from '../components/MemberTrendSparkline';
import MemberTrendHoverTip from '../components/MemberTrendHoverTip';
import { formatGuildDate, DEFAULT_TZ } from '../utils/guildTime';
import { apiFetch } from '../services/apiClient';
import {
  normalizeComposition,
  normalizeCompositionsMap,
  hydrateMatrixFromAllocation,
  buildBlankGridMatrix,
  buildAssignedLocationsAcrossTabs,
  bindMemberAcrossTabs,
  nextTabId,
  isSlotCoordKey,
} from '@dynastyguild/shared/compositionTabs';

const backendUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';

export default function RaidPartyTab({ user }) {
  const isOfficer = user?.isOfficer === true;

  // --- Real-time Core Database States ---
  const [loading, setLoading] = useState(true);
  const [compositions, setCompositions] = useState({});
  const [members, setMembers] = useState({});
  const [jobsCatalog, setJobsCatalog] = useState({});
  const [commitments, setCommitments] = useState({});
  const [guildTimezone, setGuildTimezone] = useState(DEFAULT_TZ);
  const [historySessions, setHistorySessions] = useState({});

  // --- Workspace Planning States ---
  const [selectedConfigId, setSelectedConfigId] = useState('');
  const [simulationDate, setSimulationDate] = useState(() => formatGuildDate(new Date(), DEFAULT_TZ));

  // --- Local Staging Mirror States ---
  const [localTitle, setLocalTitle] = useState('');
  const [localTabs, setLocalTabs] = useState({});
  const [tabOrder, setTabOrder] = useState([]);
  const [activeTabId, setActiveTabId] = useState('');
  const [localGridMatrix, setLocalGridMatrix] = useState({});
  const [isDirty, setIsDirty] = useState(false);
  const [renamingTabId, setRenamingTabId] = useState(null);

  // --- Dynamic Grid Dimensions (Stateful, max 10x10) ---
  const [columnsCount, setColumnsCount] = useState(8);
  const [rowsCount, setRowsCount] = useState(5);

  // --- UI Layout Presentation States ---
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenuConfigId, setActiveMenuConfigId] = useState(null);
  const [activePopover, setActivePopover] = useState(null); // { coordKey, type: 'assign' | 'gear' }
  const [selectedPopoverJob, setSelectedPopoverJob] = useState('');
  const [dragHoveredCoord, setDragHoveredCoord] = useState(null); 

  const gridRef = useRef(null);

  // --- Accordion Sidebar Selection Toggle States ---
  const [openAccordion, setOpenAccordion] = useState({ standby: true, uncommitted: true, leave: false });

  // --- Collapsible Layout Drawer Toggles ---
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);

  const centerColSpanClass = useMemo(() => {
    if (leftPanelCollapsed && rightPanelCollapsed) return 'col-span-12 xl:col-span-10';
    if (leftPanelCollapsed) return 'col-span-12 xl:col-span-8';
    if (rightPanelCollapsed) return 'col-span-12 xl:col-span-9';
    return 'col-span-12 xl:col-span-7';
  }, [leftPanelCollapsed, rightPanelCollapsed]);

  // --- 1. Unified Backend API Sync Pipeline ---
  const loadRaidPartyWorkspace = async () => {
    try {
      setLoading(true);
      const savedUserSession = localStorage.getItem('dynasty_raid_session');
      const headers = { 'Content-Type': 'application/json' };
      if (savedUserSession) headers['x-user-profile'] = encodeURIComponent(savedUserSession);

      const initRes = await fetch(`${backendUrl}/api/requests/init`, { method: 'GET', headers, credentials: 'include' });
      const initData = await initRes.json();
      if (initData.success) {
        setMembers(initData.members || {});
        setCommitments(initData.commitments || {});
      }

      const configRes = await fetch(`${backendUrl}/api/requests/settings/get`, { method: 'GET', headers, credentials: 'include' });
      const configData = await configRes.json();
      if (configData.success && configData.config) {
        if (configData.config.jobs) setJobsCatalog(configData.config.jobs);
        if (configData.config.timezone) {
          setGuildTimezone(configData.config.timezone);
          setSimulationDate((prev) => prev || formatGuildDate(new Date(), configData.config.timezone));
        }
      }

      const compsRes = await fetch(`${backendUrl}/api/attendance/compositions`, { method: 'GET', headers, credentials: 'include' });
      const compsData = await compsRes.json();
      if (compsData.success) {
        const normalized = normalizeCompositionsMap(compsData.compositions || {});
        setCompositions(normalized);
        if (Object.keys(normalized).length > 0 && !selectedConfigId) {
          const firstKey = Object.keys(normalized)[0];
          setSelectedConfigId(firstKey);
        }
      }

      const histRes = await apiFetch('/api/live-raid/history/all', { method: 'GET' });
      const histData = await histRes.json();
      if (histData.success) {
        setHistorySessions(histData.sessions || {});
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
        setCompositions(normalizeCompositionsMap(compsData.compositions || {}));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCopyRosterImage = async () => {
    if (!gridRef.current) return;
    try {
      // Wrap the image generator inside a Promise to pass to ClipboardItem natively, keeping user gesture alive
      const imagePromise = (async () => {
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
            width: (node.scrollWidth + 8) + 'px',
            height: (node.scrollHeight + 8) + 'px',
            margin: '0',
            padding: '8px'
          }
        });
      })();

      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": imagePromise })
      ]);
      alert(`📋 SUCCESS: Grid Tab "${localTabs[activeTabId]?.name || 'Main'}" snapshot copied to clipboard!`);
    } catch (err) {
      console.error("Clipboard copy exception:", err);
      alert(`❌ ERROR: Copy failed.\nReason: ${err.name || 'Error'}: ${err.message || err}`);
    }
  };

  // Cache continuous real-time calendar values for matching grid dot lookups
  useEffect(() => {
    loadRaidPartyWorkspace();
  }, [user]);

  // --- 2. Load Selected Config Into Local Mirror Cache ---
  const [prevConfigId, setPrevConfigId] = useState('');

  const applyTabMatrix = (tabs, tabId) => {
    const tab = tabs[tabId];
    const { matrix, columnsCount: cols, rowsCount: rows } = hydrateMatrixFromAllocation(
      tab?.slots_allocation || {}
    );
    setLocalGridMatrix(matrix);
    setColumnsCount(cols);
    setRowsCount(rows);
  };

  const syncMatrixIntoTabs = (tabs, tabId, matrix, cols, rows) => {
    if (!tabId || !tabs[tabId]) return tabs;
    return {
      ...tabs,
      [tabId]: {
        ...tabs[tabId],
        slots_allocation: {
          ...matrix,
          meta_columnsCount: cols,
          meta_rowsCount: rows,
        },
      },
    };
  };
  
  useEffect(() => {
    if (selectedConfigId && compositions[selectedConfigId]) {
      const activeConfig = normalizeComposition(compositions[selectedConfigId], selectedConfigId);

      if (selectedConfigId !== prevConfigId) {
        setLocalTitle(activeConfig.title || '');
        setPrevConfigId(selectedConfigId);
        setLocalTabs(activeConfig.tabs);
        setTabOrder(activeConfig.tabOrder);
        const firstTab = activeConfig.tabOrder[0] || Object.keys(activeConfig.tabs)[0];
        setActiveTabId(firstTab);
        applyTabMatrix(activeConfig.tabs, firstTab);
        setIsDirty(false);
      } else if (!isDirty) {
        // Refresh from server only when clean
        setLocalTitle(activeConfig.title || '');
        setLocalTabs(activeConfig.tabs);
        setTabOrder(activeConfig.tabOrder);
        const keepTab = activeConfig.tabs[activeTabId]
          ? activeTabId
          : (activeConfig.tabOrder[0] || Object.keys(activeConfig.tabs)[0]);
        setActiveTabId(keepTab);
        applyTabMatrix(activeConfig.tabs, keepTab);
      }
    } else {
      setLocalTitle('');
      setLocalTabs({});
      setTabOrder([]);
      setActiveTabId('');
      setLocalGridMatrix({});
      setColumnsCount(8);
      setRowsCount(5);
      setIsDirty(false);
    }
    setActivePopover(null);
  }, [selectedConfigId, compositions, isDirty]);

  const handleSelectGridTab = (tabId) => {
    if (!tabId || tabId === activeTabId) return;
    const flushed = syncMatrixIntoTabs(localTabs, activeTabId, localGridMatrix, columnsCount, rowsCount);
    setLocalTabs(flushed);
    setActiveTabId(tabId);
    applyTabMatrix(flushed, tabId);
    setActivePopover(null);
    setRenamingTabId(null);
  };

  const handleAddGridTab = () => {
    if (!isOfficer || !selectedConfigId) return;
    const flushed = syncMatrixIntoTabs(localTabs, activeTabId, localGridMatrix, columnsCount, rowsCount);
    const newId = nextTabId(flushed);
    const blank = buildBlankGridMatrix(8, 5);
    const nextTabs = {
      ...flushed,
      [newId]: { id: newId, name: `Tab ${Object.keys(flushed).length + 1}`, slots_allocation: blank },
    };
    const nextOrder = [...(tabOrder.length ? tabOrder : Object.keys(flushed)), newId];
    setLocalTabs(nextTabs);
    setTabOrder(nextOrder);
    setActiveTabId(newId);
    applyTabMatrix(nextTabs, newId);
    setIsDirty(true);
  };

  const handleRenameGridTab = (tabId, name) => {
    setLocalTabs((prev) => ({
      ...prev,
      [tabId]: { ...prev[tabId], name: name || 'Untitled Tab' },
    }));
    setIsDirty(true);
  };

  const handleDeleteGridTab = (tabId) => {
    if (!isOfficer) return;
    if (tabOrder.length <= 1) {
      alert('A Raid Config must keep at least one Grid Tab.');
      return;
    }
    if (!window.confirm(`Delete Grid Tab "${localTabs[tabId]?.name || tabId}"?`)) return;
    const flushed = syncMatrixIntoTabs(localTabs, activeTabId, localGridMatrix, columnsCount, rowsCount);
    const nextTabs = { ...flushed };
    delete nextTabs[tabId];
    const nextOrder = tabOrder.filter((id) => id !== tabId);
    const nextActive = activeTabId === tabId ? nextOrder[0] : activeTabId;
    setLocalTabs(nextTabs);
    setTabOrder(nextOrder);
    setActiveTabId(nextActive);
    applyTabMatrix(nextTabs, nextActive);
    setIsDirty(true);
  };

  // --- 3. Compute Roster Status Pools via Simulation Date ---
  const categorizedRosterPools = useMemo(() => {
    const standby = [];
    const uncommitted = [];
    const leave = [];

    const flushedTabs = activeTabId
      ? syncMatrixIntoTabs(localTabs, activeTabId, localGridMatrix, columnsCount, rowsCount)
      : localTabs;
    const assignedMap = buildAssignedLocationsAcrossTabs(flushedTabs, tabOrder);

    const dateSignaturesMap = {};
    Object.entries(commitments).forEach(([compositeKey, signsSubNode]) => {
      if (compositeKey.startsWith(simulationDate)) {
        Object.entries(signsSubNode).forEach(([uid, payload]) => {
          dateSignaturesMap[uid] = payload.status;
        });
      }
    });

    Object.entries(members).forEach(([uid, profile]) => {
      if (profile.isRaidRoster !== true) return;

      const nameMatch = profile.displayName || 'Unknown';
      if (searchQuery.trim() && !nameMatch.toLowerCase().includes(searchQuery.toLowerCase())) {
        return;
      }

      const calendarStatus = dateSignaturesMap[uid];
      const assigned = assignedMap[uid];

      let locationBadge = '';
      if (assigned) {
        const [col, row] = assigned.coordKey.split('-');
        const tabAlloc = flushedTabs[assigned.tabId]?.slots_allocation || {};
        const customPartyTitle = tabAlloc[`party_name_${col}`] || `P${col}`;
        locationBadge = `${assigned.tabName} · ${customPartyTitle}-S${row}`;
      }

      const enrichedRow = {
        uid,
        displayName: profile.displayName || 'Raid Member',
        jobCode: profile.jobCode || '',
        assignedLocation: locationBadge,
        attendanceStatus: calendarStatus || 'None'
      };

      if (calendarStatus === 'Leave') {
        if (!assigned) leave.push(enrichedRow);
      } else if (calendarStatus === 'Confirmed') {
        if (!assigned) standby.push(enrichedRow);
      } else {
        if (!assigned) uncommitted.push(enrichedRow);
      }
    });

    const alphaSort = (a, b) => a.displayName.localeCompare(b.displayName);
    return {
      standby: standby.sort(alphaSort),
      uncommitted: uncommitted.sort(alphaSort),
      leave: leave.sort(alphaSort)
    };
  }, [members, commitments, simulationDate, localGridMatrix, localTabs, tabOrder, activeTabId, columnsCount, rowsCount, searchQuery]);

  // --- 4. Administrative Configuration Command Handlers ---
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
      console.error(err);
    }
  };

  const handleDuplicateConfig = async (targetId) => {
    if (!isOfficer || !compositions[targetId]) return;
    try {
      const sourceConfig = normalizeComposition(compositions[targetId], targetId);
      const blacklistedLeaveUids = new Set(categorizedRosterPools.leave.map(u => u.uid));
      const cleanTabsPayload = {};

      Object.entries(sourceConfig.tabs || {}).forEach(([tabId, tab]) => {
        const cleanAllocationPayload = {};
        Object.entries(tab.slots_allocation || {}).forEach(([coord, slot]) => {
          if (coord.startsWith('meta_') || coord.startsWith('party_name_')) {
            cleanAllocationPayload[coord] = slot;
            return;
          }
          if (!isSlotCoordKey(coord)) {
            cleanAllocationPayload[coord] = slot;
            return;
          }
          const targetUid = slot?.userId || '';
          const isUserOnLeave = blacklistedLeaveUids.has(targetUid);
          cleanAllocationPayload[coord] = {
            userId: isUserOnLeave ? '' : targetUid,
            roleLock: slot?.roleLock || ''
          };
        });
        cleanTabsPayload[tabId] = {
          id: tabId,
          name: tab.name || 'Untitled Tab',
          slots_allocation: cleanAllocationPayload,
        };
      });

      const savedUserSession = localStorage.getItem('dynasty_raid_session');
      const headers = { 'Content-Type': 'application/json' };
      if (savedUserSession) headers['x-user-profile'] = encodeURIComponent(savedUserSession);

      const res = await fetch(`${backendUrl}/api/attendance/compositions/duplicate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ sourceId: targetId, cleanTabsPayload }),
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
      console.error(err);
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
      console.error(err);
    }
  };

  const handleCommitLocalMirrorToFirebase = async () => {
    if (!selectedConfigId || !isOfficer || !activeTabId) return;
    try {
      const savedUserSession = localStorage.getItem('dynasty_raid_session');
      const headers = { 'Content-Type': 'application/json' };
      if (savedUserSession) headers['x-user-profile'] = encodeURIComponent(savedUserSession);

      const flushedTabs = syncMatrixIntoTabs(localTabs, activeTabId, localGridMatrix, columnsCount, rowsCount);

      const res = await fetch(`${backendUrl}/api/attendance/compositions/save`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          configId: selectedConfigId,
          title: localTitle,
          tabs: flushedTabs,
          tabOrder,
        }),
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        setLocalTabs(flushedTabs);
        setIsDirty(false);
        alert("💾 SUCCESS: Raid Config + Grid Tabs saved.");
        await refreshCompositionsOnly();
      } else {
        alert(data.error || "Batch save transaction failed.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // --- 5. Custom Party and Grid Dimension Modifiers ---
  const handleUpdatePartyName = (colIdx, value) => {
    setLocalGridMatrix(prev => {
      const next = { ...prev, [`party_name_${colIdx}`]: value };
      setLocalTabs((tabs) => syncMatrixIntoTabs(tabs, activeTabId, next, columnsCount, rowsCount));
      return next;
    });
    setIsDirty(true);
  };

  const handleResizeGridTopology = (dimension, action) => {
    if (!isOfficer) return;
    let nextCols = columnsCount;
    let nextRows = rowsCount;
    if (dimension === 'cols') {
      nextCols = action === 'add' ? Math.min(10, columnsCount + 1) : Math.max(1, columnsCount - 1);
      setColumnsCount(nextCols);
    } else {
      nextRows = action === 'add' ? Math.min(10, rowsCount + 1) : Math.max(1, rowsCount - 1);
      setRowsCount(nextRows);
    }
    setLocalTabs((tabs) => syncMatrixIntoTabs(tabs, activeTabId, localGridMatrix, nextCols, nextRows));
    setIsDirty(true);
  };

  const handleToggleCellRoleLock = (coordKey, jobCode) => {
    setLocalGridMatrix(prev => {
      const next = {
        ...prev,
        [coordKey]: {
          ...prev[coordKey],
          roleLock: jobCode
        }
      };
      setLocalTabs((tabs) => syncMatrixIntoTabs(tabs, activeTabId, next, columnsCount, rowsCount));
      return next;
    });
    setIsDirty(true);
    setActivePopover(null);
  };

  const handleSetPartyLeader = (coordKey) => {
    const isAlready = localGridMatrix[coordKey]?.isPartyLeader === true;
    setLocalGridMatrix((prev) => {
      const next = { ...prev };
      // Clear leader from every slot first (only 1 leader per tab)
      Object.keys(next).forEach((k) => {
        if (next[k]?.isPartyLeader) next[k] = { ...next[k], isPartyLeader: false };
      });
      // If this slot wasn't the leader, crown it
      if (!isAlready) next[coordKey] = { ...next[coordKey], isPartyLeader: true };
      setLocalTabs((tabs) => syncMatrixIntoTabs(tabs, activeTabId, next, columnsCount, rowsCount));
      return next;
    });
    setIsDirty(true);
    setActivePopover(null);
  };

  const handleBindMemberToCell = (coordKey, uid) => {
    const flushed = syncMatrixIntoTabs(localTabs, activeTabId, localGridMatrix, columnsCount, rowsCount);
    const nextTabs = bindMemberAcrossTabs(flushed, activeTabId, coordKey, uid);
    setLocalTabs(nextTabs);
    applyTabMatrix(nextTabs, activeTabId);
    setIsDirty(true);
    setActivePopover(null);
  };

  const handleClearGridMembers = () => {
    if (!isOfficer || !activeTabId) return;
    if (!window.confirm('Clear all member assignments on this Grid Tab? Role locks stay.')) return;
    setLocalGridMatrix((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (isSlotCoordKey(k) && next[k]) {
          next[k] = { ...next[k], userId: '' };
        }
      });
      setLocalTabs((tabs) => syncMatrixIntoTabs(tabs, activeTabId, next, columnsCount, rowsCount));
      return next;
    });
    setIsDirty(true);
    setActivePopover(null);
  };

  const handleClearGridJobLocks = () => {
    if (!isOfficer || !activeTabId) return;
    if (!window.confirm('Clear all job class role locks on this Grid Tab? Members stay assigned.')) return;
    setLocalGridMatrix((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (isSlotCoordKey(k) && next[k]) {
          next[k] = { ...next[k], roleLock: '' };
        }
      });
      setLocalTabs((tabs) => syncMatrixIntoTabs(tabs, activeTabId, next, columnsCount, rowsCount));
      return next;
    });
    setIsDirty(true);
    setActivePopover(null);
  };

  const handleClearGridAll = () => {
    if (!isOfficer || !activeTabId) return;
    if (!window.confirm('Clear ALL members and job locks on this Grid Tab?')) return;
    setLocalGridMatrix((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (isSlotCoordKey(k) && next[k]) {
          next[k] = { userId: '', roleLock: '' };
        }
      });
      setLocalTabs((tabs) => syncMatrixIntoTabs(tabs, activeTabId, next, columnsCount, rowsCount));
      return next;
    });
    setIsDirty(true);
    setActivePopover(null);
  };

  // --- 6. Bi-Directional HTML5 Drag & Drop Sub-System ---
  const handleCellDragStart = (e, coordKey, userId) => {
    if (!isOfficer || !userId) return;
    e.dataTransfer.setData("text/plain", JSON.stringify({ source: 'cell', coordKey, userId }));
  };

  const handleCellDropIntercept = (e, destCoordKey) => {
    e.preventDefault();
    if (!isOfficer) return;
    try {
      const rawData = e.dataTransfer.getData("text/plain");
      if (!rawData) return;
      
      if (rawData.trim().startsWith('{')) {
        const parsed = JSON.parse(rawData);
        if (parsed.source === 'cell') {
          const srcCoord = parsed.coordKey;
          const srcUid = parsed.userId;
          const destUid = localGridMatrix[destCoordKey]?.userId || '';

          setLocalGridMatrix(prev => {
            const next = {
              ...prev,
              [srcCoord]: { ...prev[srcCoord], userId: destUid },
              [destCoordKey]: { ...prev[destCoordKey], userId: srcUid }
            };
            setLocalTabs((tabs) => syncMatrixIntoTabs(tabs, activeTabId, next, columnsCount, rowsCount));
            return next;
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

  // Cache continuous real-time calendar values for matching grid dot lookups
  const cellAttendanceMap = {};
  Object.entries(commitments).forEach(([compositeKey, subNode]) => {
    if (compositeKey.startsWith(simulationDate)) {
      Object.entries(subNode).forEach(([uid, payload]) => {
        cellAttendanceMap[uid] = payload.status;
      });
    }
  });

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
              placeholder="Edit Raid Config Name..."
            />
          ) : (
            <h1 className="text-lg font-bold tracking-wider text-slate-400 uppercase mt-1">No Configuration Selected</h1>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto justify-end">
          {/* STATEFUL TOPOLOGY MATRIX CONTROLLERS */}
          {selectedConfigId && isOfficer && (
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800/80 rounded-xl p-1 px-2.5 shadow-inner text-slate-400 font-mono text-[10px] font-bold">
              <Grid size={13} className="text-slate-500 shrink-0" />
              <span>COLUMNS:</span>
              <button onClick={() => handleResizeGridTopology('cols', 'sub')} disabled={columnsCount <= 1} className="w-5 h-5 bg-slate-900 border border-slate-800 rounded flex items-center justify-center font-bold text-slate-300 disabled:opacity-20">-</button>
              <span className="text-slate-100 w-4 text-center">{columnsCount}</span>
              <button onClick={() => handleResizeGridTopology('cols', 'add')} disabled={columnsCount >= 10} className="w-5 h-5 bg-slate-900 border border-slate-800 rounded flex items-center justify-center font-bold text-slate-300 disabled:opacity-20">+</button>
              <span className="border-l border-slate-800 h-4 mx-1" />
              <span>ROWS:</span>
              <button onClick={() => handleResizeGridTopology('rows', 'sub')} disabled={rowsCount <= 1} className="w-5 h-5 bg-slate-900 border border-slate-800 rounded flex items-center justify-center font-bold text-slate-300 disabled:opacity-20">-</button>
              <span className="text-slate-100 w-4 text-center">{rowsCount}</span>
              <button onClick={() => handleResizeGridTopology('rows', 'add')} disabled={rowsCount >= 10} className="w-5 h-5 bg-slate-900 border border-slate-800 rounded flex items-center justify-center font-bold text-slate-300 disabled:opacity-20">+</button>
            </div>
          )}

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
          {selectedConfigId && isOfficer && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleClearGridMembers}
                className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 hover:border-amber-700/60 p-2 px-2.5 shadow-inner rounded-xl text-[10px] font-mono font-bold text-slate-400 hover:text-amber-300 transition cursor-pointer select-none"
                title="Clear member assignments only (role locks kept)"
              >
                <Users size={12} /> Clear Members
              </button>
              <button
                type="button"
                onClick={handleClearGridJobLocks}
                className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 hover:border-sky-700/60 p-2 px-2.5 shadow-inner rounded-xl text-[10px] font-mono font-bold text-slate-400 hover:text-sky-300 transition cursor-pointer select-none"
                title="Clear job class role locks only (members kept)"
              >
                <ShieldOff size={12} /> Clear Job Class
              </button>
              <button
                type="button"
                onClick={handleClearGridAll}
                className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 hover:border-rose-700/60 p-2 px-2.5 shadow-inner rounded-xl text-[10px] font-mono font-bold text-slate-400 hover:text-rose-300 transition cursor-pointer select-none"
                title="Clear members and job locks on this Grid Tab"
              >
                <Eraser size={12} /> Clear All
              </button>
              <button
                type="button"
                onClick={handleCopyRosterImage}
                className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 hover:border-slate-700 p-2 px-3 shadow-inner rounded-xl text-[10px] font-mono font-bold text-slate-400 hover:text-white transition cursor-pointer select-none"
              >
                <Copy size={13} /> Copy Tab Image
              </button>
            </div>
          )}
          {selectedConfigId && !isOfficer && (
              <button
                type="button"
                onClick={handleCopyRosterImage}
                className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 hover:border-slate-700 p-2 px-3 shadow-inner rounded-xl text-[10px] font-mono font-bold text-slate-400 hover:text-white transition cursor-pointer select-none"
              >
                <Copy size={13} /> Copy Tab Image
              </button>
            )}
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
              <ChevronRight size={14} />
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
                  className="p-0.5 rounded text-slate-500 hover:text-slate-300 font-bold transition-colors cursor-pointer"
                  title="Collapse Panel"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest">Raid Configs</span>
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
                        <span className="text-[9px] font-mono text-slate-600 block mt-0.5">
                          {id} · {(comp.tabOrder || Object.keys(comp.tabs || {})).length} tab{(comp.tabOrder || Object.keys(comp.tabs || {})).length === 1 ? '' : 's'}
                        </span>
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
          {selectedConfigId && tabOrder.length > 0 && (
            <div className="flex items-center gap-1.5 mb-3 flex-wrap select-none border-b border-slate-900 pb-3">
              <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-slate-600 mr-1">Grid Tabs</span>
              {tabOrder.map((tabId) => {
                const tab = localTabs[tabId];
                const isActive = activeTabId === tabId;
                const isRenaming = renamingTabId === tabId;
                return (
                  <div
                    key={tabId}
                    className={`group flex items-center gap-1 rounded-lg border px-2 py-1 transition-all ${
                      isActive
                        ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    {isRenaming && isOfficer ? (
                      <input
                        autoFocus
                        type="text"
                        defaultValue={tab?.name || ''}
                        onBlur={(e) => {
                          handleRenameGridTab(tabId, e.target.value.trim());
                          setRenamingTabId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleRenameGridTab(tabId, e.target.value.trim());
                            setRenamingTabId(null);
                          }
                          if (e.key === 'Escape') setRenamingTabId(null);
                        }}
                        className="bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] font-bold text-slate-200 outline-none w-28"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSelectGridTab(tabId)}
                        onDoubleClick={() => { if (isOfficer) setRenamingTabId(tabId); }}
                        className="text-[11px] font-bold font-sans truncate max-w-[8rem] cursor-pointer"
                        title="Click to switch · Double-click to rename"
                      >
                        {tab?.name || tabId}
                      </button>
                    )}
                    {isOfficer && tabOrder.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDeleteGridTab(tabId); }}
                        className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-rose-400 transition p-0.5 cursor-pointer"
                        title="Delete Grid Tab"
                      >
                        <X size={11} />
                      </button>
                    )}
                  </div>
                );
              })}
              {isOfficer && (
                <button
                  type="button"
                  onClick={handleAddGridTab}
                  className="flex items-center gap-1 rounded-lg border border-dashed border-slate-700 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 hover:text-indigo-400 hover:border-indigo-500/50 transition cursor-pointer"
                  title="Add Grid Tab"
                >
                  <Plus size={12} /> Tab
                </button>
              )}
            </div>
          )}
          <div className="overflow-x-auto overflow-visible scrollbar-thin pr-1 flex-1">
            {selectedConfigId ? (
              <div 
                ref={gridRef}
                className="grid gap-2 pb-12 overflow-visible p-2"
                style={{ gridTemplateColumns: `repeat(${columnsCount}, minmax(130px, 1fr))` }}
              >
                {/* Banner: Grid Tab name (primary for image /myparty), config as subtitle */}
                <div 
                  className="col-span-full bg-slate-950/80 border border-slate-900 rounded-xl p-3 mb-2 flex items-center justify-center select-none shadow-sm"
                  style={{ gridColumn: '1 / -1' }}
                >
                  <div className="text-center">
                    <span className="text-[9px] font-mono font-bold tracking-widest text-slate-500 uppercase block">
                      {localTitle || 'Untitled Config'}
                    </span>
                    <h2 className="text-sm font-black tracking-wide text-indigo-400 font-sans mt-0.5 uppercase">
                      {localTabs[activeTabId]?.name || 'Main'}
                    </h2>
                  </div>
                </div>

                {/* Header Row: Customizable Party Titles */}
                {Array.from({ length: columnsCount }).map((_, cIdx) => {
                  const colNum = cIdx + 1;
                  const currentCustomName = localGridMatrix[`party_name_${colNum}`] || `Party ${colNum}`;
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

                {/* Grid Matrix Renderer */}
                {Array.from({ length: rowsCount }).map((_, rIdx) => {
                  return Array.from({ length: columnsCount }).map((_, cIdx) => {
                    const coordKey = `${cIdx + 1}-${rIdx + 1}`;
                    const slotData = localGridMatrix[coordKey] || { userId: '', roleLock: '' };

                    const popoverAlignClass = cIdx === 0 
                      ? "left-0 text-left" 
                      : cIdx === columnsCount - 1 
                        ? "right-0 text-right" 
                        : "left-1/2 -translate-x-1/2 text-left";
                    
                    const popoverVAlignClass = rIdx >= Math.max(1, rowsCount - 2) ? "bottom-full mb-2" : "top-full mt-2";

                    const allocatedUserObj = slotData.userId ? members[slotData.userId] : null;
                    const lockedJobObj = slotData.roleLock ? jobsCatalog[slotData.roleLock] : null;
                    
                    const isCellRoleLocked = !!slotData.roleLock;
                    const isPartyLeader = !!slotData.isPartyLeader;
                    const cellColorTheme = lockedJobObj?.colorTheme || '#1e293b';

                    const isAssignPopoverOpen = activePopover?.coordKey === coordKey && activePopover?.type === 'assign';
                    const isGearPopoverOpen = activePopover?.coordKey === coordKey && activePopover?.type === 'gear';
                    const trendTimeline = slotData.userId
                      ? buildMemberTrendTimeline(historySessions, slotData.userId, 8)
                      : [];
                    const isDragHovered = dragHoveredCoord === coordKey;

                    const isSearchHighlighted = !!(searchQuery.trim() && allocatedUserObj && 
                      allocatedUserObj.displayName.toLowerCase().includes(searchQuery.toLowerCase()));

                    // Track if the placed member is currently on formal leave
                    const isUserOnLeave = !!(slotData.userId && cellAttendanceMap[slotData.userId] === 'Leave');

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
                              ? 'border-indigo-500 ring-2 ring-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.35)] bg-slate-900/40 z-30'
                              : (isAssignPopoverOpen || isGearPopoverOpen 
                                  ? 'z-40 ring-2 ring-indigo-500/50 shadow-lg border-slate-800' 
                                  : (isSearchHighlighted 
                                      ? 'border-amber-500 ring-2 ring-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.3)] bg-slate-900/60 z-10 scale-[1.01]' 
                                      : (isUserOnLeave ? 'z-10 border-2' : 'border-slate-900 hover:border-slate-800 z-0')))
                          } ${isOfficer && !!slotData.userId ? 'cursor-grab active:cursor-grabbing' : ''}`}
                          style={{
                            backgroundColor: undefined, // Clears the solid overlay tile fill
                                borderColor: isSearchHighlighted || isUserOnLeave ? 'transparent' : (isCellRoleLocked ? `${cellColorTheme}30` : undefined),
                                boxShadow: isSearchHighlighted || isUserOnLeave ? undefined : (isCellRoleLocked ? `inset 0 -6px 12px ${cellColorTheme}10` : undefined),
                                backgroundImage: isUserOnLeave && !isSearchHighlighted
                                  ? 'linear-gradient(#020617, #020617), repeating-linear-gradient(45deg, #b91c1c, #b91c1c 5px, #3f0c10 5px, #3f0c10 10px)'
                                  : (isCellRoleLocked 
                                      ? `linear-gradient(to bottom, transparent 80%, ${cellColorTheme}26 100%)`
                                      : undefined),
                            backgroundOrigin: isUserOnLeave && !isSearchHighlighted ? 'border-box' : undefined,
                            backgroundClip: isUserOnLeave && !isSearchHighlighted ? 'padding-box, border-box' : undefined
                          }}
                        >
                        {/* Subtle, micro-sized text identifier positioned absolutely in the bottom left corner (Linked to hover transition) */}
                        <div className="absolute bottom-1 left-1.5 text-[5px] font-mono font-light tracking-tight text-slate-500/50 select-none pointer-events-none z-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                          P{cIdx + 1}-S{rIdx + 1}
                        </div>

                        {/* THE LOWER RIGHT INTEGRATED TOOL DECK CONSOLE */}
                        {isOfficer && (
                          <div className="absolute bottom-1 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20 bg-slate-950/60 backdrop-blur-sm rounded-lg p-0.5 border border-slate-900/60">
                            {/* Gear Icon: Pre-Assign Role Lock */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActivePopover(isGearPopoverOpen ? null : { coordKey, type: 'gear' });
                              }}
                              className={`p-1 rounded hover:bg-slate-800 transition-colors ${
                                isGearPopoverOpen ? 'text-amber-400 bg-slate-800' : 'text-slate-500 hover:text-slate-300'
                              }`}
                              title="Set Class/Role Lock"
                            >
                              <Settings size={13} />
                            </button>

                            {/* Info Icon: hover attendance reliability trend */}
                            <MemberTrendHoverTip
                              enabled={!!slotData.userId}
                              displayName={allocatedUserObj?.displayName || 'Raider'}
                              timeline={trendTimeline}
                            >
                              <button
                                type="button"
                                disabled={!slotData.userId}
                                onClick={(e) => e.stopPropagation()}
                                className="p-1 rounded hover:bg-slate-800 transition-colors disabled:opacity-20 disabled:cursor-not-allowed text-slate-500 hover:text-indigo-400"
                                title={slotData.userId ? 'Hover for attendance trend' : 'Assign a member first'}
                              >
                                <Info size={13} />
                              </button>
                            </MemberTrendHoverTip>

                            {/* Divider Separator Line */}
                            <span className="text-slate-800 font-mono text-[10px] mx-0.5 pointer-events-none select-none">|</span>

                            {/* Trash Icon: Fast Unassign Cell Slot Action */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (slotData.userId) handleBindMemberToCell(coordKey, '');
                              }}
                              disabled={!slotData.userId}
                              className="p-1 rounded hover:bg-slate-800 text-slate-600 hover:text-rose-400 transition-colors disabled:opacity-20 disabled:hover:text-slate-600 disabled:cursor-not-allowed"
                              title="Unassign Position"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}

                        {/* CELL SELECTION WORKFLOW ACTION HANDLER (Increased top padding for explicit px breathing room) */}
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
                            <RaidMemberCard 
                              allocatedUserObj={allocatedUserObj}
                              jobObj={jobsCatalog[allocatedUserObj.jobCode]}
                              currentStatus={cellAttendanceMap[slotData.userId]}
                              isVoiceActive={allocatedUserObj?.isVoiceActive ?? (cellAttendanceMap[slotData.userId] === 'Confirmed')}
                              isPartyLeader={isPartyLeader}
                            />
                          ) : (
                            <div className="h-full flex flex-col items-center justify-center space-y-1 text-slate-700 group-hover:text-slate-500 transition-colors py-2">
                              {isCellRoleLocked ? (
                                <>
                                  <img
                                    src={`/assets/icons/classes/${lockedJobObj?.iconFile || 'default.svg'}`}
                                    alt=""
                                    className="w-5 h-5 object-contain opacity-90"
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                  />
                                  <span className="text-[8px] font-bold uppercase tracking-wider text-center max-w-full truncate px-0.5 text-slate-400">
                                    {lockedJobObj?.name}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <UserPlus size={20} strokeWidth={2.2} />
                                  <span className="text-[8px] font-bold tracking-widest text-slate-400 font-sans uppercase"></span>
                                </>
                              )}
                            </div>
                          )}
                        </div>

                        {/* ================= IN-GRID CELL OVERLAY POPUPS ================= */}
                        {isGearPopoverOpen && (
                          <>
                            <div className="fixed inset-0 z-[90]" onClick={() => setActivePopover(null)} />
                            <div className={`absolute ${popoverAlignClass} ${popoverVAlignClass} bg-slate-900 border border-slate-800 p-2 rounded-xl shadow-2xl z-[100] w-56 font-sans space-y-1.5 animate-fadeIn text-left`}>
                              {/* Party Leader section */}
                              <button
                                type="button"
                                disabled={!slotData.userId}
                                onClick={() => handleSetPartyLeader(coordKey)}
                                className={`w-full px-2 py-1.5 rounded-lg text-left text-[10px] font-semibold flex items-center gap-1.5 border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                                  isPartyLeader
                                    ? 'text-red-400 bg-red-950/50 border-red-800 hover:bg-red-900/40'
                                    : 'text-slate-300 border-slate-800 hover:text-white hover:bg-slate-800'
                                }`}
                              >
                                <Flag size={11} className={`shrink-0 ${isPartyLeader ? 'text-red-500 fill-red-500' : 'text-slate-500'}`} />
                                {isPartyLeader ? 'Remove Leader' : 'Set as Leader'}
                                {isPartyLeader && <Crown size={10} className="ml-auto text-red-400" />}
                              </button>
                              <div className="text-[9px] font-mono font-bold uppercase text-slate-500 tracking-wider select-none px-1 border-b border-slate-800 pb-1 pt-0.5">Pre-Assign Job Role</div>
                              <div className="max-h-36 overflow-y-auto space-y-0.5 pr-0.5 scrollbar-thin text-left">
                                <button
                                  type="button"
                                  onClick={() => handleToggleCellRoleLock(coordKey, '')}
                                  className="w-full px-2 py-1 rounded-lg text-left text-[10px] font-medium text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer flex items-center gap-1.5"
                                >
                                  <Ban size={12} className="shrink-0 text-rose-400" /> Clear Role Lock
                                </button>
                                {Object.entries(jobsCatalog).map(([code, j]) => (
                                  <button
                                    key={code}
                                    type="button"
                                    onClick={() => handleToggleCellRoleLock(coordKey, code)}
                                    className="w-full px-2 py-1 rounded-lg text-left text-[10px] font-semibold text-slate-200 hover:bg-slate-800 cursor-pointer flex items-center justify-between gap-2"
                                  >
                                    <span className="flex items-center gap-1.5 min-w-0">
                                      <img
                                        src={`/assets/icons/classes/${j.iconFile || 'default.svg'}`}
                                        alt=""
                                        className="w-3.5 h-3.5 object-contain shrink-0"
                                        onError={(e) => { e.target.style.display = 'none'; }}
                                      />
                                      <span className="truncate">{j.name}</span>
                                    </span>
                                    {slotData.roleLock === code && <Check size={10} className="shrink-0 text-indigo-400" />}
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
                                      <option key={code} value={code} className="bg-slate-950">{j.name}</option>
                                    ))}
                                  </select>
                                </div>
                              ) : (
                                <div className="text-[9px] font-mono font-bold uppercase tracking-wider select-none px-1 border-b border-slate-800 pb-1 flex items-center justify-between" style={{ color: cellColorTheme }}>
                                  <span className="flex items-center gap-1.5 text-slate-300">
                                    <Lock size={11} className="shrink-0 text-amber-400" />
                                    Role Lock: {lockedJobObj?.name}
                                  </span>
                                </div>
                              )}

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

        {/* ================= COLUMN 3: RIGHT ROSTER PANEL ================= */}
        {rightPanelCollapsed ? (
          <div className="col-span-12 xl:col-span-1 border border-slate-900 bg-slate-950/60 rounded-2xl p-2 flex flex-col items-center shadow-md min-h-[45rem] h-auto justify-start select-none py-4">
            <button
              type="button"
              onClick={() => setRightPanelCollapsed(false)}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-indigo-400 hover:text-white transition cursor-pointer font-bold text-xs"
              title="Expand Roster Lists"
            >
              <ChevronLeft size={14} />
            </button>
            <div className="text-[9px] uppercase font-mono font-bold tracking-widest text-slate-600 mt-8 [writing-mode:vertical-lr]">ROSTER REGISTRIES</div>
          </div>
        ) : (
          <div 
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFeederPoolDropIntercept}
            className="col-span-12 xl:col-span-3 border border-slate-800 bg-slate-950/40 rounded-2xl p-3.5 flex flex-col space-y-4 shadow-md min-h-[45rem] h-auto pb-8"
          >
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
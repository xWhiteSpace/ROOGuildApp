// frontend/src/pages/MimicBookTab.jsx
import { useState, useEffect, useRef } from 'react';

const backendUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';

const ITEM_LIMIT_DEFAULTS = {
  'Puppet': 1,
  'Illu': 1,
  'Light&Dark': 3,
  'Time&Space': 5
};

export default function MimicBookTab({ user }) {
  // 🏛️ CENTRALIZED BOOLEAN RESOLVER
  // Layout reads permission variables directly without hardcoding custom role strings
  const isOfficer = user?.isOfficer === true;

  const [isAdminMode, setIsAdminMode] = useState(isOfficer); 
  const [activeStep, setActiveStep] = useState(1); 
  const [loadingPool, setLoadingPool] = useState(false);

  // --- 📜 LOOT HISTORY MODAL STATE ---
  const [isLootHistoryOpen, setIsLootHistoryOpen] = useState(false);
  const [loadingLootHistory, setLoadingLootHistory] = useState(false);
  const [lootHistoryData, setLootHistoryData] = useState([]);
  const [expandedGroups, setExpandedGroups] = useState({}); 

  // --- 🔒 DATA ARCHIVER COMMIT FIELDS ---
  const [commitEvent, setCommitEvent] = useState('GuildLeague');
  const [commitDate, setCommitDate] = useState(() => {
    const gmt8String = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" });
    const gmt8Date = new Date(gmt8String);
    return `${gmt8Date.getMonth() + 1}/${gmt8Date.getDate()}/${gmt8Date.getFullYear()}`;
  });
  const [committing, setCommittingSetting] = useState(false);

  // --- 🔄 DISCORD SYNC LOADING TRACKER ---
  const [syncingRoster, setSyncingRoster] = useState(false);

  // --- 📋 MASTER TARGET POOLS ---
  const [rankingsByItem, setRankingsByItem] = useState({ Puppet: [], Illu: [], 'Light&Dark': [], 'Time&Space': [] });
  const [requestsByItemDetails, setRequestsByItemDetails] = useState({ Puppet: {}, Illu: {}, 'Light&Dark': [], 'Time&Space': {} });
  const [masterGuildRoster, setMasterGuildRoster] = useState([]); 

  // --- PHASE 1 STATE: DYNAMIC LOOT REGISTRY ---
  const [qtyPerPage, setQtyPerPage] = useState(4);
  const [lootRows, setLootRows] = useState([
    { id: 1, itemType: 'Puppet', startPage: 1, startPos: 1, endPage: 1, endPos: 4, limit: 1 }
  ]);
  
  const [lootSummary, setLootSummary] = useState({
    Puppet: { qty: 0, limit: 1, seats: 0 }, Illu: { qty: 0, limit: 1, seats: 0 },
    'Light&Dark': { qty: 0, limit: 1, seats: 0 }, 'Time&Space': { qty: 0, limit: 1, seats: 0 }
  });
  const [validationError, setValidationError] = useState('');
  const [liveGapsWarning, setLiveGapsWarning] = useState('');

  // --- PHASE 2 STATE: UNIFIED POSITIONALLY LOCKED ITEM DROP SLOTS GRID ---
  const [activeMatrixFilter, setActiveMatrixFilter] = useState('Puppet');
  const [categoryAllocations, setCategoryAllocations] = useState({
    Puppet: { selected: [] }, Illu: { selected: [] }, 'Light&Dark': { selected: [] }, 'Time&Space': { selected: [] }
  });
  const [initialWinnersByItem, setInitialWinnersByItem] = useState({
    Puppet: [], Illu: [], 'Light&Dark': [], 'Time&Space': []
  });

  // --- 🔍 SIDEBAR TAB NAVIGATION CONTROLS ---
  const [sidebarTab, setSidebarTab] = useState('standby'); 
  const [sidebarSearch, setSidebarSearch] = useState('');
  const popoverAnchorRef = useRef(null);

  // --- Drag and Drop State Holders ---
  const [draggedItemIndex, setDraggedItemIndex] = useState(null);
  const isUserDraggingRef = useRef(false); 

  // --- PHASE 3 STATE: DISPLAY LENS CONSTRAINTS ---
  const [viewLens, setViewLens] = useState('ALL'); 
  const [searchQuery, setSearchQuery] = useState('');
  const [bookCurrentPage, setBookCurrentPage] = useState(1);
  const [generatedSlots, setGeneratedSlots] = useState([]);

  // Forces state re-check when the authenticated user profile changes
  useEffect(() => {
    setIsAdminMode(isOfficer);
  }, [user, isOfficer]);

  // --- COORDINATE SEQUENCE GAP ENGINE ---
  useEffect(() => {
    if (lootRows.length <= 1) {
      setLiveGapsWarning('');
      return;
    }
    const linearRows = lootRows.map(r => ({
      ...r,
      startLin: (Math.max(1, r.startPage) - 1) * qtyPerPage + (Math.max(1, r.startPos) - 1),
      endLin: (Math.max(1, r.endPage) - 1) * qtyPerPage + (Math.max(1, r.endPos) - 1)
    })).sort((a, b) => a.startLin - b.startLin);

    const missingBlocks = [];
    for (let i = 0; i < linearRows.length - 1; i++) {
      const currentEnd = linearRows[i].endLin;
      const nextStart = linearRows[i + 1].startLin;
      if (nextStart > currentEnd + 1) {
        const gapStartLin = currentEnd + 1;
        const gapPage = Math.floor(gapStartLin / qtyPerPage) + 1;
        const gapPos = (gapStartLin % qtyPerPage) + 1;
        missingBlocks.push(`Page ${gapPage} Slot ${gapPos}`);
      }
    }
    setLiveGapsWarning(missingBlocks.length > 0 ? `⚠️ GAP WARNING: Unallocated grid sequence boxes skipped at: ${missingBlocks.join(', ')}` : '');
  }, [lootRows, qtyPerPage]);

  const loadTrueRequestPool = async () => {
    try {
      setLoadingPool(true);
      const savedUserSession = localStorage.getItem('dynasty_raid_session');
      const customHeaders = { 'Content-Type': 'application/json' };
      if (savedUserSession) {
        customHeaders['x-user-profile'] = encodeURIComponent(savedUserSession);
      }
      const res = await fetch(`${backendUrl}/api/requests/init`, { method: 'GET', headers: customHeaders, credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        if (data.rankingsByItem) setRankingsByItem(data.rankingsByItem);
        if (data.requestsByItemDetails) setRequestsByItemDetails(data.requestsByItemDetails);
        if (data.fullRoster) setMasterGuildRoster(data.fullRoster); 
      }
    } catch (err) {
      console.error("Failed to fetch current request pool:", err);
    } finally {
      setLoadingPool(false);
    }
  };

  const handleSyncRosterFromDiscord = async () => {
    try {
      setSyncingRoster(true);
      const savedUserSession = localStorage.getItem('dynasty_raid_session');
      const customHeaders = { 'Content-Type': 'application/json' };
      if (savedUserSession) {
        customHeaders['x-user-profile'] = encodeURIComponent(savedUserSession);
      }

      const res = await fetch(`${backendUrl}/api/requests/sync-roster`, {
        method: 'POST',
        headers: customHeaders,
        credentials: 'include'
      });

      const data = await res.json();
      if (data.success) {
        alert(`🔄 SUCCESS: Realtime Roster sync complete! Updated ${data.count} active guild accounts from Discord into Firebase.`);
        loadTrueRequestPool(); 
      } else {
        alert(`❌ Sync rejected by server: ${data.error}`);
      }
    } catch (err) {
      console.error("Roster communication link failure:", err);
      alert("❌ Failed to reach the backend Discord bot route channel.");
    } finally {
      setSyncingRoster(false);
    }
  };

  const fetchLootHistoryLog = async () => {
    try {
      setLoadingLootHistory(true);
      setExpandedGroups({}); 
      const savedUserSession = localStorage.getItem('dynasty_raid_session');
      const customHeaders = { 'Content-Type': 'application/json' };
      if (savedUserSession) {
        customHeaders['x-user-profile'] = encodeURIComponent(savedUserSession);
      }
      const res = await fetch(`${backendUrl}/api/requests/loot-history`, { method: 'GET', headers: customHeaders, credentials: 'include' });
      const data = await res.json();
      if (data.success) setLootHistoryData(data.history || []);
    } catch (err) {
      console.error("Failed to extract loot history logs:", err);
    } finally {
      setLoadingLootHistory(false);
    }
  };

  const fetchActiveSessionFromBackend = async (isInitialMount = false) => {
    if (isUserDraggingRef.current) return; 
    try {
      const savedUserSession = localStorage.getItem('dynasty_raid_session');
      const customHeaders = { 'Content-Type': 'application/json' };
      if (savedUserSession) {
        customHeaders['x-user-profile'] = encodeURIComponent(savedUserSession);
      }
      const res = await fetch(`${backendUrl}/api/requests/active-session`, { method: 'GET', headers: customHeaders, credentials: 'include' });
      const data = await res.json();
      if (data.success && data.session) {
        const s = data.session;
        if (s.activeStep !== undefined) setActiveStep(s.activeStep);
        if (s.lootRows) setLootRows(s.lootRows);
        if (s.lootSummary) setLootSummary(s.lootSummary);
        if (s.categoryAllocations) setCategoryAllocations(s.categoryAllocations);
        if (s.initialWinnersByItem) setInitialWinnersByItem(s.initialWinnersByItem);
        if (s.generatedSlots) setGeneratedSlots(s.generatedSlots);
        if (s.activeMatrixFilter) setActiveMatrixFilter(s.activeMatrixFilter);
        if (s.sidebarTab) setSidebarTab(s.sidebarTab);
      }
    } catch (err) {
      if (isInitialMount) console.error("Could not complete initial sandbox setup sync:", err);
    }
  };

  const pushActiveSessionToBackend = async (updatedWorkspaceSnapshot) => {
    if (!isOfficer) return;
    try {
      const savedUserSession = localStorage.getItem('dynasty_raid_session');
      const customHeaders = { 'Content-Type': 'application/json' };
      if (savedUserSession) {
        customHeaders['x-user-profile'] = encodeURIComponent(savedUserSession);
      }
      const res = await fetch(`${backendUrl}/api/requests/update-session`, {
        method: 'POST',
        headers: customHeaders,
        body: JSON.stringify({ session: updatedWorkspaceSnapshot }),
        credentials: 'include'
      });
      if (!res.ok) {
        fetchActiveSessionFromBackend(false); 
      }
    } catch (err) {
      console.error("Backend packet transmission timeout:", err);
    }
  };

  const saveWorkspaceState = (updatedStateFields) => {
    if (!isOfficer) return;
    const fullSnapshot = {
      activeStep,
      lootRows,
      lootSummary,
      categoryAllocations,
      initialWinnersByItem,
      generatedSlots,
      activeMatrixFilter,
      sidebarTab,
      ...updatedStateFields
    };
    
    if (updatedStateFields.activeStep !== undefined) setActiveStep(updatedStateFields.activeStep);
    if (updatedStateFields.lootRows) setLootRows(updatedStateFields.lootRows);
    if (updatedStateFields.lootSummary) setLootSummary(updatedStateFields.lootSummary);
    if (updatedStateFields.categoryAllocations) setCategoryAllocations(updatedStateFields.categoryAllocations);
    if (updatedStateFields.initialWinnersByItem) setInitialWinnersByItem(updatedStateFields.initialWinnersByItem);
    if (updatedStateFields.generatedSlots) setGeneratedSlots(updatedStateFields.generatedSlots);
    if (updatedStateFields.activeMatrixFilter) setActiveMatrixFilter(updatedStateFields.activeMatrixFilter);
    if (updatedStateFields.sidebarTab) setSidebarTab(updatedStateFields.sidebarTab);

    pushActiveSessionToBackend(fullSnapshot);
  };

  useEffect(() => {
    loadTrueRequestPool();
    fetchActiveSessionFromBackend(true);

    const pollerInterval = setInterval(() => {
      fetchActiveSessionFromBackend(false);
    }, 3500);

    return () => clearInterval(pollerInterval);
  }, [user]);

  const handleAddLootRow = () => {
    if (!isAdminMode || !isOfficer) return;
    const nextId = lootRows.length > 0 ? Math.max(...lootRows.map(r => r.id)) + 1 : 1;
    let derivedStartPage = 1;
    let derivedStartPos = 1;

    if (lootRows.length > 0) {
      const lastRow = lootRows[lootRows.length - 1];
      let calcPos = lastRow.endPos + 1;
      let calcPage = lastRow.endPage;
      if (calcPos > qtyPerPage) {
        calcPos = 1;
        calcPage += 1;
      }
      derivedStartPage = calcPage;
      derivedStartPos = calcPos;
    }

    const defaultType = 'Puppet';
    const updatedRows = [
      ...lootRows, 
      { id: nextId, itemType: defaultType, startPage: derivedStartPage, startPos: derivedStartPos, endPage: derivedStartPage, endPos: derivedStartPos, limit: ITEM_LIMIT_DEFAULTS[defaultType] }
    ];
    saveWorkspaceState({ lootRows: updatedRows });
  };

  const handleRemoveLootRow = (id) => {
    if (!isAdminMode || !isOfficer) return;
    const updatedRows = lootRows.filter(r => r.id !== id);
    saveWorkspaceState({ lootRows: updatedRows });
  };

  const handleUpdateLootRow = (id, key, val) => {
    if (!isAdminMode || !isOfficer) return;
    const updatedRows = lootRows.map(r => {
      if (r.id !== id) return r;
      let updatedFields = { [key]: val };

      if (key === 'startPos' || key === 'endPos') {
        const parsedVal = parseInt(val, 10) || 1;
        updatedFields[key] = Math.min(Math.max(1, parsedVal), qtyPerPage);
      }
      if (key === 'startPage' || key === 'endPage') {
        const parsedPage = parseInt(val, 10) || 1;
        updatedFields[key] = Math.max(1, parsedPage);
      }
      if (key === 'itemType') {
        updatedFields.limit = ITEM_LIMIT_DEFAULTS[val] || 1;
      }
      return { ...r, ...updatedFields };
    });
    saveWorkspaceState({ lootRows: updatedRows });
  };

  const handleCheckAndRegisterLoot = () => {
    if (!isAdminMode || !isOfficer) return;
    setValidationError('');
    const calculatedSummary = {
      Puppet: { qty: 0, limit: 1, seats: 0 }, Illu: { qty: 0, limit: 1, seats: 0 },
      'Light&Dark': { qty: 0, limit: 1, seats: 0 }, 'Time&Space': { qty: 0, limit: 1, seats: 0 }
    };
    
    const sortedRows = [...lootRows].sort((a, b) => a.startPage - b.startPage || a.startPos - b.startPos);

    for (let i = 0; i < sortedRows.length; i++) {
      const row = sortedRows[i];
      const startLinear = (row.startPage * qtyPerPage) + row.startPos;
      const endLinear = (row.endPage * qtyPerPage) + row.endPos;

      if (endLinear < startLinear) {
        setValidationError(`Row ${i + 1} Error: End position cannot precede start position.`);
        return;
      }
      if (row.limit < 1) {
        setValidationError(`Row ${i + 1} Error: Limit must be at least 1.`);
        return;
      }
      if (i > 0) {
        const prevRow = sortedRows[i - 1];
        const prevEndLinear = (prevRow.endPage * qtyPerPage) + prevRow.endPos;
        if (startLinear <= prevEndLinear) {
          setValidationError(`Collision! Row ${i + 1} overlaps coordinates belonging to a previous item line.`);
          return;
        }
      }

      const qty = ((row.endPage - row.startPage) * qtyPerPage) + (row.endPos - row.startPos) + 1;
      calculatedSummary[row.itemType].qty += qty;
      calculatedSummary[row.itemType].limit = row.limit;
    }

    Object.keys(calculatedSummary).forEach(key => {
      const item = calculatedSummary[key];
      item.seats = Math.floor(item.qty / item.limit); 
    });

    const initialAllocations = {};
    const initialWinnersTrack = { Puppet: [], Illu: [], 'Light&Dark': [], 'Time&Space': [] };
    Object.keys(calculatedSummary).forEach(category => {
      const totalDropInventoryCount = calculatedSummary[category].qty;
      const rowLimitValue = calculatedSummary[category].limit;
      const priorityApplicants = rankingsByItem[category] || [];
      const detailsMap = requestsByItemDetails[category] || {};

      const flatStaticBoxArray = Array(totalDropInventoryCount).fill("");
      let globalBoxCursor = 0;

      for (let p = 0; p < priorityApplicants.length; p++) {
        if (globalBoxCursor >= totalDropInventoryCount) break;

        const pName = priorityApplicants[p];
        const requestedQuantity = detailsMap[pName]?.quantity || 1;
        const allowedBoxSpan = Math.min(requestedQuantity, rowLimitValue);

        let allocatedSome = false;
        for (let b = 0; b < allowedBoxSpan; b++) {
          if (globalBoxCursor < totalDropInventoryCount) {
            flatStaticBoxArray[globalBoxCursor] = pName;
            globalBoxCursor++;
            allocatedSome = true;
          }
        }
        if (allocatedSome) {
          initialWinnersTrack[category].push(pName);
        }
      }

      initialAllocations[category] = { selected: flatStaticBoxArray };
    });

    const firstActiveCategory = Object.keys(calculatedSummary).find(k => calculatedSummary[k].qty > 0) || 'Puppet';

    saveWorkspaceState({
      activeStep: 2,
      lootSummary: calculatedSummary,
      categoryAllocations: initialAllocations,
      initialWinnersByItem: initialWinnersTrack,
      activeMatrixFilter: firstActiveCategory,
      sidebarTab: 'standby'
    });
    setSidebarSearch('');
  };

  const handleDropBidderBoxSlot = (slotIndex) => {
    if (!isAdminMode || !isOfficer) return;
    const currentData = categoryAllocations[activeMatrixFilter] || { selected: [] };
    const updatedSelected = [...currentData.selected];
    updatedSelected[slotIndex] = ""; 

    saveWorkspaceState({
      categoryAllocations: {
        ...categoryAllocations,
        [activeMatrixFilter]: { selected: updatedSelected }
      }
    });
  };

  const handlePromoteBidderToTargetSlotIndex = (playerName, slotIndex) => {
    if (!isAdminMode || !isOfficer) return;
    const currentData = categoryAllocations[activeMatrixFilter] || { selected: [] };
    const updatedSelected = [...currentData.selected];
    updatedSelected[slotIndex] = playerName;

    saveWorkspaceState({
      categoryAllocations: {
        ...categoryAllocations,
        [activeMatrixFilter]: { selected: updatedSelected }
      }
    });
  };

  const handleRowDragStart = (e, index) => {
    if (!isOfficer) return e.preventDefault();
    setDraggedItemIndex(index);
    isUserDraggingRef.current = true; 
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleRowDragOver = (e) => e.preventDefault();

  const handleRowDrop = (e, targetIndex) => {
    isUserDraggingRef.current = false;
    if (!isAdminMode || !isOfficer || draggedItemIndex === null || draggedItemIndex === targetIndex) return;
    const currentData = categoryAllocations[activeMatrixFilter] || { selected: [] };
    const updatedSelected = [...currentData.selected];
    
    const temp = updatedSelected[targetIndex];
    updatedSelected[targetIndex] = updatedSelected[draggedItemIndex];
    updatedSelected[draggedItemIndex] = temp;

    saveWorkspaceState({
      categoryAllocations: {
        ...categoryAllocations,
        [activeMatrixFilter]: { selected: updatedSelected }
      }
    });
    setDraggedItemIndex(null);
  };

  const handleOriginalMatrixAssembly = () => {
    if (!isAdminMode || !isOfficer) return;
    const categorySequenceOrder = ['Puppet', 'Illu', 'Light&Dark', 'Time&Space'];
    let currentVirtualPage = 1;
    let currentVirtualSlot = 1;
    const matrixSlots = [];
    
    categorySequenceOrder.forEach(category => {
      const itemsInfo = lootSummary[category];
      if (!itemsInfo || itemsInfo.qty === 0) return;

      const flatBoxArray = categoryAllocations[category]?.selected || [];
      
      flatBoxArray.forEach(playerName => {
        matrixSlots.push({
          name: playerName === "" ? '[⚠️ EXTRA UNALLOCATED SLOT]' : playerName,
          itemType: category,
          page: currentVirtualPage,
          slot: currentVirtualSlot,
          status: playerName === "" ? 'NotSelected' : 'Selected'
        });
        
        currentVirtualSlot++;
        if (currentVirtualSlot > qtyPerPage) {
          currentVirtualSlot = 1;
          currentVirtualPage++;
        }
      });
    });

    setBookCurrentPage(1);
    saveWorkspaceState({
      generatedSlots: matrixSlots,
      activeStep: 3
    });
  };

  const handleCommitSessionAndFlash = async () => {
    if (!commitDate.trim() || !isOfficer) return alert("Operation locked or criteria missing.");
    try {
      setCommittingSetting(true);
      const savedUserSession = localStorage.getItem('dynasty_raid_session');
      const customHeaders = { 'Content-Type': 'application/json' };
      if (savedUserSession) customHeaders['x-user-profile'] = encodeURIComponent(savedUserSession);

      const processedAllocations = {};
      Object.keys(categoryAllocations).forEach(cat => {
        const boxEntries = categoryAllocations[cat].selected || [];
        const verifiedWinnersList = boxEntries.filter(name => name !== "");
        
        const initialWinnersList = initialWinnersByItem[cat] || [];
        const absentList = initialWinnersList.filter(name => !verifiedWinnersList.includes(name));

        const masterList = rankingsByItem[cat] || [];
        const nonWinners = masterList.filter(n => !verifiedWinnersList.includes(n) && !absentList.includes(n));
        
        const uniqueWinners = [...new Set(verifiedWinnersList)];
        const selectedPayload = uniqueWinners.map(name => ({
          name,
          slots: verifiedWinnersList.filter(n => n === name).length
        }));

        processedAllocations[cat] = {
          selected: selectedPayload,
          absent: absentList,
          notSelected: nonWinners
        };
      });

      const res = await fetch(`${backendUrl}/api/requests/commit-session`, {
        method: 'POST',
        headers: customHeaders,
        body: JSON.stringify({ event: commitEvent, date: commitDate, allocations: processedAllocations, summary: lootSummary }),
        credentials: 'include'
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Server validation lockout executed.");
      }

      const data = await res.json();
      if (data.success) {
        alert("💥 SUCCESS: Raid records written to ledger repository! Server staging sandbox cleared.");
        
        setActiveStep(1);
        setBookCurrentPage(1);
        setLootRows([{ id: 1, itemType: 'Puppet', startPage: 1, startPos: 1, endPage: 1, endPos: 4, limit: 1 }]);
        setLootSummary({
          Puppet: { qty: 0, limit: 1, seats: 0 }, Illu: { qty: 0, limit: 1, seats: 0 },
          'Light&Dark': { qty: 0, limit: 1, seats: 0 }, 'Time&Space': { qty: 0, limit: 1, seats: 0 }
        });
        setCategoryAllocations({
          Puppet: { selected: [] }, Illu: { selected: [] }, 'Light&Dark': { selected: [] }, 'Time&Space': { selected: [] }
        });
        setGeneratedSlots([]);
        loadTrueRequestPool(); 
      }
    } catch (err) {
      alert(`❌ Commit execution blocked: ${err.message}`);
    } finally {
      setCommittingSetting(false);
    }
  };

  const handleDownloadLootHistoryCSV = () => {
    if (lootHistoryData.length === 0) return;
    const csvHeaders = ["Date", "Event", "Item", "Qty", "Max", "Seats"];
    const csvRows = lootHistoryData.map(row => [`"${row.date}"`, `"${row.event}"`, `"${row.item}"`, row.quantity, row.max, row.mem]);
    const csvContent = [csvHeaders.join(","), ...csvRows.map(e => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `LootHistory_Spreadsheet_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggleAccordionGroup = (groupKey) => {
    setExpandedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  const getGroupedHistoryTimeline = () => {
    const map = {};
    lootHistoryData.forEach(row => {
      const key = `${row.date}_${row.event}`;
      if (!map[key]) {
        map[key] = { date: row.date, event: row.event, records: [] };
      }
      map[key].records.push(row);
    });
    return Object.values(map).sort((a, b) => new Date(b.date) - new Date(a.date));
  };

  const getItemStyleProfile = (itemType) => {
    switch (itemType) {
      case 'Puppet': return 'text-violet-400 border-violet-500/30 bg-violet-950/20 shadow-[0_0_15px_rgba(139,92,246,0.1)]';
      case 'Illu': return 'text-yellow-400 border-yellow-500/30 bg-yellow-950/10 shadow-[0_0_15px_rgba(234,179,8,0.1)]';
      case 'Light&Dark': return 'text-slate-100 border-slate-700 bg-slate-900/40 shadow-[0_0_15px_rgba(255,255,255,0.05)]';
      case 'Time&Space': return 'text-red-500 border-red-950 bg-black/60 border-l-4 border-l-red-600';
      default: return 'text-slate-400 border-slate-800 bg-slate-900/50';
    }
  };

  const currentUserName = user?.displayName || user?.username || '';
  const pageSlotsToRender = Array.from({ length: qtyPerPage }, (_, i) => {
    const slotIndex = i + 1;
    return generatedSlots.find(s => s.page === bookCurrentPage && s.slot === slotIndex) || null;
  });
  const totalPagesCount = generatedSlots.length > 0 ? Math.ceil(generatedSlots.length / qtyPerPage) : 1;

  const currentActiveSelections = categoryAllocations[activeMatrixFilter] || { selected: [] };
  
  const activeStandbyPoolList = (rankingsByItem[activeMatrixFilter] || []).filter(name => {
    const totalUserRequestedVolume = requestsByItemDetails[activeMatrixFilter]?.[name]?.quantity || 1;
    const currentAllocatedVolumeAcrossGrid = (currentActiveSelections.selected || []).filter(n => n === name).length;
    return currentAllocatedVolumeAcrossGrid < totalUserRequestedVolume; 
  });

  const sidebarFilteredRosterList = masterGuildRoster.filter(name => {
    const maxRowLimit = ITEM_LIMIT_DEFAULTS[activeMatrixFilter] || 1;
    const currentAllocatedVolumeAcrossGrid = (currentActiveSelections.selected || []).filter(n => n === name).length;
    return name.toLowerCase().includes(sidebarSearch.toLowerCase()) && currentAllocatedVolumeAcrossGrid < maxRowLimit;
  });

  const totalCategoryDropQuantity = lootSummary[activeMatrixFilter]?.qty || 0;
  const currentCategoryAllocatedQuantity = (currentActiveSelections.selected || []).filter(n => n !== "").length;

  return (
    <div className="space-y-4 text-slate-100 bg-slate-950 min-h-screen p-4 sm:p-6 select-none font-sans relative">
      
      {/* BRAND MONITOR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white uppercase">Member-Item Request Allocation Preview</h1>
          <p className="text-xs text-slate-400 mt-1">Digital Twin Pre-Raid Coordination Grid & Ledger Desk</p>
        </div>
        <div className="flex items-center gap-3">
          {isOfficer && (
            <button
              onClick={handleSyncRosterFromDiscord}
              disabled={syncingRoster}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold border transition-all shadow ${
                syncingRoster 
                  ? 'bg-slate-900 border-slate-800 text-slate-500 animate-pulse' 
                  : 'border-indigo-500/40 bg-indigo-950/20 text-indigo-400 hover:bg-indigo-600 hover:text-white'
              }`}
            >
              {syncingRoster ? "⏳ Syncing Discord Members..." : "🔄 Sync Discord Roster"}
            </button>
          )}

          <button
            onClick={() => { fetchLootHistoryLog(); setIsLootHistoryOpen(true); }}
            className="px-4 py-1.5 rounded-xl text-xs font-bold border border-slate-700 bg-slate-900 text-slate-300 hover:text-white transition-all shadow"
          >
            📋 View Loot History
          </button>
          
          {isOfficer && (
            <button 
              onClick={() => setIsAdminMode(!isAdminMode)}
              className={`px-3 py-1.5 rounded-xl text-[10px] uppercase font-black tracking-wider transition border ${
                isAdminMode ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}
            >
              🛡️ Officer Desk Override: {isAdminMode ? 'ENABLED' : 'DISABLED'}
            </button>
          )}
        </div>
      </div>

      {/* --- ADMINISTRATIVE OFFICER PANEL OVERRIDES --- */}
      {isAdminMode && isOfficer && (
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 shadow-xl space-y-4" ref={popoverAnchorRef}>
          
          <div className="flex items-center justify-between gap-2 max-w-3xl mx-auto text-center text-xs font-bold border-b border-slate-800/60 pb-3">
            <div className={`flex-1 py-1 rounded-lg transition-all ${activeStep === 1 ? 'bg-violet-600 text-white shadow-md' : 'text-slate-500'}`}>1. Loot Registry & Math</div>
            <div className="text-slate-700">➔</div>
            <div className={`flex-1 py-1 rounded-lg transition-all ${activeStep === 2 ? 'bg-violet-600 text-white shadow-md' : 'text-slate-500'}`}>2. Allocation Selection</div>
            <div className="text-slate-700">➔</div>
            <div className={`flex-1 py-1 rounded-lg transition-all ${activeStep === 3 ? 'bg-violet-600 text-white shadow-md' : 'text-slate-500'}`}>3. Mimic Preview</div>
            <div className="text-slate-700">➔</div>
            <div className={`flex-1 py-1 rounded-lg transition-all ${activeStep === 4 ? 'bg-violet-600 text-white shadow-md' : 'text-slate-500'}`}>4. Commit Archive</div>
          </div>

          {/* STEP 1 WORKSPACE */}
          {activeStep === 1 && (
            <div className="space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-slate-300">Register Dropped Quantities & Set Selection Constraints:</div>
                <div className="flex items-center gap-3">
                  {loadingPool && <span className="text-[10px] text-amber-400 animate-pulse mr-2">Syncing with Request List...</span>}
                  <label className="text-xs text-slate-400 font-semibold">Slots Per Game Page:</label>
                  <input 
                    type="number" 
                    value={qtyPerPage} 
                    onChange={(e) => setQtyPerPage(Math.max(1, parseInt(e.target.value) || 4))}
                    className="w-14 bg-slate-950 border border-slate-800 rounded px-2 py-0.5 font-mono text-center text-xs text-amber-400 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>

              {validationError && (
                <div className="bg-rose-950/30 border border-rose-500/30 text-rose-400 text-xs p-3 rounded-xl font-medium animate-shake">⚠️ {validationError}</div>
              )}

              {liveGapsWarning && (
                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs p-3 rounded-xl font-mono tracking-tight shadow-md">{liveGapsWarning}</div>
              )}

              <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950/40">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900/60 border-b border-slate-800 text-slate-400 uppercase font-black tracking-wider text-[10px]">
                      <th className="p-3">Dropped Item Category</th>
                      <th className="p-3 text-center">Start Page</th>
                      <th className="p-3 text-center">Start Pos</th>
                      <th className="p-3 text-center">End Page</th>
                      <th className="p-3 text-center">End Pos</th>
                      <th className="p-3 text-center">Bid/Claim Limit</th>
                      <th className="p-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {lootRows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-900/20 transition-all">
                        <td className="p-2">
                          <select 
                            value={row.itemType} 
                            onChange={(e) => handleUpdateLootRow(row.id, 'itemType', e.target.value)}
                            className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs font-sans text-slate-200 outline-none w-44 focus:border-violet-500"
                          >
                            <option value="Puppet">🟣 Puppet Scroll</option>
                            <option value="Illu">⚡ Illusion Scroll</option>
                            <option value="Light&Dark">⚪ Light & Dark Scroll</option>
                            <option value="Time&Space">🩸 Time & Space Scroll</option>
                          </select>
                        </td>
                        
                        <td className="p-2 text-center">
                          <div className="inline-flex items-center gap-1 bg-slate-950 p-0.5 border border-slate-800 rounded">
                            <button onClick={() => handleUpdateLootRow(row.id, 'startPage', Math.max(1, row.startPage - 1))} className="px-1.5 py-0.5 text-slate-500 hover:text-white font-sans text-[10px] bg-slate-900 rounded font-bold">-</button>
                            <input type="number" value={row.startPage} onChange={(e) => handleUpdateLootRow(row.id, 'startPage', e.target.value)} className="w-10 bg-transparent text-center text-slate-300 outline-none font-mono text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"/>
                            <button onClick={() => handleUpdateLootRow(row.id, 'startPage', row.startPage + 1)} className="px-1.5 py-0.5 text-slate-500 hover:text-white font-sans text-[10px] bg-slate-900 rounded font-bold">+</button>
                          </div>
                        </td>

                        <td className="p-2 text-center">
                          <div className="inline-flex items-center gap-1 bg-slate-950 p-0.5 border border-slate-800 rounded">
                            <button onClick={() => handleUpdateLootRow(row.id, 'startPos', Math.max(1, row.startPos - 1))} className="px-1.5 py-0.5 text-slate-500 hover:text-white font-sans text-[10px] bg-slate-900 rounded font-bold">-</button>
                            <input type="number" value={row.startPos} onChange={(e) => handleUpdateLootRow(row.id, 'startPos', e.target.value)} className="w-10 bg-transparent text-center text-amber-500 font-bold outline-none font-mono text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"/>
                            <button onClick={() => handleUpdateLootRow(row.id, 'startPos', row.startPos + 1)} className="px-1.5 py-0.5 text-slate-500 hover:text-white font-sans text-[10px] bg-slate-900 rounded font-bold">+</button>
                          </div>
                        </td>

                        <td className="p-2 text-center">
                          <div className="inline-flex items-center gap-1 bg-slate-950 p-0.5 border border-slate-800 rounded">
                            <button onClick={() => handleUpdateLootRow(row.id, 'endPage', Math.max(1, row.endPage - 1))} className="px-1.5 py-0.5 text-slate-500 hover:text-white font-sans text-[10px] bg-slate-900 rounded font-bold">-</button>
                            <input type="number" value={row.endPage} onChange={(e) => handleUpdateLootRow(row.id, 'endPage', e.target.value)} className="w-10 bg-transparent text-center text-slate-300 outline-none font-mono text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"/>
                            <button onClick={() => handleUpdateLootRow(row.id, 'endPage', row.endPage + 1)} className="px-1.5 py-0.5 text-slate-500 hover:text-white font-sans text-[10px] bg-slate-900 rounded font-bold">+</button>
                          </div>
                        </td>

                        <td className="p-2 text-center">
                          <div className="inline-flex items-center gap-1 bg-slate-950 p-0.5 border border-slate-800 rounded">
                            <button onClick={() => handleUpdateLootRow(row.id, 'endPos', Math.max(1, row.endPos - 1))} className="px-1.5 py-0.5 text-slate-500 hover:text-white font-sans text-[10px] bg-slate-900 rounded font-bold">-</button>
                            <input type="number" value={row.endPos} onChange={(e) => handleUpdateLootRow(row.id, 'endPos', e.target.value)} className="w-10 bg-transparent text-center text-amber-500 font-bold outline-none font-mono text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"/>
                            <button onClick={() => handleUpdateLootRow(row.id, 'endPos', row.endPos + 1)} className="px-1.5 py-0.5 text-slate-500 hover:text-white font-sans text-[10px] bg-slate-900 rounded font-bold">+</button>
                          </div>
                        </td>

                        <td className="p-2 text-center">
                          <div className="inline-flex items-center gap-1 bg-slate-950 p-0.5 border border-slate-800 rounded">
                            <button onClick={() => handleUpdateLootRow(row.id, 'limit', Math.max(1, row.limit - 1))} className="px-1.5 py-0.5 text-slate-500 hover:text-white font-sans text-[10px] bg-slate-900 rounded font-bold">-</button>
                            <input type="number" value={row.limit} onChange={(e) => handleUpdateLootRow(row.id, 'limit', e.target.value)} className="w-10 bg-transparent text-center text-white font-black outline-none font-mono text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"/>
                            <button onClick={() => handleUpdateLootRow(row.id, 'limit', row.limit + 1)} className="px-1.5 py-0.5 text-slate-500 hover:text-white font-sans text-[10px] bg-slate-900 rounded font-bold">+</button>
                          </div>
                        </td>

                        <td className="p-2 text-center">
                          <button onClick={() => handleRemoveLootRow(row.id)} className="text-slate-600 hover:text-rose-400 p-1 font-sans transition">🗑️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between items-center pt-2">
                <button onClick={handleAddLootRow} className="px-4 py-1.5 rounded-xl border border-slate-700 hover:border-slate-500 bg-slate-900 font-bold text-xs transition">+ AUTO-CHAIN NEXT BOX ➕</button>
                <button onClick={handleCheckAndRegisterLoot} className="px-6 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs tracking-wide shadow-lg transition">RUN ELIGIBILITY ENGINE ➔</button>
              </div>
            </div>
          )}

          {/* STEP 2 WORKSPACE */}
          {activeStep === 2 && (
            <div className="space-y-4 animate-fadeIn relative">
              
              <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                {Object.keys(lootSummary).map((category) => {
                  const dropTotalQty = lootSummary[category]?.qty || 0;
                  const currentAllocatedSum = (categoryAllocations[category]?.selected || []).filter(n => n !== "").length;
                  return (
                    <div key={category} className={`p-2 rounded-lg border bg-slate-900/40 cursor-pointer transition ${activeMatrixFilter === category ? 'ring-2 ring-violet-500 border-transparent bg-slate-900' : 'border-slate-800'}`} onClick={() => { saveWorkspaceState({ activeMatrixFilter: category }); }}>
                      <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">{category} Distributed</div>
                      <div className="text-lg font-black text-white mt-1 font-mono">{currentAllocatedSum} / {dropTotalQty}</div>
                      <div className="text-[9px] text-slate-500 mt-0.5 font-sans">(Max Item Limit: {lootSummary[category]?.limit || 1})</div>
                    </div>
                  );
                })}
              </div>

              <div className="text-xs font-bold text-slate-400 flex items-center gap-2">
                <span>Active Target Category Pool:</span>
                <span className={`px-2 py-0.5 rounded border text-[11px] font-black uppercase ${getItemStyleProfile(activeMatrixFilter)}`}>{activeMatrixFilter} Matrix</span>
                <span className="text-slate-500 font-mono text-[10px]"> Roster Status: {currentCategoryAllocatedQuantity} / {totalCategoryDropQuantity} Items Allocated</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                
                {/* LEFT ALLOCATION SLOT DROP ZONES */}
                <div className="md:col-span-2 border border-slate-800 rounded-xl p-3 bg-slate-950/40 space-y-2">
                  <div className="text-xs font-black uppercase text-emerald-400 mb-2 flex items-center justify-between">
                    <span>✨ Allocation Box Matrix (Drag roster card here to overwrite/fill)</span>
                    <span className="font-mono text-[10px] bg-slate-900 px-2 py-0.5 rounded text-slate-400">Positionally Shift-Proof</span>
                  </div>

                  <div className="grid grid-cols-1 gap-1.5 max-h-80 overflow-y-auto pr-1">
                    {(currentActiveSelections.selected || []).map((name, i) => {
                      if (name === "") {
                        return (
                          <div 
                            key={i}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              const sourceType = e.dataTransfer.getData("sourceType");
                              if (sourceType === "rosterCard") {
                                const droppedPlayerName = e.dataTransfer.getData("text/plain");
                                if (droppedPlayerName) handlePromoteBidderToTargetSlotIndex(droppedPlayerName, i);
                              }
                            }}
                            className="p-2 px-3 rounded-xl border-2 border-dashed border-slate-800 bg-slate-950/20 text-xs font-mono text-slate-600 hover:bg-slate-900/40 hover:border-indigo-500/30 transition flex items-center justify-between min-h-[44px]"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-slate-500 text-[10px] font-bold w-4">#{i + 1}</span>
                              <span className="font-sans text-[10px] font-medium text-slate-500">[ 📥 Drop Roster Card Here to Assign Member ]</span>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div 
                          key={i}
                          draggable="true"
                          onDragStart={(e) => handleRowDragStart(e, i)}
                          onDragOver={handleRowDragOver}
                          onDrop={(e) => {
                            e.preventDefault();
                            const sourceType = e.dataTransfer.getData("sourceType");
                            if (sourceType === "rosterCard") {
                              const droppedPlayerName = e.dataTransfer.getData("text/plain");
                              if (droppedPlayerName) handlePromoteBidderToTargetSlotIndex(droppedPlayerName, i);
                            } else {
                              handleRowDrop(e, i);
                            }
                          }}
                          className="p-2 px-3 rounded-xl border border-slate-800 bg-slate-900/60 flex items-center justify-between min-h-[44px] transition hover:border-slate-700 group cursor-grab active:cursor-grabbing font-mono"
                        >
                          <div className="flex items-center gap-3 truncate">
                            <span className="text-slate-500 text-[10px] font-bold w-4">#{i + 1}</span>
                            <span className="text-slate-400">☰</span>
                            <div className="text-slate-200 font-bold truncate text-xs font-sans">{name}</div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-[9px] text-slate-500 font-bold bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">1pc</span>
                            <button 
                              onClick={() => handleDropBidderBoxSlot(i)} 
                              className="text-rose-400 font-sans text-[10px] hover:text-rose-300 transition"
                            >
                              Remove ✖
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* RIGHT ROSTER SIDEBAR CONTROL MATRIX */}
                <div className="border border-slate-800 rounded-xl p-3 bg-slate-950/40 flex flex-col space-y-3">
                  
                  {/* SIDE PANEL TABS */}
                  <div className="flex gap-1 bg-slate-950 p-1 border border-slate-800 rounded-xl shrink-0">
                    <button 
                      onClick={() => saveWorkspaceState({ sidebarTab: 'standby' })}
                      className={`flex-1 py-1.5 rounded-lg text-[10px] font-black transition uppercase ${sidebarTab === 'standby' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:bg-slate-900'}`}
                    >
                      💤 Standby Queue ({activeStandbyPoolList.length})
                    </button>
                    <button 
                      onClick={() => saveWorkspaceState({ sidebarTab: 'roster' })}
                      className={`flex-1 py-1.5 rounded-lg text-[10px] font-black transition uppercase ${sidebarTab === 'roster' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:bg-slate-900'}`}
                    >
                      🌐 Full Guild Roster
                    </button>
                  </div>

                  {/* SPOTLIGHT FILTER INPUT FOR MASTER ROSTER */}
                  {sidebarTab === 'roster' && (
                    <div className="space-y-2 shrink-0">
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={sidebarSearch}
                          onChange={(e) => setSidebarSearch(e.target.value)}
                          placeholder="🔍 Filter character profile..."
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 font-medium placeholder-slate-600 outline-none focus:border-slate-700 font-sans"
                        />
                        <button
                          onClick={handleSyncRosterFromDiscord}
                          disabled={syncingRoster}
                          className="px-2.5 rounded-xl border border-slate-700 bg-slate-950 text-slate-400 hover:text-white text-xs whitespace-nowrap transition disabled:opacity-20 font-sans font-bold"
                        >
                          {syncingRoster ? "⏳ Sync..." : "🔄 Sync"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* CHRONOLOGICAL SCROLLABLE DRAG-SOURCE LIST */}
                  <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1 scrollbar-thin">
                    {sidebarTab === 'standby' ? (
                      activeStandbyPoolList.length === 0 ? (
                        <div className="text-[11px] text-slate-600 italic text-center py-6 font-sans">No remaining standby applicants in item filter.</div>
                      ) : (
                        activeStandbyPoolList.map((name, i) => {
                          const reqQty = requestsByItemDetails[activeMatrixFilter]?.[name]?.quantity || 1;
                          const runningAllocated = (currentActiveSelections.selected || []).filter(n => n === name).length;
                          return (
                            <div 
                              key={i} 
                              draggable="true"
                              onDragStart={(e) => {
                                e.dataTransfer.setData("text/plain", name);
                                e.dataTransfer.setData("sourceType", "rosterCard");
                                e.dataTransfer.effectAllowed = "copy";
                                isUserDraggingRef.current = true;
                              }}
                              onDragEnd={() => { isUserDraggingRef.current = false; }}
                              className="flex items-center justify-between p-2 px-3 rounded-xl border border-slate-800/60 bg-slate-900/30 text-xs font-mono cursor-grab active:cursor-grabbing hover:border-slate-700 hover:bg-slate-900/50 transition shadow-inner select-none"
                            >
                              <div className="flex items-center gap-2 truncate">
                                <span className="text-slate-600 text-[10px]">⋮⋮</span>
                                <span className="truncate text-slate-300 font-sans font-semibold text-xs">{name}</span>
                              </div>
                              <span className="text-slate-500 text-[9px] font-sans font-black shrink-0 bg-slate-950 border border-slate-800 rounded px-1">Rank #{i+1} ({runningAllocated}/{reqQty})</span>
                            </div>
                          );
                        })
                      )
                    ) : (
                      sidebarFilteredRosterList.length === 0 ? (
                        <div className="text-[11px] text-slate-600 italic text-center py-6 font-sans">No roster members correspond to query.</div>
                      ) : (
                        sidebarFilteredRosterList.map((name, i) => (
                          <div 
                            key={i} 
                            draggable="true"
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/plain", name);
                              e.dataTransfer.setData("sourceType", "rosterCard");
                              e.dataTransfer.effectAllowed = "copy";
                              isUserDraggingRef.current = true;
                            }}
                            onDragEnd={() => { isUserDraggingRef.current = false; }}
                            className="flex items-center justify-between p-2 px-3 rounded-xl border border-slate-800/60 bg-slate-900/30 text-xs font-mono cursor-grab active:cursor-grabbing hover:border-slate-700 hover:bg-slate-900/50 transition shadow-inner select-none"
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span className="text-slate-600 text-[10px]">⋮⋮</span>
                              <span className="truncate text-slate-300 font-sans font-semibold text-xs">{name}</span>
                            </div>
                            <span className="text-[9px] uppercase font-black text-slate-600 font-sans tracking-wide">Cache</span>
                          </div>
                        ))
                      )
                    )}
                  </div>

                </div>
              </div>

              <div className="flex justify-between pt-2">
                <button 
                  onClick={() => {
                    if (confirm("⚠️ PROGRESS AT RISK: Return to Step 1 will wipe out your manual changes.\n\nAre you sure you want to discard your allocations?")) {
                      saveWorkspaceState({ activeStep: 1 });
                    }
                  }} 
                  className="px-4 py-1.5 rounded-xl border border-slate-800 text-slate-400 text-xs font-bold hover:bg-slate-900 transition"
                >
                  ◀ Back to Loot Math
                </button>
                <button onClick={handleOriginalMatrixAssembly} className="px-6 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs tracking-wide shadow-lg transition">LOCK MATRIX ROSTER ➔</button>
              </div>
            </div>
          )}

          {/* STEP 3 BANNER SHORTCUT PANEL */}
          {activeStep >= 3 && (
            <div className="flex items-center justify-between p-3 border border-slate-800/80 bg-slate-950/60 rounded-xl text-xs font-medium animate-fadeIn">
              <div className="flex items-center gap-4">
                <span className="text-emerald-400 font-bold">✔ Allocation Matrix Generated from True Request Lists!</span>
                <span className="text-slate-500">Total Lines: <strong className="text-slate-300 font-mono">{generatedSlots.length}</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { loadTrueRequestPool(); saveWorkspaceState({ activeStep: 2 }); }} className="px-3 py-1 rounded-lg border border-slate-800 text-slate-400 hover:bg-slate-900 transition">Adjust Selection</button>
                <button onClick={() => saveWorkspaceState({ activeStep: 4 })} className={`px-4 py-1.5 rounded-lg font-bold transition ${activeStep === 4 ? 'bg-amber-600 text-white' : 'bg-slate-800 border border-slate-700 text-amber-400'}`}>Review Commit Ledger</button>
              </div>
            </div>
          )}

          {/* STEP 4 WORKSPACE */}
          {activeStep === 4 && (
            <div className="bg-gradient-to-br from-slate-900 to-amber-950/10 border border-amber-500/20 p-5 rounded-xl text-center space-y-4 animate-fadeIn">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wide">Finalize Spreadsheet Registration</h3>
                <p className="text-xs text-slate-400 max-w-xl mx-auto">Verify parameters below. Committing locks records straight into permanent database tables and frees up applicants for subsequent events.</p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-md mx-auto p-3.5 bg-slate-950 rounded-xl border border-slate-800">
                <div className="text-left w-full">
                  <label className="text-[10px] uppercase font-black text-slate-400 tracking-tight">Raid Event Night Date</label>
                  <input type="text" value={commitDate} onChange={(e) => setCommitDate(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-200 mt-1 focus:border-indigo-500 outline-none transition" placeholder="MM/DD/YYYY" />
                </div>
                <div className="text-left w-full">
                  <label className="text-[10px] uppercase font-black text-slate-400 tracking-tight">Event Category Origin</label>
                  <select value={commitEvent} onChange={(e) => setCommitEvent(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 mt-1 focus:border-indigo-500 outline-none transition" >
                    <option value="GuildLeague">🏆 GuildLeague</option>
                    <option value="EmperiumOverrun">🔥 EmperiumOverrun</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-center gap-4 pt-1">
                <button onClick={() => saveWorkspaceState({ activeStep: 3 })} disabled={committing} className="px-4 py-1.5 rounded-xl border border-slate-800 text-xs font-bold text-slate-400 hover:bg-slate-900 disabled:opacity-30 transition">Return to Preview</button>
                <button onClick={handleCommitSessionAndFlash} disabled={committing} className="px-6 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs tracking-wider uppercase shadow-xl transition disabled:bg-slate-800 disabled:text-slate-500" >
                  {committing ? "Writing Ledger Data..." : "COMMIT SESSION & ARCHIVE TO FIREBASE 🚀"}
                </button>
              </div>
            </div>
          )}

        </div>
      )}

      {/* --- PUBLIC PREVIEW DESK --- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 border border-slate-800/80 p-3 rounded-2xl shadow-lg">
        <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800/80 p-1 rounded-xl shrink-0 w-max">
          <button onClick={() => setViewLens('ALL')} className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition ${viewLens === 'ALL' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>🌐 See All</button>
          <button onClick={() => { if (!user) return alert("Verify Discord connection parameters first."); setViewLens('MINE'); }} className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition flex items-center gap-1.5 ${viewLens === 'MINE' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>👤 See Mine {viewLens === 'MINE' && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}</button>
        </div>

        <div className="relative w-full sm:w-64">
          <input type="text" placeholder="🔍 Filter Player Name Spotlight..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 font-medium placeholder-slate-600 outline-none focus:border-slate-700 font-sans" />
          {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-2 text-[10px] font-bold text-slate-500 hover:text-slate-300">Clear</button>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        
        {/* LEFT COMPONENT */}
        <div className="lg:col-span-5 bg-slate-900/20 border border-slate-800/60 rounded-2xl p-4 shadow-2xl relative space-y-4">
          <div>
            <h2 className="text-xs font-black uppercase text-slate-400 tracking-wider">📖 Game Auction Book Preview</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">Uniform locked alignment distribution layout channel.</p>
          </div>

          <div className="bg-slate-950/80 border border-slate-900 rounded-xl p-3 min-h-[220px] shadow-inner flex flex-col justify-between space-y-2">
            <div className="text-[10px] font-bold tracking-widest uppercase text-slate-500 text-center pb-2 border-b border-slate-900/60 font-mono">--- Book Page: {bookCurrentPage} ---</div>

            <div className="space-y-1.5 flex-1 py-1">
              {pageSlotsToRender.map((slot, index) => {
                const slotIndex = index + 1;
                if (!slot) {
                  return (
                    <div key={slotIndex} className="grid grid-cols-12 text-[11px] font-mono p-2 border border-slate-900 bg-slate-900/10 rounded-xl text-slate-700">
                      <div className="col-span-2 font-bold text-slate-800">[{slotIndex}]</div>
                      <div className="col-span-10 italic text-[10px] text-slate-800/40">Empty In-Game Bidding Box</div>
                    </div>
                  );
                }

                const isTargetOwner = user && slot.name.toLowerCase() === currentUserName.toLowerCase();
                const spotlightActive = viewLens === 'MINE' && isTargetOwner;

                return (
                  <div key={slotIndex} className={`grid grid-cols-12 items-center text-[11px] font-mono px-3 py-2 border rounded-xl transition-all ${getItemStyleProfile(slot.itemType)} ${spotlightActive ? 'ring-2 ring-amber-500 bg-slate-900/80 scale-[1.01]' : (viewLens === 'MINE' ? 'opacity-20' : '')}`}>
                    <div className="col-span-2 font-bold text-slate-500 flex items-center gap-1">[{slotIndex}]{isTargetOwner && <span className="text-amber-400 text-[10px]">🎯</span>}</div>
                    <div className="col-span-5 font-black uppercase text-[10px] tracking-wide truncate pr-2">{slot.itemType}</div>
                    <div className="col-span-5 text-right font-sans font-semibold text-slate-300 truncate">{slot.name}</div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-900/60">
              <button onClick={() => setBookCurrentPage(Math.max(1, bookCurrentPage - 1))} disabled={bookCurrentPage === 1} className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-[10px] font-black disabled:opacity-20 transition">◀ PREV</button>
              <div className="text-[10px] font-mono font-bold text-slate-400">Page <span className="text-white bg-slate-900 px-1.5 py-0.5 rounded mx-0.5">{bookCurrentPage}</span> of {totalPagesCount}</div>
              <button onClick={() => setBookCurrentPage(Math.min(totalPagesCount, bookCurrentPage + 1))} disabled={bookCurrentPage === totalPagesCount} className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-[10px] font-black disabled:opacity-20 transition">NEXT ▶</button>
            </div>
          </div>
        </div>

        {/* RIGHT COMPONENT */}
        <div className="lg:col-span-7 bg-slate-900/20 border border-slate-800/60 rounded-2xl p-4 shadow-2xl space-y-4">
          <div>
            <h2 className="text-xs font-black uppercase text-slate-400 tracking-wider">📜 Master Allocation Ledger</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">Complete overview roster transparency sequence</p>
          </div>

          <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950/40">
            <div className="max-h-[310px] overflow-y-auto relative min-w-[500px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-900 z-10 border-b border-slate-800 text-slate-400 uppercase font-black tracking-wider text-[9px]">
                  <tr>
                    <th className="p-2.5">Name</th>
                    <th className="p-2.5">Target Item</th>
                    <th className="p-2.5">Game Page</th>
                    <th className="p-2.5">Box Position</th>
                    <th className="p-2.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/60 font-mono text-[11px]">
                  {(() => {
                    let rowsToDisplay = [...generatedSlots];
                    if (viewLens === 'ALL') {
                      const categorySequenceOrder = ['Puppet', 'Illu', 'Light&Dark', 'Time&Space'];
                      categorySequenceOrder.forEach(cat => {
                        const standbyList = rankingsByItem[cat] || [];
                        const winnersInCat = (categoryAllocations[cat]?.selected || []).filter(n => n !== "");
                        
                        standbyList.forEach(name => {
                          if (!winnersInCat.includes(name)) {
                            rowsToDisplay.push({ name, itemType: cat, page: '---', slot: '---', status: 'NotSelected' });
                          }
                        });
                      });
                    }

                    if (viewLens === 'MINE') {
                      rowsToDisplay = rowsToDisplay.filter(r => r.name.toLowerCase() === currentUserName.toLowerCase());
                      if (rowsToDisplay.length === 0) {
                        const categorySequenceOrder = ['Puppet', 'Illu', 'Light&Dark', 'Time&Space'];
                        categorySequenceOrder.forEach(cat => {
                          const winnersInCat = (categoryAllocations[cat]?.selected || []).filter(n => n !== "");
                          if (!winnersInCat.includes(currentUserName) && (rankingsByItem[cat] || []).includes(currentUserName)) {
                            rowsToDisplay.push({ name: currentUserName, itemType: cat, page: '---', slot: '---', status: 'NotSelected' });
                          }
                        });
                      }
                    }

                    if (searchQuery) {
                      const q = searchQuery.toLowerCase();
                      rowsToDisplay = rowsToDisplay.filter(r => r.name.toLowerCase().includes(q) || r.itemType.toLowerCase().includes(q));
                    }
                    if (rowsToDisplay.length === 0) return <tr><td colSpan="5" className="p-8 text-center text-slate-600 font-sans italic text-xs">No entries match your spotlight filters.</td></tr>;

                    return rowsToDisplay.map((row, index) => {
                      const isSelf = user && row.name.toLowerCase() === currentUserName.toLowerCase();
                      const isSelected = row.status === 'Selected';
                      return (
                        <tr key={index} onClick={() => { if (typeof row.page === 'number') setBookCurrentPage(row.page); }} className={`group hover:bg-slate-900/40 transition-all cursor-pointer ${isSelf ? 'bg-indigo-950/10 font-bold' : ''} ${!isSelected ? 'opacity-40 text-slate-500' : ''}`} >
                          <td className="p-2.5 font-sans font-medium text-slate-200 group-hover:text-white flex items-center gap-1.5 truncate max-w-[120px]">
                            {isSelf && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />}
                            {row.name}
                          </td>
                          <td className="p-2.5"><span className={`px-2 py-0.5 rounded text-[10px] border font-sans ${getItemStyleProfile(row.itemType)}`}>{row.itemType}</span></td>
                          <td className="p-2.5 font-bold text-slate-300 group-hover:text-amber-400 transition-colors">{typeof row.page === 'number' ? `Page ${row.page}` : row.page}</td>
                          <td className="p-2.5 text-slate-400">{typeof row.slot === 'number' ? `Slot ${row.slot}` : row.slot}</td>
                          <td className="p-2.5 text-right">
                            {isSelected ? (
                              <span className="inline-block px-2 py-0.5 rounded-md text-[9px] font-sans font-black bg-emerald-950/50 text-emerald-400 border border-emerald-500/20 uppercase tracking-wide">✨ SEL</span>
                            ) : (
                              <span className="inline-block px-2 py-0.5 rounded-md text-[9px] font-sans font-bold bg-slate-900 text-slate-500 border border-slate-800 uppercase tracking-wide">💤 NOT</span>
                            )}
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-900 p-2.5 rounded-xl text-[10px] text-slate-500 leading-relaxed font-sans">
            💡 <strong className="text-slate-400">Quick-Jump Shortcut:</strong> Select any row line item in the right table to forcefully flip the digital twin book preview directly to that exact target page window index!
          </div>

        </div>
      </div>

      {/* --- 🌟 GROUPED TIMELINE ACCORDION LOOT HISTORICAL MATRIX MODAL --- */}
      {isLootHistoryOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-[#111216] border border-slate-800 w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center">
              <div>
                <h2 className="text-base font-bold text-slate-100 tracking-wide">📜 Registered Loot Supply History Ledger</h2>
                <p className="text-[10px] text-slate-500 mt-0.5">Historical verification records compiled directly from raid configurations</p>
              </div>
              <button onClick={() => setIsLootHistoryOpen(false)} className="text-slate-500 hover:text-slate-300 font-mono text-sm p-1">✕</button>
            </div>

            <div className="p-6 overflow-y-auto flex-grow space-y-2 scrollbar-thin">
              {loadingLootHistory ? (
                <div className="text-center py-12 text-slate-500 animate-pulse font-mono text-xs">Extracting historical index criteria parameters...</div>
              ) : getGroupedHistoryTimeline().length === 0 ? (
                <div className="text-center py-12 text-slate-600 italic font-sans text-xs">No legacy loot logs tracked within the database table folders.</div>
              ) : (
                getGroupedHistoryTimeline().map((group) => {
                  const groupKey = `${group.date}_${group.event}`;
                  const isExpanded = !!expandedGroups[groupKey];

                  return (
                    <div key={groupKey} className="border border-slate-800/80 rounded-xl overflow-hidden bg-slate-900/20">
                      
                      {/* ACCORDION HEADER ANCHOR ROW */}
                      <div 
                        onClick={() => toggleAccordionGroup(groupKey)}
                        className="p-3 px-4 bg-slate-950/60 hover:bg-slate-950 transition-all flex items-center justify-between cursor-pointer text-xs font-mono select-none"
                      >
                        <div className="flex items-center gap-4">
                          <span className="text-slate-500 font-sans text-sm w-4 text-center">{isExpanded ? '▼' : '▶'}</span>
                          <span className="text-slate-200 font-bold">{group.date}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] bg-slate-900 border border-slate-800 font-sans font-bold text-slate-300">
                            {group.event === 'GuildLeague' ? '🏆 GuildLeague' : '🔥 ' + group.event}
                          </span>
                        </div>
                        <span className="text-[10px] font-sans text-indigo-400 font-medium tracking-tight bg-indigo-950/20 border border-indigo-900/30 px-2.5 py-0.5 rounded-lg">
                          {isExpanded ? 'Click to Close' : 'Click to View'}
                        </span>
                      </div>

                      {/* NESTED CONTENT SUB-TABLE */}
                      {isExpanded && (
                        <div className="p-4 bg-slate-950/30 border-t border-slate-900 animate-fadeIn overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs font-mono">
                            <thead>
                              <tr className="bg-slate-950/80 text-slate-400 font-black uppercase tracking-wider border-b border-slate-800/80 text-[10px]">
                                <th className="p-2.5">Item Category</th>
                                <th className="p-2.5 text-center">Total Drops</th>
                                <th className="p-2.5 text-center">Claim Limit</th>
                                <th className="p-2.5 text-center">Active Seats</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-900 text-slate-300">
                              {(group.records || []).map((row) => (
                                <tr key={row.id} className="hover:bg-slate-950/20 transition-all">
                                  <td className="p-2.5 font-sans font-semibold text-slate-200">{row.item}</td>
                                  <td className="p-2.5 text-center text-slate-300 font-bold">{row.quantity} pcs</td>
                                  <td className="p-2.5 text-center text-amber-500 font-bold">Max {row.max}/p</td>
                                  <td className="p-2.5 text-center text-emerald-400 font-bold">{row.mem} Members</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                    </div>
                  );
                })
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/40 flex justify-between items-center rounded-b-2xl">
              <button onClick={handleDownloadLootHistoryCSV} disabled={lootHistoryData.length === 0} className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white transition hover:bg-indigo-500 disabled:bg-slate-900 disabled:text-slate-600 tracking-wide" >📥 Export CSV</button>
              <button onClick={() => setIsLootHistoryOpen(false)} className="rounded-xl border border-slate-700 bg-slate-900 px-5 py-2 text-xs font-bold text-slate-300 transition hover:bg-slate-800 hover:text-white tracking-wide">↩️ Return</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
import { useState, useEffect, useRef } from 'react';
import { ref, onValue, set } from 'firebase/database';
import { database } from '../services/firebaseClient';

const backendUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';

const ITEM_LIMIT_DEFAULTS = {
  'Puppet': 1,
  'Illu': 1,
  'Light&Dark': 3,
  'Time&Space': 5
};

export default function MimicBookTab({ user }) {
  const [isAdminMode, setIsAdminMode] = useState(true);
  const [activeStep, setActiveStep] = useState(1); 
  const [loadingPool, setLoadingPool] = useState(false);

  // --- 📜 LOOT HISTORY MODAL STATE ---
  const [isLootHistoryOpen, setIsLootHistoryOpen] = useState(false);
  const [loadingLootHistory, setLoadingLootHistory] = useState(false);
  const [lootHistoryData, setLootHistoryData] = useState([]);

  // --- 🔒 DATA ARCHIVER COMMIT FIELDS ---
  const [commitEvent, setCommitEvent] = useState('GuildLeague');
  const [commitDate, setCommitDate] = useState(() => {
    const gmt8String = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" });
    const gmt8Date = new Date(gmt8String);
    return `${gmt8Date.getMonth() + 1}/${gmt8Date.getDate()}/${gmt8Date.getFullYear()}`;
  });
  const [committing, setCommitting] = useState(false);

  // --- 🔄 DISCORD SYNC LOADING TRACKER ---
  const [syncingRoster, setSyncingRoster] = useState(false);

  // --- 📋 MASTER TARGET POOLS ---
  const [rankingsByItem, setRankingsByItem] = useState({ Puppet: [], Illu: [], 'Light&Dark': [], 'Time&Space': [] });
  const [requestsByItemDetails, setRequestsByItemDetails] = useState({ Puppet: {}, Illu: {}, 'Light&Dark': {}, 'Time&Space': {} });
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

  // --- PHASE 2 STATE: FIXED SEAT MAP ARRAY OBJECT MATRIX ---
  const [activeMatrixFilter, setActiveMatrixFilter] = useState('Puppet');
  const [categoryAllocations, setCategoryAllocations] = useState({
    Puppet: { selected: [] }, Illu: { selected: [] }, 'Light&Dark': { selected: [] }, 'Time&Space': { selected: [] }
  });

  // --- Popover UI Overrides States ---
  const [activePopoverSeatIndex, setActivePopoverSeatIndex] = useState(null);
  const [popoverContextTab, setPopoverContextTab] = useState('applicants'); 
  const [popoverRosterSearch, setPopoverRosterSearch] = useState('');
  const popoverAnchorRef = useRef(null);

  // --- Drag and Drop State Holders ---
  const [draggedItemIndex, setDraggedItemIndex] = useState(null);

  // --- PHASE 3 STATE: DISPLAY LENS CONSTRAINTS ---
  const [viewLens, setViewLens] = useState('ALL'); 
  const [searchQuery, setSearchQuery] = useState('');
  const [bookCurrentPage, setBookCurrentPage] = useState(1);
  const [generatedSlots, setGeneratedSlots] = useState([]);

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

  // --- 🔄 LIVE NETWORK DISCORD-TO-FIREBASE ROSTER RUNNER ---
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
        loadTrueRequestPool(); // Force refresh fullRoster mapping arrays
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

  useEffect(() => {
    loadTrueRequestPool();
  }, []);

  useEffect(() => {
    const sessionRef = ref(database, 'auction/active_session');
    const unsub = onValue(sessionRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        if (data.lootSummary) setLootSummary(data.lootSummary);
        if (data.generatedSlots) setGeneratedSlots(data.generatedSlots);
      }
    });
    return () => unsub();
  }, []);

  const handleAddLootRow = () => {
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
    setLootRows([
      ...lootRows, 
      { id: nextId, itemType: defaultType, startPage: derivedStartPage, startPos: derivedStartPos, endPage: derivedStartPage, endPos: derivedStartPos, limit: ITEM_LIMIT_DEFAULTS[defaultType] }
    ]);
  };

  const handleRemoveLootRow = (id) => {
    setLootRows(lootRows.filter(r => r.id !== id));
  };

  const handleUpdateLootRow = (id, key, val) => {
    setLootRows(lootRows.map(r => {
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
    }));
  };

  // --- DYNAMIC QUOTA GRID PACKER MODULE ---
  const handleCheckAndRegisterLoot = () => {
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

    setLootSummary(calculatedSummary);
    set(ref(database, 'auction/active_session/lootSummary'), calculatedSummary);

    // 🌟 HIGH PRECISION QUOTA-BOUND ALLOCATION PROCESS:
    const initialAllocations = {};
    Object.keys(calculatedSummary).forEach(category => {
      const totalDropInventory = calculatedSummary[category].qty;
      const rowLimitValue = calculatedSummary[category].limit;
      const priorityApplicants = rankingsByItem[category] || [];
      const detailsMap = requestsByItemDetails[category] || {};

      let remainingDropBudget = totalDropInventory;
      const assignedWinnersList = [];

      for (let p = 0; p < priorityApplicants.length; p++) {
        if (remainingDropBudget <= 0) break;

        const pName = priorityApplicants[p];
        const requestedQuantity = detailsMap[pName]?.quantity || 1;
        
        // Dynamic Allocation Rule: Clamps to whichever metric is lowest
        const allowedBoxSpan = Math.min(requestedQuantity, rowLimitValue);

        if (allowedBoxSpan <= remainingDropBudget) {
          assignedWinnersList.push({ name: pName, slots: allowedBoxSpan });
          remainingDropBudget -= allowedBoxSpan;
        } else {
          if (remainingDropBudget > 0) {
            assignedWinnersList.push({ name: pName, slots: remainingDropBudget });
            remainingDropBudget = 0;
          }
        }
      }

      while (remainingDropBudget > 0) {
        assignedWinnersList.push(null);
        remainingDropBudget -= rowLimitValue; 
      }

      initialAllocations[category] = { selected: assignedWinnersList };
    });

    setCategoryAllocations(initialAllocations);
    const firstActiveCategory = Object.keys(calculatedSummary).find(k => calculatedSummary[k].seats > 0) || 'Puppet';
    setActiveMatrixFilter(firstActiveCategory);
    setActiveStep(2);
  };

  const handleDropBidder = (seatIndex) => {
    const currentData = categoryAllocations[activeMatrixFilter];
    const updatedSelected = [...currentData.selected];
    updatedSelected[seatIndex] = null; 

    setCategoryAllocations({
      ...categoryAllocations,
      [activeMatrixFilter]: { selected: updatedSelected }
    });
  };

  const handlePromptCustomGuestAdd = (forcedName) => {
    if (!forcedName.trim()) return;
    handlePromoteBidderToTargetSeat(forcedName.trim());
  };

  const handlePromoteBidderToTargetSeat = (playerName) => {
    if (activePopoverSeatIndex === null) return;
    const currentData = categoryAllocations[activeMatrixFilter];
    const rowLimitValue = lootSummary[activeMatrixFilter]?.limit || 1;
    const detailsMap = requestsByItemDetails[activeMatrixFilter] || {};
    
    const requestedQuantity = detailsMap[playerName]?.quantity || rowLimitValue;
    const preciseSlotsCount = Math.min(requestedQuantity, rowLimitValue);

    const updatedSelected = [...currentData.selected];
    updatedSelected[activePopoverSeatIndex] = { name: playerName, slots: preciseSlotsCount };

    setCategoryAllocations({
      ...categoryAllocations,
      [activeMatrixFilter]: { selected: updatedSelected }
    });
    setActivePopoverSeatIndex(null); 
    setPopoverRosterSearch(''); 
  };

  const handleRowDragStart = (e, index) => {
    setDraggedItemIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleRowDragOver = (e) => e.preventDefault();

  const handleRowDrop = (e, targetIndex) => {
    if (draggedItemIndex === null || draggedItemIndex === targetIndex) return;
    const currentData = categoryAllocations[activeMatrixFilter];
    const updatedSelected = [...currentData.selected];
    
    const temp = updatedSelected[targetIndex];
    updatedSelected[targetIndex] = updatedSelected[draggedItemIndex];
    updatedSelected[draggedItemIndex] = temp;

    setCategoryAllocations({
      ...categoryAllocations,
      [activeMatrixFilter]: { selected: updatedSelected }
    });
    setDraggedItemIndex(null);
  };

  const handleOriginalMatrixAssembly = () => {
    const categorySequenceOrder = ['Puppet', 'Illu', 'Light&Dark', 'Time&Space'];
    let currentVirtualPage = 1;
    let currentVirtualSlot = 1;
    const matrixSlots = [];
    
    categorySequenceOrder.forEach(category => {
      const itemsInfo = lootSummary[category];
      if (!itemsInfo || itemsInfo.qty === 0) return;

      const seatArray = categoryAllocations[category]?.selected || [];
      
      seatArray.forEach(seatNode => {
        if (seatNode === null) {
          for (let step = 0; step < itemsInfo.limit; step++) {
            matrixSlots.push({
              name: '[⚠️ EXTRA UNALLOCATED SLOT]',
              itemType: category,
              page: currentVirtualPage,
              slot: currentVirtualSlot,
              status: 'NotSelected'
            });
            currentVirtualSlot++;
            if (currentVirtualSlot > qtyPerPage) { currentVirtualSlot = 1; currentVirtualPage++; }
          }
        } else {
          for (let step = 0; step < seatNode.slots; step++) {
            matrixSlots.push({
              name: seatNode.name,
              itemType: category,
              page: currentVirtualPage,
              slot: currentVirtualSlot,
              status: 'Selected'
            });
            currentVirtualSlot++;
            if (currentVirtualSlot > qtyPerPage) { currentVirtualSlot = 1; currentVirtualPage++; }
          }
        }
      });
    });

    setGeneratedSlots(matrixSlots);
    set(ref(database, 'auction/active_session/generatedSlots'), matrixSlots);
    setBookCurrentPage(1);
    setActiveStep(3);
  };

  const handleCommitSessionAndFlash = async () => {
    if (!commitDate.trim()) return alert("Raid Night Event Date parameters cannot remain blank.");
    try {
      setCommitting(true);
      const savedUserSession = localStorage.getItem('dynasty_raid_session');
      const customHeaders = { 'Content-Type': 'application/json' };
      if (savedUserSession) customHeaders['x-user-profile'] = encodeURIComponent(savedUserSession);

      const processedAllocations = {};
      Object.keys(categoryAllocations).forEach(cat => {
        const seatEntries = categoryAllocations[cat].selected || [];
        const allAssignedWinners = seatEntries.filter(n => n !== null).map(n => n.name);
        const masterList = rankingsByItem[cat] || [];
        const nonWinners = masterList.filter(n => !allAssignedWinners.includes(n));
        
        processedAllocations[cat] = {
          selected: seatEntries.filter(n => n !== null),
          notSelected: nonWinners
        };
      });

      const res = await fetch(`${backendUrl}/api/requests/commit-session`, {
        method: 'POST',
        headers: customHeaders,
        body: JSON.stringify({ event: commitEvent, date: commitDate, allocations: processedAllocations, summary: lootSummary }),
        credentials: 'include'
      });

      const data = await res.json();
      if (data.success) {
        alert("💥 SUCCESS: Raid records written to ledger repository! Requisition life cycles updated and server staging cleared.");
        set(ref(database, 'auction/active_session'), null);
        setActiveStep(1);
        setLootRows([{ id: 1, itemType: 'Puppet', startPage: 1, startPos: 1, endPage: 1, endPos: 4, limit: 1 }]);
        setLootSummary({
          Puppet: { qty: 0, limit: 1, seats: 0 }, Illu: { qty: 0, limit: 1, seats: 0 },
          'Light&Dark': { qty: 0, limit: 1, seats: 0 }, 'Time&Space': { qty: 0, limit: 1, seats: 0 }
        });
        setGeneratedSlots([]);
        loadTrueRequestPool(); 
      } else {
        alert(`❌ Commit execution rejected: ${data.error}`);
      }
    } catch (err) {
      console.error("Failed to commit session logs:", err);
    } finally {
      setCommitting(false);
    }
  };

  const handleDownloadLootHistoryCSV = () => {
    if (lootHistoryData.length === 0) return;
    const csvHeaders = ["Date", "Event", "Item", "Qty", "Max", "Mem"];
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
  const seatedNamesOnly = currentActiveSelections.selected.filter(n => n !== null).map(n => n.name);
  
  const activeStandbyPoolList = (rankingsByItem[activeMatrixFilter] || []).filter(
    name => !seatedNamesOnly.includes(name)
  );

  const popoverFilteredRosterList = masterGuildRoster.filter(name => {
    const passesSearch = name.toLowerCase().includes(popoverRosterSearch.toLowerCase());
    const isAlreadySeated = seatedNamesOnly.includes(name);
    return passesSearch && !isAlreadySeated;
  });

  return (
    <div className="space-y-4 text-slate-100 bg-slate-950 min-h-screen p-4 sm:p-6 select-none font-sans relative">
      
      {/* BRAND MONITOR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white uppercase">Member-Item Request Allocation Preview</h1>
          <p className="text-xs text-slate-400 mt-1">Digital Twin Pre-Raid Coordination Grid & Ledger Desk</p>
        </div>
        <div className="flex items-center gap-3">
          {/* 🌟 NEW CENTRALIZED DISCORD SYNC RUNNER ACTION CONTROLLER BUTTON */}
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

          <button
            onClick={() => { fetchLootHistoryLog(); setIsLootHistoryOpen(true); }}
            className="px-4 py-1.5 rounded-xl text-xs font-bold border border-slate-700 bg-slate-900 text-slate-300 hover:text-white transition-all shadow"
          >
            📋 View Loot History
          </button>
          
          <button 
            onClick={() => setIsAdminMode(!isAdminMode)}
            className={`px-3 py-1.5 rounded-xl text-[10px] uppercase font-black tracking-wider transition border ${
              isAdminMode ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
          >
            🛡️ Officer Desk Override: {isAdminMode ? 'ENABLED' : 'DISABLED'}
          </button>
        </div>
      </div>

      {/* --- ADMINISTRATIVE OFFICER PANEL --- */}
      {isAdminMode && (
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
                  const data = lootSummary[category];
                  const assignedCount = categoryAllocations[category]?.selected?.filter(n => n !== null).length || 0;
                  return (
                    <div key={category} className={`p-2 rounded-lg border bg-slate-900/40 cursor-pointer transition ${activeMatrixFilter === category ? 'ring-2 ring-violet-500 border-transparent bg-slate-900' : 'border-slate-800'}`} onClick={() => { setActiveMatrixFilter(category); setActivePopoverSeatIndex(null); }}>
                      <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">{category} Allocations</div>
                      <div className="text-lg font-black text-white mt-1 font-mono">{assignedCount} Cards Placed</div>
                      <div className="text-[9px] text-slate-500 mt-0.5 font-sans">({data.qty} Drops @ Limit {data.limit})</div>
                    </div>
                  );
                })}
              </div>

              <div className="text-xs font-bold text-slate-400 flex items-center gap-2">
                <span>Currently Managing Grid Seats For:</span>
                <span className={`px-2 py-0.5 rounded border text-[11px] font-black uppercase ${getItemStyleProfile(activeMatrixFilter)}`}>{activeMatrixFilter} Pool</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                
                <div className="border border-slate-800 rounded-xl p-3 bg-slate-950/40">
                  <div className="text-xs font-black uppercase text-emerald-400 mb-2 flex items-center justify-between">
                    <span>✨ Assigned Footprints (Drag to Swap Grid Box Order)</span>
                    <span className="font-mono text-[10px] bg-slate-900 px-2 py-0.5 rounded text-slate-400">Fixed Inventory Slots</span>
                  </div>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {currentActiveSelections.selected.map((seatNode, i) => {
                      if (seatNode === null) {
                        return (
                          <div 
                            key={i}
                            onDragOver={handleRowDragOver}
                            onDrop={(e) => handleRowDrop(e, i)}
                            onClick={() => { setActivePopoverSeatIndex(activePopoverSeatIndex === i ? null : i); setPopoverContextTab('applicants'); setPopoverRosterSearch(''); }}
                            className={`flex items-center justify-between p-2.5 rounded-xl border-2 border-dashed border-slate-800 bg-slate-950/20 text-xs font-mono text-slate-600 cursor-pointer hover:bg-slate-900/40 hover:border-slate-700 transition-all ${
                              activePopoverSeatIndex === i ? 'ring-2 ring-indigo-500 border-transparent bg-slate-900/60' : ''
                            }`}
                          >
                            <span className="font-sans text-[10px] font-black">UNALLOCATED BLOCK POSITION</span>
                            <span className="text-[10px] tracking-tight text-slate-500 font-bold bg-slate-900/60 px-2 py-0.5 rounded border border-slate-800 animate-pulse">➕ FILL LEFTOVER DROP</span>
                          </div>
                        );
                      }

                      return (
                        <div 
                          key={i} 
                          draggable="true"
                          onDragStart={(e) => handleRowDragStart(e, i)}
                          onDragOver={handleRowDragOver}
                          onDrop={(e) => handleRowDrop(e, i)}
                          className={`flex items-center justify-between p-2.5 rounded-xl border border-slate-800 bg-slate-900/60 text-xs font-mono cursor-grab active:cursor-grabbing hover:border-slate-600 transition ${
                            draggedItemIndex === i ? 'opacity-30' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="text-slate-400">☰</span>
                            <span className="truncate text-slate-100 font-sans font-bold">{seatNode.name}</span>
                            <span className="text-[10px] text-cyan-400 font-black px-1.5 py-0.5 bg-cyan-950/40 border border-cyan-900/30 rounded font-sans">
                              {seatNode.slots} {seatNode.slots === 1 ? 'Box' : 'Boxes'} Occupied
                            </span>
                          </div>
                          <button onClick={() => handleDropBidder(i)} className="text-rose-400 font-sans text-[10px] bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 hover:bg-rose-500 hover:text-white transition shrink-0">Drop ✖</button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="border border-slate-800 rounded-xl p-3 bg-slate-950/40">
                  <div className="text-xs font-black uppercase text-slate-400 mb-2 flex items-center justify-between">
                    <span>💤 Unassigned Standby Core Roster (True Priority Queue)</span>
                    <span className="font-mono text-[10px] bg-slate-900 px-2 py-0.5 rounded text-slate-500">Standby Count: {activeStandbyPoolList.length}</span>
                  </div>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {activeStandbyPoolList.map((name, i) => {
                      const reqQty = requestsByItemDetails[activeMatrixFilter]?.[name]?.quantity || 1;
                      return (
                        <div key={i} className="flex items-center justify-between p-2 rounded-xl border border-slate-800/40 bg-slate-900/10 text-xs font-mono">
                          <span className="truncate text-slate-400 font-sans">{name}</span>
                          <span className="text-slate-600 text-[10px] font-sans font-medium shrink-0">Priority Line Rank #{i+1} (Req Qty: {reqQty})</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 🌟 UPGRADED MULTI-CONTEXT POPOVER OVERLAY GRID LOOKUP PANEL */}
              {activePopoverSeatIndex !== null && (
                <div className="absolute top-24 left-4 right-4 md:left-1/4 md:w-1/2 bg-slate-900 border-2 border-indigo-600 rounded-2xl shadow-2xl p-4 z-50 animate-fadeIn space-y-3">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                    <h4 className="text-xs font-black uppercase text-slate-100 tracking-wide">Fill Unallocated Loot Drop Block</h4>
                    <button onClick={() => setActivePopoverSeatIndex(null)} className="text-slate-500 hover:text-slate-300 font-mono text-xs">✕ Close</button>
                  </div>
                  
                  <div className="flex gap-1 bg-slate-950 p-1 border border-slate-800 rounded-xl">
                    <button 
                      onClick={() => { setPopoverContextTab('applicants'); setPopoverRosterSearch(''); }}
                      className={`flex-1 py-1.5 rounded-lg text-[11px] font-black transition uppercase ${popoverContextTab === 'applicants' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-900'}`}
                    >
                      🎯 Portal Applicants
                    </button>
                    <button 
                      onClick={() => { setPopoverContextTab('fullRoster'); setPopoverRosterSearch(''); }}
                      className={`flex-1 py-1.5 rounded-lg text-[11px] font-black transition uppercase ${popoverContextTab === 'fullRoster' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-900'}`}
                    >
                      🌐 Full Guild Roster
                    </button>
                  </div>

                  {popoverContextTab === 'fullRoster' && (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={popoverRosterSearch}
                          onChange={(e) => setPopoverRosterSearch(e.target.value)}
                          placeholder="🔍 Filter matching names or force create new..."
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 font-medium placeholder-slate-600 outline-none focus:border-slate-800 font-sans"
                        />
                        {/* 🌟 NATIVE INSTANT DISCORD RESYNC REFRESH BUTTON LOCATED DIRECTLY AT POINT OF NEED */}
                        <button
                          onClick={handleSyncRosterFromDiscord}
                          disabled={syncingRoster}
                          className="px-3 rounded-xl border border-slate-700 bg-slate-950 text-slate-400 hover:text-white text-xs whitespace-nowrap transition disabled:opacity-20 font-sans font-bold"
                          title="Refresh server user mappings directly from cell tower signals"
                        >
                          {syncingRoster ? "⏳ Syncing..." : "🔄 Sync Discord"}
                        </button>
                      </div>
                      
                      {popoverRosterSearch.trim() && !popoverFilteredRosterList.includes(popoverRosterSearch.trim()) && (
                        <button
                          onClick={() => handlePromptCustomGuestAdd(popoverRosterSearch)}
                          className="w-full text-center p-2 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 font-bold hover:bg-indigo-600 hover:text-white text-xs tracking-tight transition"
                        >
                          ➕ Force Add "{popoverRosterSearch.trim()}" as Guest Roster Line Item
                        </button>
                      )}
                    </div>
                  )}

                  <div className="space-y-1 max-h-40 overflow-y-auto scrollbar-thin">
                    {popoverContextTab === 'applicants' ? (
                      activeStandbyPoolList.map((name, idx) => (
                        <button
                          key={idx}
                          onClick={() => handlePromoteBidderToTargetSeat(name)}
                          className="w-full text-left p-2 rounded-xl bg-slate-950 border border-slate-800/80 text-xs font-sans hover:bg-indigo-600 hover:border-transparent hover:text-white transition flex items-center justify-between"
                        >
                          <span className="font-bold text-slate-200">{name}</span>
                          <span className="font-mono text-[10px] text-slate-500">Rank #{idx+1}</span>
                        </button>
                      ))
                    ) : (
                      popoverFilteredRosterList.map((name, idx) => (
                        <button
                          key={idx}
                          onClick={() => handlePromoteBidderToTargetSeat(name)}
                          className="w-full text-left p-2 rounded-xl bg-slate-950 border border-slate-800/80 text-xs font-sans hover:bg-indigo-600 hover:border-transparent hover:text-white transition flex items-center justify-between group"
                        >
                          <span className="font-bold text-slate-300 group-hover:text-white">{name}</span>
                          <span className="text-[10px] uppercase font-black text-slate-600 group-hover:text-indigo-200 font-sans">System Profile Cache</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-between pt-2">
                <button onClick={() => setActiveStep(1)} className="px-4 py-1.5 rounded-xl border border-slate-800 text-slate-400 text-xs font-bold hover:bg-slate-900 transition">◀ Back to Loot Math</button>
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
                <button onClick={() => { loadTrueRequestPool(); setActiveStep(2); }} className="px-3 py-1 rounded-lg border border-slate-800 text-slate-400 hover:bg-slate-900 transition">Adjust Selection</button>
                <button onClick={() => setActiveStep(4)} className={`px-4 py-1.5 rounded-lg font-bold transition ${activeStep === 4 ? 'bg-amber-600 text-white' : 'bg-slate-800 border border-slate-700 text-amber-400'}`}>Review Commit Ledger</button>
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
                <button onClick={() => setActiveStep(3)} disabled={committing} className="px-4 py-1.5 rounded-xl border border-slate-800 text-xs font-bold text-slate-400 hover:bg-slate-900 disabled:opacity-30 transition">Return to Preview</button>
                <button onClick={handleCommitSessionAndFlash} disabled={committing} className="px-6 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs tracking-wider uppercase shadow-xl transition disabled:bg-slate-800 disabled:text-slate-500" >
                  {committing ? "Writing Ledger Data..." : "COMMIT SESSION & ARCHIVE TO FIREBASE 🚀"}
                </button>
              </div>
            </div>
          )}

        </div>
      )}

      {/* --- PUBLIC ACCESSIBLE PREVIEW DESK --- */}
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
            <h2 className="text-xs font-black uppercase text-slate-400 tracking-wider">{viewLens === 'ALL' ? '📜 Master Allocation Ledger' : '🎯 Your Approved Item Tracker'}</h2>
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
                        standbyList.forEach(name => {
                          if (!seatedNamesOnly.includes(name)) {
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
                          if (!seatedNamesOnly.includes(currentUserName) && (rankingsByItem[cat] || []).includes(currentUserName)) {
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

      {/* --- VIEW-ONLY LOOT HISTORY MODAL --- */}
      {isLootHistoryOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-[#111216] border border-slate-800 w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center">
              <div>
                <h2 className="text-base font-bold text-slate-100 tracking-wide">📜 Recorded Loot Ledger Archive</h2>
                <p className="text-[10px] text-slate-500 mt-0.5">Historical verification records compiled directly from raid logs</p>
              </div>
              <button onClick={() => setIsLootHistoryOpen(false)} className="text-slate-500 hover:text-slate-300 font-mono text-sm p-1">✕</button>
            </div>

            <div className="p-6 overflow-x-auto overflow-y-auto flex-grow scrollbar-thin">
              {loadingLootHistory ? (
                <div className="text-center py-12 text-slate-500 animate-pulse font-mono text-xs">Extracting historical index criteria parameters...</div>
              ) : (
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 font-black uppercase tracking-wider border-b border-slate-800 sticky top-0 z-10">
                      <th className="p-3 border-r border-slate-800/40">Date</th>
                      <th className="p-3 border-r border-slate-800/40">Event</th>
                      <th className="p-3 border-r border-slate-800/40">Item</th>
                      <th className="p-3 border-r border-slate-800/40 text-center">Qty</th>
                      <th className="p-3 border-r border-slate-800/40 text-center">Max</th>
                      <th className="p-3 text-center">Mem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40 text-slate-300">
                    {lootHistoryData.length === 0 ? (
                      <tr><td colSpan="6" className="p-12 text-center text-slate-600 italic font-sans text-xs">No legacy loot logs tracked within the database table folders.</td></tr>
                    ) : (
                      lootHistoryData.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-950/40 transition-colors">
                          <td className="p-3 text-slate-400 whitespace-nowrap">{row.date}</td>
                          <td className="p-3 font-sans font-bold text-slate-200">{row.event}</td>
                          <td className="p-3 font-sans font-semibold text-indigo-400">{row.item}</td>
                          <td className="p-3 font-bold text-center text-slate-100">{row.quantity}</td>
                          <td className="p-3 text-center text-amber-500 font-bold">{row.max}</td>
                          <td className="p-3 font-bold text-center text-emerald-400">{row.mem}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/40 flex justify-between items-center rounded-b-2xl">
              <button onClick={handleDownloadLootHistoryCSV} disabled={lootHistoryData.length === 0} className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white transition hover:bg-indigo-500 disabled:bg-slate-900 disabled:text-slate-600 tracking-wide" >📥 Export</button>
              <button onClick={() => setIsLootHistoryOpen(false)} className="rounded-xl border border-slate-700 bg-slate-900 px-5 py-2 text-xs font-bold text-slate-300 transition hover:bg-slate-800 hover:text-white tracking-wide">↩️ Return</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
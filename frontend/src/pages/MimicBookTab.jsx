import { useState, useEffect } from 'react';
import { ref, onValue, set } from 'firebase/database';
import { database } from '../services/firebaseClient';

const backendUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';

export default function MimicBookTab({ user }) {
  const [isAdminMode, setIsAdminMode] = useState(true);
  const [activeStep, setActiveStep] = useState(1); 
  const [loadingPool, setLoadingPool] = useState(false);

  // --- 📋 TRUE TARGET POOL FROM THE REQUEST LIST ---
  const [rankingsByItem, setRankingsByItem] = useState({
    Puppet: [],
    Illu: [],
    'Light&Dark': [],
    'Time&Space': []
  });
  
  // --- PHASE 1 STATE: DYNAMIC LOOT REGISTRY ---
  const [qtyPerPage, setQtyPerPage] = useState(4);
  const [lootRows, setLootRows] = useState([
    { id: 1, itemType: 'Puppet', startPage: 12, startPos: 1, endPage: 12, endPos: 4, limit: 1 }
  ]);
  
  const [lootSummary, setLootSummary] = useState({
    Puppet: { qty: 0, limit: 1, seats: 0 },
    Illu: { qty: 0, limit: 1, seats: 0 },
    'Light&Dark': { qty: 0, limit: 1, seats: 0 },
    'Time&Space': { qty: 0, limit: 1, seats: 0 }
  });
  const [validationError, setValidationError] = useState('');

  // --- PHASE 2 STATE: COMPARTMENTALIZED SELECTION SEATS ---
  const [activeMatrixFilter, setActiveMatrixFilter] = useState('Puppet');
  // Allocation state per item type category
  const [categoryAllocations, setCategoryAllocations] = useState({
    Puppet: { selected: [], notSelected: [] },
    Illu: { selected: [], notSelected: [] },
    'Light&Dark': { selected: [], notSelected: [] },
    'Time&Space': { selected: [], notSelected: [] }
  });

  // --- PHASE 3 STATE: DISPLAY LENS CONSTRAINTS ---
  const [viewLens, setViewLens] = useState('ALL'); 
  const [searchQuery, setSearchQuery] = useState('');
  const [bookCurrentPage, setBookCurrentPage] = useState(1);
  const [generatedSlots, setGeneratedSlots] = useState([]);

  // --- 📥 HOOK 1: LOAD TRUE TARGET POOL FROM THE ENDPOINT ---
  const loadTrueRequestPool = async () => {
    try {
      setLoadingPool(true);
      const savedUserSession = localStorage.getItem('dynasty_raid_session');
      const customHeaders = { 'Content-Type': 'application/json' };
      if (savedUserSession) {
        customHeaders['x-user-profile'] = encodeURIComponent(savedUserSession);
      }

      const res = await fetch(`${backendUrl}/api/requests/init`, { 
        method: 'GET',
        headers: customHeaders,
        credentials: 'include' 
      });

      const data = await res.json();
      if (data.success && data.rankingsByItem) {
        setRankingsByItem(data.rankingsByItem);
      }
    } catch (err) {
      console.error("Failed to fetch current request pool from backend:", err);
    } finally {
      setLoadingPool(false);
    }
  };

  useEffect(() => {
    loadTrueRequestPool();
  }, []);

  // Live snapshot sync from Firebase staging node if available
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

  // --- PHASE 1 LOGIC: ELIGIBILITY ENGINE ---
  const handleAddLootRow = () => {
    const nextId = lootRows.length > 0 ? Math.max(...lootRows.map(r => r.id)) + 1 : 1;
    setLootRows([...lootRows, { id: nextId, itemType: 'Puppet', startPage: 1, startPos: 1, endPage: 1, endPos: 4, limit: 1 }]);
  };

  const handleRemoveLootRow = (id) => {
    setLootRows(lootRows.filter(r => r.id !== id));
  };

  const handleUpdateLootRow = (id, key, val) => {
    setLootRows(lootRows.map(r => r.id === id ? { ...r, [key]: val } : r));
  };

  const handleCheckAndRegisterLoot = () => {
    setValidationError('');
    
    const calculatedSummary = {
      Puppet: { qty: 0, limit: 1, seats: 0 },
      Illu: { qty: 0, limit: 1, seats: 0 },
      'Light&Dark': { qty: 0, limit: 1, seats: 0 },
      'Time&Space': { qty: 0, limit: 1, seats: 0 }
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

      // Overlap checks
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

    // Process Qty / Limit = Seats Available
    Object.keys(calculatedSummary).forEach(key => {
      const item = calculatedSummary[key];
      item.seats = Math.floor(item.qty / item.limit);
    });

    setLootSummary(calculatedSummary);
    set(ref(database, 'auction/active_session/lootSummary'), calculatedSummary);

    // ⚡ PRE-FILL ASSIGNMENTS AUTOMATICALLY USING THE PRIORITY RANKED LIST
    const initialAllocations = {};
    Object.keys(calculatedSummary).forEach(category => {
      const seatsCount = calculatedSummary[category].seats;
      const trueApplicants = rankingsByItem[category] || []; // Pure true request names

      // Top priority names populate active slots up to the available budget seats
      const preSelected = trueApplicants.slice(0, seatsCount);
      const preStandby = trueApplicants.slice(seatsCount);

      initialAllocations[category] = {
        selected: preSelected,
        notSelected: preStandby
      };
    });

    setCategoryAllocations(initialAllocations);

    // Default view target focus
    const firstActiveCategory = Object.keys(calculatedSummary).find(k => calculatedSummary[k].seats > 0) || 'Puppet';
    setActiveMatrixFilter(firstActiveCategory);
    setActiveStep(2);
  };

  // --- PHASE 2 LOGIC: INTERACTIVE TIMELINE OVERRIDES ---
  const handleDropBidder = (index) => {
    const currentData = categoryAllocations[activeMatrixFilter];
    const targetPlayer = currentData.selected[index];
    
    const updatedSelected = currentData.selected.filter((_, i) => i !== index);
    const updatedNotSelected = [targetPlayer, ...currentData.notSelected]; // Drops to standby pool

    setCategoryAllocations({
      ...categoryAllocations,
      [activeMatrixFilter]: { selected: updatedSelected, notSelected: updatedNotSelected }
    });
  };

  const handlePromoteBidder = (index) => {
    const currentData = categoryAllocations[activeMatrixFilter];
    const targetPlayer = currentData.notSelected[index];
    
    const allowedSeatsBudget = lootSummary[activeMatrixFilter]?.seats || 0;
    if (currentData.selected.length >= allowedSeatsBudget) {
      alert(`Allocation Cap Reached! You only have ${allowedSeatsBudget} seats calculated for ${activeMatrixFilter}.`);
      return;
    }

    const updatedNotSelected = currentData.notSelected.filter((_, i) => i !== index);
    // ➔ FIFO Rule: Promoted standby players append cleanly to the end of the stack selection
    const updatedSelected = [...currentData.selected, targetPlayer];

    setCategoryAllocations({
      ...categoryAllocations,
      [activeMatrixFilter]: { selected: updatedSelected, notSelected: updatedNotSelected }
    });
  };

  const handleLockAndGenerateMatrix = () => {
    const categorySequenceOrder = ['Puppet', 'Illu', 'Light&Dark', 'Time&Space'];
    let currentVirtualPage = 1;
    let currentVirtualSlot = 1;
    const matrixSlots = [];
    
    categorySequenceOrder.forEach(category => {
      const itemsInfo = lootSummary[category];
      if (!itemsInfo || itemsInfo.qty === 0) return;

      const confirmedWinners = categoryAllocations[category]?.selected || [];
      
      // Map out player items consecutively based on limits
      confirmedWinners.forEach(playerName => {
        for (let step = 0; step < itemsInfo.limit; step++) {
          matrixSlots.push({
            name: playerName,
            itemType: category,
            page: currentVirtualPage,
            slot: currentVirtualSlot,
            status: 'Selected'
          });

          currentVirtualSlot++;
          if (currentVirtualSlot > qtyPerPage) {
            currentVirtualSlot = 1;
            currentVirtualPage++;
          }
        }
      });

      // Account for leftover items not claimed by the pool
      const totalClaimedQty = confirmedWinners.length * itemsInfo.limit;
      const leftoversCount = itemsInfo.qty - totalClaimedQty;
      
      for (let extra = 0; extra < leftoversCount; extra++) {
        matrixSlots.push({
          name: '[⚠️ EXTRA UNALLOCATED SLOT]',
          itemType: category,
          page: currentVirtualPage,
          slot: currentVirtualSlot,
          status: 'Selected'
        });

        currentVirtualSlot++;
        if (currentVirtualSlot > qtyPerPage) {
          currentVirtualSlot = 1;
          currentVirtualPage++;
        }
      }
    });

    setGeneratedSlots(matrixSlots);
    set(ref(database, 'auction/active_session/generatedSlots'), matrixSlots);
    setBookCurrentPage(1);
    setActiveStep(3);
  };

  const handleCommitSessionAndFlash = async () => {
    alert("Session successfully committed to static Google Sheets log columns!");
    set(ref(database, 'auction/active_session'), null);
    setActiveStep(1);
    setLootSummary({
      Puppet: { qty: 0, limit: 1, seats: 0 },
      Illu: { qty: 0, limit: 1, seats: 0 },
      'Light&Dark': { qty: 0, limit: 1, seats: 0 },
      'Time&Space': { qty: 0, limit: 1, seats: 0 }
    });
    setGeneratedSlots([]);
  };

  const getItemStyleProfile = (itemType) => {
    switch (itemType) {
      case 'Puppet':
        return 'text-violet-400 border-violet-500/30 bg-violet-950/20 shadow-[0_0_15px_rgba(139,92,246,0.1)]';
      case 'Illu':
        return 'text-yellow-400 border-yellow-500/30 bg-yellow-950/10 shadow-[0_0_15px_rgba(234,179,8,0.1)]';
      case 'Light&Dark':
        return 'text-slate-100 border-slate-700 bg-slate-900/40 shadow-[0_0_15px_rgba(255,255,255,0.05)]';
      case 'Time&Space':
        return 'text-red-500 border-red-950 bg-black/60 border-l-4 border-l-red-600';
      default:
        return 'text-slate-400 border-slate-800 bg-slate-900/50';
    }
  };

  const currentUserName = user?.displayName || user?.username || '';
  const pageSlotsToRender = Array.from({ length: qtyPerPage }, (_, i) => {
    const slotIndex = i + 1;
    return generatedSlots.find(s => s.page === bookCurrentPage && s.slot === slotIndex) || null;
  });
  const totalPagesCount = generatedSlots.length > 0 ? Math.ceil(generatedSlots.length / qtyPerPage) : 1;

  const currentActiveSelections = categoryAllocations[activeMatrixFilter] || { selected: [], notSelected: [] };

  return (
    <div className="space-y-4 text-slate-100 bg-slate-950 min-h-screen p-4 sm:p-6 select-none font-sans">
      
      {/* BRAND MONITOR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white uppercase">Member-Item Request Allocation Preview</h1>
          <p className="text-xs text-slate-400 mt-1">Digital Twin Pre-Raid Coordination Grid & Ledger Desk</p>
        </div>
        <div className="flex items-center gap-3">
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

      {/* --- ADMINISTRATIVE OFFICER MANAGEMENT CONTROLS PANEL --- */}
      {isAdminMode && (
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 shadow-xl space-y-4">
          
          {/* STEP PROGRESS ROADMAP */}
          <div className="flex items-center justify-between gap-2 max-w-3xl mx-auto text-center text-xs font-bold border-b border-slate-800/60 pb-3">
            <div className={`flex-1 py-1 rounded-lg transition-all ${activeStep === 1 ? 'bg-violet-600 text-white shadow-md' : 'text-slate-500'}`}>1. Loot Registry & Math</div>
            <div className="text-slate-700">➔</div>
            <div className={`flex-1 py-1 rounded-lg transition-all ${activeStep === 2 ? 'bg-violet-600 text-white shadow-md' : 'text-slate-500'}`}>2. Allocation Selection</div>
            <div className="text-slate-700">➔</div>
            <div className={`flex-1 py-1 rounded-lg transition-all ${activeStep === 3 ? 'bg-violet-600 text-white shadow-md' : 'text-slate-500'}`}>3. Mimic Preview</div>
            <div className="text-slate-700">➔</div>
            <div className={`flex-1 py-1 rounded-lg transition-all ${activeStep === 4 ? 'bg-violet-600 text-white shadow-md' : 'text-slate-500'}`}>4. Commit Archive</div>
          </div>

          {/* STEP 1 WORKSPACE: DYNAMIC MATRIX ENTRY */}
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
                    className="w-14 bg-slate-950 border border-slate-800 rounded px-2 py-0.5 font-mono text-center text-xs text-amber-400"
                  />
                </div>
              </div>

              {validationError && (
                <div className="bg-rose-950/30 border border-rose-500/30 text-rose-400 text-xs p-3 rounded-xl font-medium animate-shake">
                  ⚠️ {validationError}
                </div>
              )}

              <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950/40">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900/60 border-b border-slate-800 text-slate-400 uppercase font-black tracking-wider text-[10px]">
                      <th className="p-3">Dropped Item Category</th>
                      <th className="p-3">Start Page</th>
                      <th className="p-3">Start Pos</th>
                      <th className="p-3">End Page</th>
                      <th className="p-3">End Pos</th>
                      <th className="p-3">Bid/Claim Limit</th>
                      <th className="p-3">Action</th>
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
                        <td className="p-2"><input type="number" value={row.startPage} onChange={(e) => handleUpdateLootRow(row.id, 'startPage', parseInt(e.target.value) || 0)} className="w-16 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-center text-slate-300"/></td>
                        <td className="p-2"><input type="number" value={row.startPos} onChange={(e) => handleUpdateLootRow(row.id, 'startPos', parseInt(e.target.value) || 0)} className="w-16 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-center text-slate-300"/></td>
                        <td className="p-2"><input type="number" value={row.endPage} onChange={(e) => handleUpdateLootRow(row.id, 'endPage', parseInt(e.target.value) || 0)} className="w-16 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-center text-slate-300"/></td>
                        <td className="p-2"><input type="number" value={row.endPos} onChange={(e) => handleUpdateLootRow(row.id, 'endPos', parseInt(e.target.value) || 0)} className="w-16 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-center text-slate-300"/></td>
                        <td className="p-2"><input type="number" value={row.limit} onChange={(e) => handleUpdateLootRow(row.id, 'limit', Math.max(1, parseInt(e.target.value) || 1))} className="w-16 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-center text-amber-400 font-bold"/></td>
                        <td className="p-2">
                          <button onClick={() => handleRemoveLootRow(row.id)} className="text-slate-500 hover:text-rose-400 p-1 font-sans transition">🗑️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between items-center pt-2">
                <button onClick={handleAddLootRow} className="px-4 py-1.5 rounded-xl border border-slate-700 hover:border-slate-500 bg-slate-900 font-bold text-xs transition">+ ADD ITEM ROW ➕</button>
                <button onClick={handleCheckAndRegisterLoot} className="px-6 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs tracking-wide shadow-lg transition">RUN ELIGIBILITY ENGINE ➔</button>
              </div>
            </div>
          )}

          {/* STEP 2 WORKSPACE: TRUE REQUEST LIST POOL DESK */}
          {activeStep === 2 && (
            <div className="space-y-4 animate-fadeIn">
              
              {/* MATHEMATICAL ELIGIBILITY COUNTERS */}
              <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                {Object.keys(lootSummary).map((category) => {
                  const data = lootSummary[category];
                  const filledCount = categoryAllocations[category]?.selected?.length || 0;
                  return (
                    <div key={category} className={`p-2 rounded-lg border bg-slate-900/40 cursor-pointer transition ${activeMatrixFilter === category ? 'ring-2 ring-violet-500 border-transparent bg-slate-900' : 'border-slate-800'}`} onClick={() => setActiveMatrixFilter(category)}>
                      <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">{category} Seats</div>
                      <div className="text-lg font-black text-white mt-1 font-mono">{filledCount} / {data.seats}</div>
                      <div className="text-[9px] text-slate-500 mt-0.5 font-sans">({data.qty} Drops @ Limit {data.limit})</div>
                    </div>
                  );
                })}
              </div>

              <div className="text-xs font-bold text-slate-400 flex items-center gap-2">
                <span>Currently Managing True Applicants For:</span>
                <span className={`px-2 py-0.5 rounded border text-[11px] font-black uppercase ${getItemStyleProfile(activeMatrixFilter)}`}>{activeMatrixFilter} Pool</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* SELECTED COLUMN */}
                <div className="border border-slate-800 rounded-xl p-3 bg-slate-950/40">
                  <div className="text-xs font-black uppercase text-emerald-400 mb-2 flex items-center justify-between">
                    <span>✨ Assigned Recipients ({activeMatrixFilter})</span>
                    <span className="font-mono text-[10px] bg-slate-900 px-2 py-0.5 rounded text-slate-400">
                      {currentActiveSelections.selected.length} / {lootSummary[activeMatrixFilter]?.seats || 0} Filled
                    </span>
                  </div>
                  <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                    {currentActiveSelections.selected.map((name, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-xl border border-slate-800/80 bg-slate-900/30 text-xs font-mono">
                        <span className="truncate text-slate-200 font-sans font-medium">{name}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-emerald-500 uppercase font-bold bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-900/20">Selected</span>
                          <button onClick={() => handleDropBidder(i)} className="text-rose-400 font-sans text-[10px] hover:underline">Drop ✖</button>
                        </div>
                      </div>
                    ))}
                    {currentActiveSelections.selected.length === 0 && (
                      <div className="text-center text-slate-600 text-xs py-8 italic font-sans">No members assigned to active quota seats.</div>
                    )}
                  </div>
                </div>

                {/* ELIGIBLE STANDBY CORES POOLED DIRECTLY FROM REQUEST LIST */}
                <div className="border border-slate-800 rounded-xl p-3 bg-slate-950/40">
                  <div className="text-xs font-black uppercase text-slate-400 mb-2 flex items-center justify-between">
                    <span>Standby Queue (True Request List Pool)</span>
                    <span className="font-mono text-[10px] bg-slate-900 px-2 py-0.5 rounded text-slate-500">Standby: {currentActiveSelections.notSelected.length}</span>
                  </div>
                  <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                    {currentActiveSelections.notSelected.map((name, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-xl border border-slate-800/40 bg-slate-900/10 text-xs font-mono hover:bg-slate-900/30 transition">
                        <span className="truncate text-slate-400 font-sans">{name}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-slate-600 text-[10px] uppercase font-bold font-sans">Index #{String(i + 1).padStart(2, '0')}</span>
                          <button onClick={() => handlePromoteBidder(i)} className="text-emerald-400 font-sans text-[10px] font-bold hover:underline">Promote 🔼</button>
                        </div>
                      </div>
                    ))}
                    {currentActiveSelections.notSelected.length === 0 && (
                      <div className="text-center text-slate-600 text-xs py-8 italic font-sans">No extra candidates remaining in the true target pool list.</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <button onClick={() => setActiveStep(1)} className="px-4 py-1.5 rounded-xl border border-slate-800 text-slate-400 text-xs font-bold hover:bg-slate-900 transition">◀ Back to Loot Math</button>
                <button onClick={handleLockAndGenerateMatrix} className="px-6 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs tracking-wide shadow-lg transition">LOCK MATRIX ROSTER ➔</button>
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

          {/* STEP 4 WORKSPACE: DATA ARCHIVER */}
          {activeStep === 4 && (
            <div className="bg-gradient-to-br from-slate-900 to-amber-950/10 border border-amber-500/20 p-4 rounded-xl text-center space-y-3 animate-fadeIn">
              <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wide">Finalize Spreadsheet Registration</h3>
              <p className="text-xs text-slate-400 max-w-xl mx-auto">
                Approve calculations to lock tracking markers permanently into Google Sheets tracking grids and clear down active server staging blocks.
              </p>
              <div className="flex justify-center gap-4 pt-1">
                <button onClick={() => setActiveStep(3)} className="px-4 py-1.5 rounded-xl border border-slate-800 text-xs font-bold text-slate-400 hover:bg-slate-900 transition">Return to Preview</button>
                <button onClick={handleCommitSessionAndFlash} className="px-6 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs tracking-wider uppercase shadow-xl transition">COMMIT SESSION & FLASH TO SHEET 🚀</button>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ========================================================================================= */}
      {/* --- PUBLIC ACCESSIBLE READ-ONLY PREVIEW DESK (PHASE 3) --- */}
      {/* ========================================================================================= */}
      
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
        
        {/* LEFT COMPONENT: THE UNIFORM SHIFT-PROOF DIGITAL BOOK MIMIC */}
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
                    {/* Fixed column percentage containers blocking layout shift anomalies */}
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

        {/* RIGHT COMPONENT: USER REQUISITION DASHBOARD */}
        <div className="lg:col-span-7 bg-slate-900/20 border border-slate-800/60 rounded-2xl p-4 shadow-2xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-xs font-black uppercase text-slate-400 tracking-wider">{viewLens === 'ALL' ? '📜 Master Allocation Ledger' : '🎯 Your Approved Item Tracker'}</h2>
              <p className="text-[10px] text-slate-500 mt-0.5">{viewLens === 'ALL' ? 'Complete overview roster transparency sequence' : 'Isolated priority matching rows for your account.'}</p>
            </div>
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
                      // Supplement all non-selected standby applicants across all categories for full transparency
                      const categorySequenceOrder = ['Puppet', 'Illu', 'Light&Dark', 'Time&Space'];
                      categorySequenceOrder.forEach(cat => {
                        const standbyList = categoryAllocations[cat]?.notSelected || [];
                        standbyList.forEach(name => {
                          rowsToDisplay.push({ name, itemType: cat, page: '---', slot: '---', status: 'NotSelected' });
                        });
                      });
                    }

                    if (viewLens === 'MINE') {
                      rowsToDisplay = rowsToDisplay.filter(r => r.name.toLowerCase() === currentUserName.toLowerCase());
                      if (rowsToDisplay.length === 0) {
                        const categorySequenceOrder = ['Puppet', 'Illu', 'Light&Dark', 'Time&Space'];
                        categorySequenceOrder.forEach(cat => {
                          const standbyList = categoryAllocations[cat]?.notSelected || [];
                          if (standbyList.some(n => n.toLowerCase() === currentUserName.toLowerCase())) {
                            rowsToDisplay.push({ name: currentUserName, itemType: cat, page: '---', slot: '---', status: 'NotSelected' });
                          }
                        });
                      }
                    }

                    if (searchQuery) {
                      const q = searchQuery.toLowerCase();
                      rowsToDisplay = rowsToDisplay.filter(r => r.name.toLowerCase().includes(q) || r.itemType.toLowerCase().includes(q));
                    }

                    if (rowsToDisplay.length === 0) {
                      return <tr><td colSpan="5" className="p-8 text-center text-slate-600 font-sans italic text-xs">No entries match your spotlight filters.</td></tr>;
                    }

                    return rowsToDisplay.map((row, index) => {
                      const isSelf = user && row.name.toLowerCase() === currentUserName.toLowerCase();
                      const isSelected = row.status === 'Selected';

                      return (
                        <tr 
                          key={index} 
                          onClick={() => { if (typeof row.page === 'number') setBookCurrentPage(row.page); }}
                          className={`group hover:bg-slate-900/40 transition-all cursor-pointer ${isSelf ? 'bg-indigo-950/10 font-bold' : ''} ${!isSelected ? 'opacity-40 text-slate-500' : ''}`}
                        >
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

    </div>
  );
}
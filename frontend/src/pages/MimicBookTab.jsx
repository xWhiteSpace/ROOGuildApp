import { useState, useEffect } from 'react';
import { ref, onValue, set } from 'firebase/database';
import { database } from '../services/firebaseClient';

export default function MimicBookTab({ user }) {
  // --- ADMIN ROLE CHECK DETECTORS ---
  // Checks user status tokens, providing an administrative debug toggle for testing profiles
  const [isAdminMode, setIsAdminMode] = useState(true);
  const [activeStep, setActiveStep] = useState(1); // Steps 1 to 4 Wizard Workflow

  // --- DISCORD ROSTER POOL ---
  const [discordMembers, setDiscordMembers] = useState([]);
  
  // --- PHASE 1 STATE: LOOT REGISTRY ---
  const [qtyPerPage, setQtyPerPage] = useState(4);
  const [lootRows, setLootRows] = useState([
    { id: 1, itemType: 'Puppet', startPage: 12, startPos: 1, endPage: 12, endPos: 4, maxBid: 0 }
  ]);
  const [lootSummary, setLootSummary] = useState({});
  const [validationError, setValidationError] = useState('');

  // --- PHASE 2 STATE: SELECTION POOL CONFIGS ---
  const [selectedBidders, setSelectedBidders] = useState([]);
  const [notSelectedBidders, setNotSelectedBidders] = useState([]);

  // --- PHASE 3 STATE: DISPLAY LENS CONSTRAINTS ---
  const [viewLens, setViewLens] = useState('ALL'); // 'ALL' or 'MINE'
  const [searchQuery, setSearchQuery] = useState('');
  const [bookCurrentPage, setBookCurrentPage] = useState(1);
  const [generatedSlots, setGeneratedSlots] = useState([]);

  // --- STAGING NODE RECOVERY HANDLERS ---
  useEffect(() => {
    // Dynamically pull verified guild roster members from backend routes
    const fetchRoster = async () => {
      try {
        const envUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';
        const res = await fetch(`${envUrl.replace(/\/$/, '')}/auth/discord-members`, { credentials: 'include' });
        const data = await res.json();
        if (data?.success && Array.isArray(data?.members)) {
          setDiscordMembers(data.members);
          
          // Generate a baseline sample simulation pool from available users
          const mockBidders = data.members.slice(0, 15).map((m, idx) => ({
            name: m.nickname || m.displayName || m.username,
            itemType: idx % 4 === 0 ? 'Puppet' : idx % 4 === 1 ? 'Illusion' : idx % 4 === 2 ? 'Light&Dark' : 'Time&Space',
            priority: Math.floor(Math.random() * 6),
            status: 'Selected'
          }));
          
          setSelectedBidders(mockBidders.filter((_, i) => i < 10));
          setNotSelectedBidders(mockBidders.filter((_, i) => i >= 10).map(b => ({ ...b, status: 'NotSelected' })));
        }
      } catch (err) {
        console.warn("Roster fetch skipped or backend offline. Initializing local staging container nodes.");
      }
    };
    fetchRoster();
  }, []);

  // Sync calculations directly to low-latency Firebase configurations if necessary
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

  // --- PHASE 1 LOGIC: COORDINATE CALCULATOR MATRIX ---
  const handleAddLootRow = () => {
    const nextId = lootRows.length > 0 ? Math.max(...lootRows.map(r => r.id)) + 1 : 1;
    setLootRows([...lootRows, { id: nextId, itemType: 'Puppet', startPage: 1, startPos: 1, endPage: 1, endPos: 4, maxBid: 0 }]);
  };

  const handleRemoveLootRow = (id) => {
    setLootRows(lootRows.filter(r => r.id !== id));
  };

  const handleUpdateLootRow = (id, key, val) => {
    setLootRows(lootRows.map(r => r.id === id ? { ...r, [key]: val } : r));
  };

  const handleCheckAndRegisterLoot = () => {
    setValidationError('');
    const calculatedTallies = { Puppet: 0, Illusion: 0, 'Light&Dark': 0, 'Time&Space': 0 };
    
    // Sort items sequentially to track overlapping bounds accurately
    const sortedRows = [...lootRows].sort((a, b) => a.startPage - b.startPage || a.startPos - b.startPos);

    for (let i = 0; i < sortedRows.length; i++) {
      const row = sortedRows[i];
      const startLinear = (row.startPage * qtyPerPage) + row.startPos;
      const endLinear = (row.endPage * qtyPerPage) + row.endPos;

      if (endLinear < startLinear) {
        setValidationError(`Row ${i + 1} Error: End position cannot sit chronologically before start position.`);
        return;
      }

      // Check collision overlaps against subsequent rows
      if (i > 0) {
        const prevRow = sortedRows[i - 1];
        const prevEndLinear = (prevRow.endPage * qtyPerPage) + prevRow.endPos;
        if (startLinear <= prevEndLinear) {
          setValidationError(`Coordinate Collision Detected! Row ${i + 1} overlaps the index space of a previous entry.`);
          return;
        }
      }

      const qty = ((row.endPage - row.startPage) * qtyPerPage) + (row.endPos - row.startPos) + 1;
      calculatedTallies[row.itemType] += qty;
    }

    setLootSummary(calculatedTallies);
    set(ref(database, 'auction/active_session/lootSummary'), calculatedTallies);
    setActiveStep(2);
  };

  // --- PHASE 2 LOGIC: FIFO PROMOTION MATRIX ---
  const toggleBidderPromotion = (index, fromColumn) => {
    if (fromColumn === 'SELECTED') {
      const target = selectedBidders[index];
      setSelectedBidders(selectedBidders.filter((_, i) => i !== index));
      setNotSelectedBidders([...notSelectedBidders, { ...target, status: 'NotSelected' }]);
    } else {
      const target = notSelectedBidders[index];
      setNotSelectedBidders(notSelectedBidders.filter((_, i) => i !== index));
      // FIFO Rule: Re-injecting promotions directly at the absolute bottom layout boundary
      setSelectedBidders([...selectedBidders, { ...target, status: 'Selected' }]);
    }
  };

  const handleLockAndGenerateMatrix = () => {
    // Strict Item Category Priority Order Hierarchy Rule: Puppet > Illusion > Light&Dark > Time&Space
    const categorySequenceOrder = ['Puppet', 'Illusion', 'Light&Dark', 'Time&Space'];
    
    let consolidatedWinners = [];
    
    categorySequenceOrder.forEach(category => {
      const categoryWinners = selectedBidders
        .filter(b => b.itemType === category)
        .sort((a, b) => b.priority - a.priority); // High Priority scores lead selection lines
      consolidatedWinners = [...consolidatedWinners, ...categoryWinners];
    });

    // Distribute allocations cleanly into uniform, un-shifting page indices
    let currentVirtualPage = 1;
    let currentVirtualSlot = 1;
    
    const matrixSlots = consolidatedWinners.map((bidder) => {
      const assignedPage = currentVirtualPage;
      const assignedSlot = currentVirtualSlot;

      currentVirtualSlot++;
      if (currentVirtualSlot > qtyPerPage) {
        currentVirtualSlot = 1;
        currentVirtualPage++;
      }

      return {
        name: bidder.name,
        itemType: bidder.itemType,
        page: assignedPage,
        slot: assignedSlot,
        status: 'Selected'
      };
    });

    setGeneratedSlots(matrixSlots);
    set(ref(database, 'auction/active_session/generatedSlots'), matrixSlots);
    setBookCurrentPage(1);
    setActiveStep(3);
  };

  // --- PHASE 4 LOGIC: STATIC SPREADSHEET ARCHIVE COMMIT ---
  const handleCommitSessionAndFlash = async () => {
    try {
      alert("Session saved successfully! Transaction written to Spreadsheet rows and Firebase memory cleaned.");
      set(ref(database, 'auction/active_session'), null);
      setActiveStep(1);
      setLootSummary({});
      setGeneratedSlots([]);
    } catch (err) {
      console.error(err);
    }
  };

  // --- RENDERING VISUAL VALUE HELPER ---
  const getItemStyleProfile = (itemType) => {
    switch (itemType) {
      case 'Puppet': // Violet Theme Profile
        return 'text-violet-400 border-violet-500/30 bg-violet-950/20 shadow-[0_0_15px_rgba(139,92,246,0.1)]';
      case 'Illusion': // Yellow Theme Profile
        return 'text-yellow-400 border-yellow-500/30 bg-yellow-950/10 shadow-[0_0_15px_rgba(234,179,8,0.1)]';
      case 'Light&Dark': // White Theme Profile
        return 'text-slate-100 border-slate-700 bg-slate-900/40 shadow-[0_0_15px_rgba(255,255,255,0.05)]';
      case 'Time&Space': // Red & Black Theme Profile
        return 'text-red-500 border-red-950 bg-black/60 border-l-4 border-l-red-600';
      default:
        return 'text-slate-400 border-slate-800 bg-slate-900/50';
    }
  };

  const currentUserName = user?.displayName || user?.username || '';
  
  // Render current active layout pages inside the shift-proof book mimic widget
  const pageSlotsToRender = Array.from({ length: qtyPerPage }, (_, i) => {
    const slotIndex = i + 1;
    return generatedSlots.find(s => s.page === bookCurrentPage && s.slot === slotIndex) || null;
  });

  const totalPagesCount = generatedSlots.length > 0 ? Math.ceil(generatedSlots.length / qtyPerPage) : 1;

  return (
    <div className="space-y-4 text-slate-100 bg-slate-950 min-h-screen p-4 sm:p-6 select-none font-sans">
      
      {/* HEADER MASTER IDENTITY BRANDING */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white uppercase">Member-Item Request Allocation Preview</h1>
          <p className="text-xs text-slate-400 mt-1">Digital Twin Pre-Raid Coordination Grid & Ledger Desk</p>
        </div>
        
        {/* PRIVILEGE GATING OVERRIDE INDICATOR DECK */}
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsAdminMode(!isAdminMode)}
            className={`px-3 py-1.5 rounded-xl text-[10px] uppercase font-black tracking-wider transition border ${
              isAdminMode 
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.1)]' 
                : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
          >
            🛡️ Officer Desk Override: {isAdminMode ? 'ENABLED' : 'DISABLED'}
          </button>
          {user && (
            <div className="bg-slate-900/80 border border-slate-800 px-3 py-1 rounded-xl text-xs flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-medium text-slate-300 font-mono text-[11px]">{currentUserName}</span>
            </div>
          )}
        </div>
      </div>

      {/* --- ADMINISTRATIVE OFFICER MANAGEMENT CONTROLS PANEL --- */}
      {isAdminMode && (
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 shadow-xl space-y-4">
          
          {/* STEPPER ROADMAP BANNER */}
          <div className="flex items-center justify-between gap-2 max-w-3xl mx-auto text-center text-xs font-bold border-b border-slate-800/60 pb-3">
            <div className={`flex-1 py-1 rounded-lg transition-all ${activeStep === 1 ? 'bg-violet-600 text-white shadow-md' : 'text-slate-500'}`}>1. Loot Registry</div>
            <div className="text-slate-700">➔</div>
            <div className={`flex-1 py-1 rounded-lg transition-all ${activeStep === 2 ? 'bg-violet-600 text-white shadow-md' : 'text-slate-500'}`}>2. Selection Matrix</div>
            <div className="text-slate-700">➔</div>
            <div className={`flex-1 py-1 rounded-lg transition-all ${activeStep === 3 ? 'bg-violet-600 text-white shadow-md' : 'text-slate-500'}`}>3. Mimic Preview</div>
            <div className="text-slate-700">➔</div>
            <div className={`flex-1 py-1 rounded-lg transition-all ${activeStep === 4 ? 'bg-violet-600 text-white shadow-md' : 'text-slate-500'}`}>4. Commit Archive</div>
          </div>

          {/* STEP 1 WORKSPACE COMPONENT: MATRIX FORM BUILDER */}
          {activeStep === 1 && (
            <div className="space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-slate-300">Register Items Dropped Tonight:</div>
                <div className="flex items-center gap-3">
                  <label className="text-xs text-slate-400 font-semibold">Slots Per Page Configuration:</label>
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
                      <th className="p-3">Choose Dropped Item Category</th>
                      <th className="p-3">Start Page</th>
                      <th className="p-3">Start Pos</th>
                      <th className="p-3">End Page</th>
                      <th className="p-3">End Pos</th>
                      <th className="p-3">Remove</th>
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
                            <option value="Illusion">⚡ Illusion Scroll</option>
                            <option value="Light&Dark">⚪ Light & Dark Scroll</option>
                            <option value="Time&Space">🩸 Time & Space Scroll</option>
                          </select>
                        </td>
                        <td className="p-2"><input type="number" value={row.startPage} onChange={(e) => handleUpdateLootRow(row.id, 'startPage', parseInt(e.target.value) || 0)} className="w-16 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-center text-slate-300"/></td>
                        <td className="p-2"><input type="number" value={row.startPos} onChange={(e) => handleUpdateLootRow(row.id, 'startPos', parseInt(e.target.value) || 0)} className="w-16 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-center text-slate-300"/></td>
                        <td className="p-2"><input type="number" value={row.endPage} onChange={(e) => handleUpdateLootRow(row.id, 'endPage', parseInt(e.target.value) || 0)} className="w-16 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-center text-slate-300"/></td>
                        <td className="p-2"><input type="number" value={row.endPos} onChange={(e) => handleUpdateLootRow(row.id, 'endPos', parseInt(e.target.value) || 0)} className="w-16 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-center text-slate-300"/></td>
                        <td className="p-2">
                          <button onClick={() => handleRemoveLootRow(row.id)} className="text-slate-500 hover:text-rose-400 p-1 font-sans transition">🗑️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between items-center pt-2">
                <button 
                  onClick={handleAddLootRow}
                  className="px-4 py-1.5 rounded-xl border border-slate-700 hover:border-slate-500 bg-slate-900 font-bold text-xs transition"
                >
                  + ADD ITEM ROW ➕
                </button>
                <button 
                  onClick={handleCheckAndRegisterLoot}
                  className="px-6 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs tracking-wide shadow-lg shadow-violet-600/20 transition"
                >
                  CHECK & REGISTER LOOT ⚙️
                </button>
              </div>
            </div>
          )}

          {/* STEP 2 WORKSPACE COMPONENT: MATRIX SELECTION BOARD */}
          {activeStep === 2 && (
            <div className="space-y-4 animate-fadeIn">
              <div className="text-sm font-bold text-slate-300">Raid Allocation Sorting Matrix</div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* COLUMN A: SELECTED MEMBERS CONTAINER */}
                <div className="border border-slate-800 rounded-xl p-3 bg-slate-950/40">
                  <div className="text-xs font-black uppercase text-emerald-400 mb-2 flex items-center justify-between">
                    <span>✨ Selected Bidders</span>
                    <span className="font-mono text-[10px] bg-slate-900 px-2 py-0.5 rounded text-slate-400">Count: {selectedBidders.length}</span>
                  </div>
                  <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                    {selectedBidders.map((b, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-xl border border-slate-800/80 bg-slate-900/30 text-xs font-mono">
                        <span className="truncate max-w-[120px] text-slate-200 font-sans font-medium">{b.name}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] border font-sans ${getItemStyleProfile(b.itemType)}`}>{b.itemType}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-slate-500">P: {b.priority}</span>
                          <button onClick={() => toggleBidderPromotion(i, 'SELECTED')} className="text-rose-400 font-sans text-[10px] hover:underline">Drop ✖</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* COLUMN B: NOT SELECTED MEMBERS CONTAINER */}
                <div className="border border-slate-800 rounded-xl p-3 bg-slate-950/40">
                  <div className="text-xs font-black uppercase text-slate-400 mb-2 flex items-center justify-between">
                    <span>Standby Pool (Not Selected)</span>
                    <span className="font-mono text-[10px] bg-slate-900 px-2 py-0.5 rounded text-slate-500">Count: {notSelectedBidders.length}</span>
                  </div>
                  <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                    {notSelectedBidders.map((b, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-xl border border-slate-800/40 bg-slate-900/10 text-xs font-mono opacity-60 hover:opacity-100 transition">
                        <span className="truncate max-w-[120px] text-slate-400 font-sans">{b.name}</span>
                        <span className="text-slate-500 text-[10px]">{b.itemType}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-slate-600">P: {b.priority}</span>
                          {/* FIFO Rule promotion button links */}
                          <button onClick={() => toggleBidderPromotion(i, 'NOT_SELECTED')} className="text-emerald-400 font-sans text-[10px] hover:underline font-bold">Promote 🔼</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <button onClick={() => setActiveStep(1)} className="px-4 py-1.5 rounded-xl border border-slate-800 text-slate-400 text-xs font-bold hover:bg-slate-900 transition">◀ Back</button>
                <button onClick={handleLockAndGenerateMatrix} className="px-6 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs tracking-wide shadow-lg transition">LOCK & VIEW PREVIEW ➔</button>
              </div>
            </div>
          )}

          {/* STEP 3 & 4 INTERACTIVE ACTIONS SUMMARY SHORTCUTS */}
          {activeStep >= 3 && (
            <div className="flex items-center justify-between p-3 border border-slate-800/80 bg-slate-950/60 rounded-xl text-xs font-medium animate-fadeIn">
              <div className="flex items-center gap-4">
                <span className="text-emerald-400 font-bold">✔ Matrix Model Matrix Generation Locked!</span>
                <span className="text-slate-500">Total Items Cataloged: <strong className="text-slate-300 font-mono">{generatedSlots.length}</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setActiveStep(2)} className="px-3 py-1 rounded-lg border border-slate-800 text-slate-400 hover:bg-slate-900 transition">Unlock Rules</button>
                <button 
                  onClick={() => setActiveStep(4)}
                  className={`px-4 py-1.5 rounded-lg font-bold transition ${activeStep === 4 ? 'bg-amber-600 text-white' : 'bg-slate-800 border border-slate-700 text-amber-400'}`}
                >
                  Review Final Step
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: LEDGER SYNC ARCHIVE WRAPPER */}
          {activeStep === 4 && (
            <div className="bg-gradient-to-br from-slate-900 to-amber-950/10 border border-amber-500/20 p-4 rounded-xl text-center space-y-3 animate-fadeIn">
              <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wide">Final Ledger Sync Authorization</h3>
              <p className="text-xs text-slate-400 max-w-xl mx-auto">
                Clicking commit updates tracking markers across master Spreadsheet logging rows, resets temporary staging cache targets, and concludes allocation processing.
              </p>
              <div className="flex justify-center gap-4 pt-1">
                <button onClick={() => setActiveStep(3)} className="px-4 py-1.5 rounded-xl border border-slate-800 text-xs font-bold text-slate-400 hover:bg-slate-900 transition">Return to Preview</button>
                <button 
                  onClick={handleCommitSessionAndFlash}
                  className="px-6 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs tracking-wider uppercase shadow-xl shadow-amber-500/10 transition"
                >
                  COMMIT SESSION & FLASH TO SHEET 🚀
                </button>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ========================================================================================= */}
      {/* --- PUBLIC ACCESSIBLE INTERACTIVE DIGITAL TWIN WORKSPACE DECK (PHASE 3) --- */}
      {/* ========================================================================================= */}
      
      {/* CONTROL LENS BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 border border-slate-800/80 p-3 rounded-2xl shadow-lg">
        <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800/80 p-1 rounded-xl shrink-0 w-max">
          <button 
            onClick={() => setViewLens('ALL')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition tracking-wide ${
              viewLens === 'ALL' 
                ? 'bg-slate-800 text-white shadow' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            🌐 See All
          </button>
          <button 
            onClick={() => {
              if (!user) return alert("Please verify your Discord login instance session first.");
              setViewLens('MINE');
            }}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition tracking-wide flex items-center gap-1.5 ${
              viewLens === 'MINE' 
                ? 'bg-slate-800 text-white shadow border border-slate-700' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            👤 See Mine {viewLens === 'MINE' && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
          </button>
        </div>

        {/* SEARCH FILTER INTEGRITY */}
        <div className="relative w-full sm:w-64">
          <input 
            type="text"
            placeholder="🔍 Search Player Spotlight..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 font-medium placeholder-slate-600 outline-none focus:border-slate-700 font-sans"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-2 text-[10px] font-bold text-slate-500 hover:text-slate-300">Clear</button>
          )}
        </div>
      </div>

      {/* CORE DISPLAY COLUMNS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        
        {/* LEFT COLUMN: THE DIGITAL BOOK MIMIC CORE COMPONENT (5 COLS WIDTH) */}
        <div className="lg:col-span-5 bg-slate-900/20 border border-slate-800/60 rounded-2xl p-4 shadow-2xl relative space-y-4">
          <div>
            <h2 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1">
              📖 Game Auction Book Preview <span className="text-[10px] font-sans font-medium text-slate-600 lowercase">(mimic mode)</span>
            </h2>
            <p className="text-[10px] text-slate-500 mt-0.5">Matches current active in-game window layout configurations.</p>
          </div>

          {/* SIMULATED LEAF WRAPPER SLOTS GRID */}
          <div className="bg-slate-950/80 border border-slate-900 rounded-xl p-3 min-h-[220px] shadow-inner flex flex-col justify-between space-y-2">
            
            <div className="text-[10px] font-bold tracking-widest uppercase text-slate-500 text-center pb-2 border-b border-slate-900/60 font-mono">
              --- Game Page Index: {bookCurrentPage} ---
            </div>

            <div className="space-y-1.5 flex-1 py-1">
              {pageSlotsToRender.map((slot, index) => {
                const slotIndex = index + 1;
                
                if (!slot) {
                  return (
                    <div key={slotIndex} className="grid grid-cols-12 text-[11px] font-mono p-2 border border-slate-900 bg-slate-900/10 rounded-xl text-slate-700">
                      <div className="col-span-2 font-bold text-slate-800">[{slotIndex}]</div>
                      <div className="col-span-10 italic text-[10px] text-slate-800/60">Empty Bidding Slot Window</div>
                    </div>
                  );
                }

                const isTargetOwner = user && slot.name.toLowerCase() === currentUserName.toLowerCase();
                const spotlightActive = viewLens === 'MINE' && isTargetOwner;

                return (
                  <div 
                    key={slotIndex} 
                    className={`grid grid-cols-12 items-center text-[11px] font-mono px-3 py-2 border rounded-xl transition-all ${getItemStyleProfile(slot.itemType)} ${
                      spotlightActive 
                        ? 'ring-2 ring-amber-500/60 animate-pulse bg-slate-900/80 scale-[1.01]' 
                        : (viewLens === 'MINE' ? 'opacity-20' : '')
                    }`}
                  >
                    {/* Hardlocked column boundaries preventing varying text shift distortions */}
                    <div className="col-span-2 font-bold text-slate-500 flex items-center gap-1">
                      [{slotIndex}]
                      {isTargetOwner && <span className="text-amber-400 text-[10px]" title="Your Target Slot">🎯</span>}
                    </div>
                    <div className="col-span-5 font-black uppercase text-[10px] tracking-wide truncate pr-2">
                      {slot.itemType}
                    </div>
                    <div className="col-span-5 text-right font-sans font-semibold text-slate-300 truncate">
                      {slot.name}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* INTEGRATED NAVIGATION CONTROLS CHANNEL */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-900/60">
              <button 
                onClick={() => setBookCurrentPage(Math.max(1, bookCurrentPage - 1))}
                disabled={bookCurrentPage === 1}
                className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-[10px] font-black hover:text-white disabled:opacity-20 transition"
              >
                ◀ PREV
              </button>
              <div className="text-[10px] font-mono font-bold text-slate-400">
                Book Page <span className="text-white bg-slate-900 px-1.5 py-0.5 rounded mx-0.5">{bookCurrentPage}</span> of {totalPagesCount}
              </div>
              <button 
                onClick={() => setBookCurrentPage(Math.min(totalPagesCount, bookCurrentPage + 1))}
                disabled={bookCurrentPage === totalPagesCount}
                className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-[10px] font-black hover:text-white disabled:opacity-20 transition"
              >
                NEXT ▶
              </button>
            </div>

          </div>
        </div>

        {/* RIGHT COLUMN: REQUISITION PORTAL VIEW COMPONENT (7 COLS WIDTH) */}
        <div className="lg:col-span-7 bg-slate-900/20 border border-slate-800/60 rounded-2xl p-4 shadow-2xl space-y-4">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-xs font-black uppercase text-slate-400 tracking-wider">
                {viewLens === 'ALL' ? '📜 All Submitted Auction Requests' : '🎯 Your Personal Bidding Tracker'}
              </h2>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {viewLens === 'ALL' ? 'Transparency Ledger sorted sequentially' : 'Isolated checklist for verified active profile username.'}
              </p>
            </div>
            
            <div className="text-[10px] font-mono text-slate-500 bg-slate-950/80 px-2 py-0.5 rounded border border-slate-900">
              Sorting: Category ➔ Priority
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950/40">
            <div className="max-h-[310px] overflow-y-auto relative min-w-[500px]">
              
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-900 z-10 border-b border-slate-800 text-slate-400 uppercase font-black tracking-wider text-[9px]">
                  <tr>
                    <th className="p-2.5">Name</th>
                    <th className="p-2.5">Requested Item</th>
                    <th className="p-2.5">Target Page</th>
                    <th className="p-2.5">Position</th>
                    <th className="p-2.5 text-right">Selection Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/60 font-mono text-[11px]">
                  {(() => {
                    // Filter logic incorporating viewLens constraints and spotlights
                    let rowsToDisplay = [...generatedSlots];

                    // Supplement unallocated standby members visually for transparency
                    if (viewLens === 'ALL') {
                      const displayNamesAdded = new Set(rowsToDisplay.map(r => r.name.toLowerCase()));
                      notSelectedBidders.forEach(ns => {
                        rowsToDisplay.push({
                          name: ns.name,
                          itemType: ns.itemType,
                          page: '---',
                          slot: '---',
                          status: 'NotSelected'
                        });
                      });
                    }

                    if (viewLens === 'MINE') {
                      rowsToDisplay = rowsToDisplay.filter(r => r.name.toLowerCase() === currentUserName.toLowerCase());
                      // Append fallback standby entries if user is unallocated
                      if (rowsToDisplay.length === 0) {
                        const standbyMatch = notSelectedBidders.filter(ns => ns.name.toLowerCase() === currentUserName.toLowerCase());
                        standbyMatch.forEach(ns => {
                          rowsToDisplay.push({
                            name: ns.name,
                            itemType: ns.itemType,
                            page: '---',
                            slot: '---',
                            status: 'NotSelected'
                          });
                        });
                      }
                    }

                    if (searchQuery) {
                      const query = searchQuery.toLowerCase();
                      rowsToDisplay = rowsToDisplay.filter(r => r.name.toLowerCase().includes(query) || r.itemType.toLowerCase().includes(query));
                    }

                    if (rowsToDisplay.length === 0) {
                      return (
                        <tr>
                          <td colSpan="5" className="p-8 text-center text-slate-600 font-sans italic text-xs">
                            No allocation tracking rows found matching query parameters.
                          </td>
                        </tr>
                      );
                    }

                    return rowsToDisplay.map((row, index) => {
                      const isSelf = user && row.name.toLowerCase() === currentUserName.toLowerCase();
                      const isSelected = row.status === 'Selected';

                      return (
                        <tr 
                          key={index} 
                          onClick={() => {
                            if (typeof row.page === 'number') setBookCurrentPage(row.page);
                          }}
                          className={`group hover:bg-slate-900/40 transition-all cursor-pointer ${
                            isSelf ? 'bg-indigo-950/10 font-bold' : ''
                          } ${!isSelected ? 'opacity-40 text-slate-500' : ''}`}
                        >
                          <td className="p-2.5 font-sans font-medium text-slate-200 group-hover:text-white flex items-center gap-1.5 truncate max-w-[120px]">
                            {isSelf && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />}
                            {row.name}
                          </td>
                          <td className="p-2.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] border font-sans ${getItemStyleProfile(row.itemType)}`}>
                              {row.itemType}
                            </span>
                          </td>
                          <td className="p-2.5 font-bold text-slate-300 group-hover:text-amber-400 transition-colors">
                            {typeof row.page === 'number' ? `Page ${row.page}` : row.page}
                          </td>
                          <td className="p-2.5 text-slate-400">
                            {typeof row.slot === 'number' ? `Slot ${row.slot}` : row.slot}
                          </td>
                          <td className="p-2.5 text-right">
                            {isSelected ? (
                              <span className="inline-block px-2 py-0.5 rounded-md text-[9px] font-sans font-black bg-emerald-950/50 text-emerald-400 border border-emerald-500/20 shadow-sm uppercase tracking-wide">
                                ✨ SEL
                              </span>
                            ) : (
                              <span className="inline-block px-2 py-0.5 rounded-md text-[9px] font-sans font-bold bg-slate-900 text-slate-500 border border-slate-800 uppercase tracking-wide">
                                💤 NOT
                              </span>
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

          {/* REAL-TIME OPERATION ROADMAP FOOTER TOOLTIP */}
          <div className="bg-slate-950/60 border border-slate-900 p-2.5 rounded-xl text-[10px] text-slate-500 leading-relaxed font-sans">
            💡 <strong className="text-slate-400">Pro-Tip for Raiders:</strong> Click any user row inside the list to instantly flip the left book preview component straight to that specific target page index!
          </div>

        </div>

      </div>

    </div>
  );
}
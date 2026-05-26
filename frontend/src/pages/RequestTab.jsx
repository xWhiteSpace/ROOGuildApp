import { useState, useEffect } from 'react';

const backendUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';

export default function RequestTab() {
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState({ name: '', date: '' });
  const [items, setItems] = useState([]);
  const [liveCounts, setLiveCounts] = useState({});
  const [localSelections, setLocalSelections] = useState({});
  const [authError, setAuthError] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);

  // ⏳ Zero-Layout-Shift Overlays & Timeline State Hooks
  const [isGateOpen, setIsGateOpen] = useState(true);
  const [statusMessage, setStatusMessage] = useState('');
  const [currentPhase, setCurrentPhase] = useState(1);
  const [rankingsByItem, setRankingsByItem] = useState({});
  const [isListModalOpen, setIsListModalOpen] = useState(false);
  const [activeListTab, setActiveListTab] = useState('Puppet');

  const initLobbyDashboard = async () => {
    try {
      setLoading(true);
      setAuthError(false);

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

      if (res.status === 401) {
        setAuthError(true);
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (data.success) {
        setItems(data.items);
        setLiveCounts(data.liveCounts);
        setUserData({ name: data.displayName, date: data.date });
        
        if (data.isGateOpen !== undefined) setIsGateOpen(data.isGateOpen);
        if (data.nextStatusChangeMessage) setStatusMessage(data.nextStatusChangeMessage);
        if (data.currentPhase !== undefined) setCurrentPhase(data.currentPhase);
        if (data.rankingsByItem) setRankingsByItem(data.rankingsByItem);

        const blankInputs = {};
        data.items.forEach(item => { blankInputs[item.name] = 0; });
        setLocalSelections(blankInputs);
      }
    } catch (err) {
      console.error("Connection link offline:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    initLobbyDashboard();
  }, []);

  const adjustCounter = (itemName, direction, maxQty, currentActive) => {
    if (!isGateOpen) return; 
    const currentInput = localSelections[itemName] || 0;
    if (direction === 'up' && currentActive + currentInput < maxQty) {
      setLocalSelections(prev => ({ ...prev, [itemName]: currentInput + 1 }));
    } else if (direction === 'down' && currentInput > 0) {
      setLocalSelections(prev => ({ ...prev, [itemName]: currentInput - 1 }));
    }
  };

  const handleBatchSubmitRequests = async () => {
    if (!isGateOpen) return; 
    const batchPayload = {};
    let activeItemsCount = 0;

    items.forEach(item => {
      const selectedQty = localSelections[item.name] || 0;
      if (selectedQty > 0) {
        batchPayload[item.name] = selectedQty;
        activeItemsCount++;
      }
    });

    if (activeItemsCount === 0) return;

    try {
      setProcessing(true);
      const savedUserSession = localStorage.getItem('dynasty_raid_session');
      const customHeaders = { 'Content-Type': 'application/json' };
      if (savedUserSession) {
        customHeaders['x-user-profile'] = encodeURIComponent(savedUserSession);
      }

      const res = await fetch(`${backendUrl}/api/requests/submit`, {
        method: 'POST',
        headers: customHeaders,
        body: JSON.stringify({ selections: batchPayload }),
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        await initLobbyDashboard();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setProcessing(false);
    }
  };

  const handleExecuteCancel = async (itemName, activeQty) => {
    if (!isGateOpen) return; 
    try {
      setProcessing(true);
      const savedUserSession = localStorage.getItem('dynasty_raid_session');
      const customHeaders = { 'Content-Type': 'application/json' };
      if (savedUserSession) {
        customHeaders['x-user-profile'] = encodeURIComponent(savedUserSession);
      }

      const res = await fetch(`${backendUrl}/api/requests/cancel`, {
        method: 'POST',
        headers: customHeaders,
        body: JSON.stringify({ itemName, cancelQty: activeQty }),
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        setIsCancelModalOpen(false);
        await initLobbyDashboard();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setProcessing(false);
    }
  };

  if (authError) {
    return (
      <div className="mx-auto max-w-md p-8 text-center text-white border border-slate-800 bg-slate-900 rounded-2xl mt-12">
        <h2 className="text-lg font-bold text-rose-400 mb-2">Authentication Required</h2>
        <p className="text-xs text-slate-400">Please use the login portal to authorize your guild roster token profile.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400 font-medium animate-pulse">
        Reading historical priority allocations from spreadsheet...
      </div>
    );
  }

  const activeCancelableItems = items.filter(item => (liveCounts[item.name] || 0) > 0);
  const totalStagedInCart = Object.values(localSelections).reduce((sum, val) => sum + val, 0);
  const currentRosterList = rankingsByItem[activeListTab] || [];

  return (
    <div className="mx-auto max-w-6xl p-6 text-white pb-32 relative">
      
      <div className="mb-8 flex flex-col justify-between gap-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-6 md:flex-row md:items-center">
        <div className="flex-1">
          <h1 className="text-xl font-bold tracking-tight text-slate-100">Advance Request Deck</h1>
          <div className="text-xs text-slate-400 mt-1 space-x-4">
            <span>User: <strong className="text-indigo-400">{userData.name}</strong></span>
            <span>Date: <strong className="text-slate-300">{userData.date}</strong></span>
          </div>

          {/* ⏳ INLINE COMPACT HORIZONTAL TIMELINE PROCESS STEPS (3 PHASES ONLY) */}
          <div className="mt-4 pt-3 border-t border-slate-800/60 flex flex-wrap items-center gap-y-2 gap-x-4 text-[10px] font-bold tracking-wider uppercase text-slate-500">
            <span className="text-slate-400 normal-case font-black border-r border-slate-800 pr-3 mr-1">Bidding Cycle:</span>
            <div className={`flex items-center gap-1.5 ${currentPhase === 1 ? 'text-indigo-400 font-extrabold' : ''}`}>
              <span className={`h-2 w-2 rounded-full ${currentPhase === 1 ? 'bg-indigo-400 shadow-[0_0_6px_rgba(99,102,241,0.8)] animate-pulse' : 'bg-slate-800'}`}></span>
              Phase 1: Bid Request Open
            </div>
            <span className="text-slate-700 hidden sm:inline">➔</span>
            <div className={`flex items-center gap-1.5 ${currentPhase === 2 ? 'text-indigo-400 font-extrabold' : ''}`}>
              <span className={`h-2 w-2 rounded-full ${currentPhase === 2 ? 'bg-indigo-400 shadow-[0_0_6px_rgba(99,102,241,0.8)] animate-pulse' : 'bg-slate-800'}`}></span>
              Phase 2: Bid Request Locked
            </div>
            <span className="text-slate-700 hidden sm:inline">➔</span>
            <div className={`flex items-center gap-1.5 ${currentPhase === 3 ? 'text-indigo-400 font-extrabold' : ''}`}>
              <span className={`h-2 w-2 rounded-full ${currentPhase === 3 ? 'bg-indigo-400 shadow-[0_0_6px_rgba(99,102,241,0.8)] animate-pulse' : 'bg-slate-800'}`}></span>
              Phase 3: Event + Live Auction
            </div>
          </div>

          {!isGateOpen && statusMessage && (
            <div className="text-xs font-semibold text-amber-500 mt-3 flex items-center gap-1">
              <span>🔒</span> {statusMessage}
            </div>
          )}
        </div>

        {/* HEADER CONTROLS COLUMN ROW BUTTONS */}
        <div className="flex flex-col sm:flex-row md:flex-col lg:flex-row gap-2">
          <button
            onClick={() => setIsListModalOpen(true)}
            className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 px-4 py-2 text-xs font-semibold text-indigo-400 transition hover:bg-indigo-600 hover:text-white cursor-pointer"
          >
            📋 View Request List
          </button>
          <button
            onClick={() => setIsCancelModalOpen(true)}
            disabled={!isGateOpen}
            className="rounded-xl border border-rose-500/30 bg-rose-950/20 px-4 py-2 text-xs font-semibold text-rose-400 transition hover:bg-rose-500 hover:text-white disabled:opacity-20 disabled:border-slate-800 disabled:bg-slate-900/40 disabled:text-slate-600"
          >
            Cancel Existing Request
          </button>
        </div>
      </div>

      {/* ORIGINAL RESPONSIVE CARDS GRID (100% STYLE PRESERVED) */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(item => {
          const currentActive = liveCounts[item.name] || 0;
          const localInput = localSelections[item.name] || 0;
          const combinedTotal = currentActive + localInput;

          return (
            <div key={item.name} className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-lg">
              <div className="flex items-start justify-between">
                <h3 className="text-md font-bold text-slate-200">{item.name}</h3>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${currentActive > 0 ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-800 text-slate-500'}`}>
                  {currentActive > 0 ? `${currentActive} Saved` : 'Idle'}
                </span>
              </div>

              <div className="my-6 flex items-center justify-center gap-4">
                <button
                  onClick={() => adjustCounter(item.name, 'down')}
                  disabled={localInput === 0 || processing || !isGateOpen}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 font-bold hover:bg-slate-700 disabled:opacity-20"
                >
                  -
                </button>
                <div className="text-center">
                  <span className="text-2xl font-black">{combinedTotal}</span>
                  <span className="mx-1 text-slate-600">/</span>
                  <span className="text-xs text-slate-500">{item.maxQty} Max</span>
                </div>
                <button
                  onClick={() => adjustCounter(item.name, 'up', item.maxQty, currentActive)}
                  disabled={combinedTotal >= item.maxQty || processing || !isGateOpen}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 font-bold hover:bg-slate-700 disabled:opacity-20"
                >
                  +
                </button>
              </div>

              <div className="mt-auto border-t border-slate-800/60 pt-3 text-[11px] text-slate-400 space-y-1.5">
                <div className="flex justify-between">
                  <span>Application Status:</span>
                  <span className={currentActive > 0 ? 'text-indigo-400 font-bold' : 'text-slate-600'}>
                    {currentActive > 0 ? 'Active' : 'Not Applied'}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span>Added to Basket:</span>
                  <span className={localInput > 0 ? 'text-emerald-400 font-bold' : 'text-slate-600'}>
                    {localInput > 0 ? `+${localInput}` : '0'}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span>Selection Status:</span>
                  <span className={currentActive > 0 ? 'text-amber-400 font-medium' : 'text-slate-600'}>
                    {currentActive > 0 ? 'Pending' : '-'}
                  </span>
                </div>
              </div>

            </div>
          );
        })}
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-slate-800 bg-slate-950/90 backdrop-blur-md p-4 z-40">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs text-slate-400">Review Basket Changes</span>
            <span className="text-sm font-bold text-slate-100">
              {!isGateOpen ? 'Submission Closed' : totalStagedInCart > 0 ? `🛒 ${totalStagedInCart} request choices modified` : 'No items adjusted yet'}
            </span>
          </div>
          <button
            onClick={handleBatchSubmitRequests}
            disabled={totalStagedInCart === 0 || processing || !isGateOpen}
            className="rounded-xl bg-indigo-600 px-6 py-2.5 text-xs font-bold text-white transition hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 shadow-lg"
          >
            {!isGateOpen ? 'Roster Locked' : processing ? 'Processing Order...' : 'Confirm & Submit All Requests'}
          </button>
        </div>
      </div>

      {/* 📋 DYNAMIC MODAL OVERLAY BOX FOR THE REQUEST ROSTER LOOKUPS */}
      {isListModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <h2 className="text-md font-bold text-slate-200">Request List</h2>
            <p className="text-[11px] text-slate-400 mt-0.5 mb-4">View currently queued player request hierarchies sorted item by item.</p>

            {/* Dynamic Navigation Filter Tabs */}
            <div className="flex flex-wrap gap-1 mb-4 bg-slate-950 p-1 rounded-xl border border-slate-800/60">
              {items.map(item => (
                <button
                  key={item.name}
                  onClick={() => setActiveListTab(item.name)}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-[10px] font-black tracking-tight transition cursor-pointer ${
                    activeListTab === item.name 
                      ? 'bg-indigo-600 text-white shadow' 
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  {item.name}
                </button>
              ))}
            </div>

            {/* Locked vertical scroll field height box container */}
            <div className="max-h-[260px] overflow-y-auto text-xs font-mono font-medium space-y-1 scrollbar-thin pr-1 bg-slate-950/40 rounded-xl p-2 border border-slate-800/40">
              {currentRosterList.length === 0 ? (
                <p className="text-slate-600 italic py-6 text-center text-[11px]">1. No request filed yet.</p>
              ) : (
                currentRosterList.map((playerName, idx) => {
                  const labelNum = String(idx + 1).padStart(2, '0');
                  return (
                    <div key={playerName} className="flex items-center justify-between border-b border-slate-900/60 py-2 px-2 hover:bg-slate-900/60 rounded-lg transition">
                      <span className="text-slate-300">
                        <span className="text-slate-600 mr-2 font-bold">{labelNum}.</span>
                        {playerName}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button 
                onClick={() => setIsListModalOpen(false)} 
                className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-2 text-xs font-semibold hover:bg-slate-700 transition cursor-pointer"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ORIGINAL ACTIVE CANCEL MODAL ENGINE */}
      {isCancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl">
            <h2 className="text-md font-bold text-slate-200">Ongoing Active Requests</h2>
            <p className="text-[11px] text-slate-400 mt-0.5 mb-4">Select an item row block position below to undo your advance request.</p>

            {activeCancelableItems.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center italic">You have no active pending requests currently in queue.</p>
            ) : (
              <div className="space-y-2">
                {activeCancelableItems.map(item => (
                  <div key={item.name} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/40 p-2.5">
                    <div>
                      <div className="text-xs font-bold text-slate-300">{item.name}</div>
                      <div className="text-[10px] text-indigo-400">Allocated Balance: {liveCounts[item.name]}</div>
                    </div>
                    <button
                      onClick={() => handleExecuteCancel(item.name, liveCounts[item.name])}
                      disabled={processing || !isGateOpen}
                      className="rounded-lg bg-rose-500/10 px-3 py-1.5 text-[10px] font-bold text-rose-400 hover:bg-rose-600 hover:text-white disabled:opacity-20 disabled:bg-slate-800 disabled:text-slate-600"
                    >
                      Cancel Request
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <button onClick={() => setIsCancelModalOpen(false)} className="rounded-lg bg-slate-800 px-4 py-1.5 text-xs font-semibold hover:bg-slate-700">
                Return to Lobby
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
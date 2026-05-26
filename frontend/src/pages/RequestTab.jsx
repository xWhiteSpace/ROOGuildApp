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

  // ⏳ Time-lock & Request List Integration Hooks
  const [isGateOpen, setIsGateOpen] = useState(true);
  const [statusMessage, setStatusMessage] = useState('');
  const [currentPhase, setCurrentPhase] = useState(1);
  const [rankingsByItem, setRankingsByItem] = useState({});
  const [phaseIntervals, setPhaseIntervals] = useState({ phase1: '', phase2: '', phase3: '' });
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
        if (data.phaseIntervals) setPhaseIntervals(data.phaseIntervals);

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
        body: JSON.stringify({ selections: batchPayload }), 
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
      
      <div className="mb-8 flex flex-col justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-6 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-100">Advance Request Deck</h1>
          <div className="text-xs text-slate-400 mt-1 space-x-4">
            <span>User: <strong className="text-indigo-400">{userData.name}</strong></span>
            <span>Date: <strong className="text-slate-300">{userData.date}</strong></span>
          </div>
          {!isGateOpen && statusMessage && (
            <div className="text-xs font-semibold text-amber-500 mt-2">
              🔒 {statusMessage}
            </div>
          )}
        </div>
        <button
          onClick={() => setIsCancelModalOpen(true)}
          disabled={!isGateOpen}
          className="rounded-xl border border-rose-500/30 bg-rose-950/20 px-4 py-2 text-xs font-semibold text-rose-400 transition hover:bg-rose-500 hover:text-white disabled:opacity-20 disabled:border-slate-800 disabled:bg-slate-900/40 disabled:text-slate-600"
        >
          Cancel Existing Request
        </button>
      </div>

      {/* 🛠️ ASYMMETRIC GRID WORKSPACE (Left Sideboards + Right Core Cards) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* PANEL ROW TRACK: Sidebars occupy 4 out of 12 columns */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* ⏳ TIMELINE PHASE FLOW TREE CONTAINER (DYNAMIC INTERVALS INJECTED) */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-lg">
            <h2 className="text-xs font-black uppercase text-slate-400 tracking-wider mb-4">Bidding Cycle</h2>
            <div className="space-y-4 font-sans relative pl-2">
              <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-slate-800"></div>
              
              {/* NODE 1 */}
              <div className="flex items-start gap-4 relative">
                <div className={`z-10 flex h-4 w-4 items-center justify-center rounded-full border-2 mt-0.5 ${
                  currentPhase === 1 ? 'border-indigo-500 bg-indigo-950 shadow-[0_0_8px_rgba(99,102,241,0.6)]' : 'border-slate-700 bg-slate-950'
                }`}>
                  {currentPhase > 1 && <div className="h-1.5 w-1.5 rounded-full bg-slate-600" />}
                  {currentPhase === 1 && <div className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-ping" />}
                </div>
                <div className="flex flex-col">
                  <span className={`text-xs font-bold ${currentPhase === 1 ? 'text-indigo-400' : 'text-slate-500'}`}>Phase 1: Bid Request Open</span>
                  <span className="text-[10px] font-normal text-slate-500 mt-0.5 tracking-wide">
                    {phaseIntervals.phase1 || 'Pending Load...'}
                  </span>
                </div>
              </div>

              {/* NODE 2 */}
              <div className="flex items-start gap-4 relative">
                <div className={`z-10 flex h-4 w-4 items-center justify-center rounded-full border-2 mt-0.5 ${
                  currentPhase === 2 ? 'border-indigo-500 bg-indigo-950 shadow-[0_0_8px_rgba(99,102,241,0.6)]' : 'border-slate-700 bg-slate-950'
                }`}>
                  {currentPhase > 2 && <div className="h-1.5 w-1.5 rounded-full bg-slate-600" />}
                  {currentPhase === 2 && <div className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-ping" />}
                </div>
                <div className="flex flex-col">
                  <span className={`text-xs font-bold ${currentPhase === 2 ? 'text-indigo-400' : 'text-slate-500'}`}>Phase 2: Bid Request Locked</span>
                  <span className="text-[10px] font-normal text-slate-500 mt-0.5 tracking-wide">
                    {phaseIntervals.phase2 || 'Pending Load...'}
                  </span>
                </div>
              </div>

              {/* NODE 3 */}
              <div className="flex items-start gap-4 relative">
                <div className={`z-10 flex h-4 w-4 items-center justify-center rounded-full border-2 mt-0.5 ${
                  currentPhase === 3 ? 'border-indigo-500 bg-indigo-950 shadow-[0_0_8px_rgba(99,102,241,0.6)]' : 'border-slate-700 bg-slate-950'
                }`}>
                  {currentPhase === 3 && <div className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-ping" />}
                </div>
                <div className="flex flex-col">
                  <span className={`text-xs font-bold ${currentPhase === 3 ? 'text-indigo-400' : 'text-slate-500'}`}>Phase 3: Event + Live Auction</span>
                  <span className="text-[10px] font-normal text-slate-500 mt-0.5 tracking-wide">
                    {phaseIntervals.phase3 || 'Pending Load...'}
                  </span>
                </div>
              </div>

            </div>
          </div>

          {/* 📋 SCROLLABLE REQUEST LIST COMPONENT */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-lg">
            <h2 className="text-xs font-black uppercase text-slate-400 tracking-wider mb-3">Request List</h2>
            
            {/* Dynamic Category Selector Navigation Pills */}
            <div className="flex flex-wrap gap-1 mb-4 border-b border-slate-800 pb-2.5">
              {items.map(item => (
                <button
                  key={item.name}
                  onClick={() => setActiveListTab(item.name)}
                  className={`rounded-lg px-2.5 py-1 text-[10px] font-black tracking-tight transition ${
                    activeListTab === item.name 
                      ? 'bg-indigo-600 text-white shadow' 
                      : 'bg-slate-950 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  {item.name}
                </button>
              ))}
            </div>

            {/* Strict height wrapper scroll context list box */}
            <div className="h-[240px] overflow-y-auto pr-1 text-xs font-mono font-medium space-y-1 scrollbar-thin">
              {currentRosterList.length === 0 ? (
                <div className="text-slate-600 italic py-4 pl-1">1. No request filed yet.</div>
              ) : (
                currentRosterList.map((playerName, index) => {
                  const positionLabel = String(index + 1).padStart(2, '0');
                  return (
                    <div key={playerName} className="flex items-center justify-between border-b border-slate-800/40 py-1.5 pl-1 hover:bg-slate-950/40 rounded transition">
                      <span className="text-slate-300">
                        <span className="text-slate-600 mr-2">{positionLabel}.</span>
                        {playerName}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

        {/* CARDS REGISTRATION DECK: Consume the remaining 8 out of 12 desktop grid tracks */}
        <div className="lg:col-span-8">
          <div className="grid gap-6 grid-cols-1 sm:grid-cols-2">
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
        </div>

      </div>

      {/* FOOTER CONFIRMATION BAR BARRIER */}
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

      {/* COUNTER BALANCE CANCELLATION MODAL ENGINE */}
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
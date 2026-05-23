import { useState, useEffect } from 'react';

const backendUrl = import.meta.env.VITE_BACKEND_API_URL || `http://${window.location.hostname}:5001`;

export default function RequestTab() {
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState({ name: '', date: '' });
  const [items, setItems] = useState([]);
  const [liveCounts, setLiveCounts] = useState({});
  const [localSelections, setLocalSelections] = useState({});

  // 🔒 This attaches the secure token so the backend doesn't say "Not Authenticated"
  const getAuthHeader = () => {
    const storedUser = localStorage.getItem('dynasty_raid_session');
    return storedUser ? encodeURIComponent(storedUser) : '';
  };

  const initPhase2Lobby = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${backendUrl}/api/requests/init`, {
        headers: { 'X-Authorized-User': getAuthHeader() }
      });
      const data = await res.json();
      
      if (data.success) {
        setItems(data.items);
        setLiveCounts(data.liveCounts);
        setUserData({ name: data.displayName, date: data.date });
        
        // Initialize interactive inputs at 0
        const blankInputs = {};
        data.items.forEach(item => { blankInputs[item.name] = 0; });
        setLocalSelections(blankInputs);
      } else {
        console.error("Backend rejected request context:", data.error);
      }
    } catch (err) {
      console.error("Failed to connect to Phase 1 entry point:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    initPhase2Lobby();
  }, []);

  const adjustCounter = (itemName, direction, maxQty, currentActive) => {
    const currentInput = localSelections[itemName] || 0;
    if (direction === 'up' && currentActive + currentInput < maxQty) {
      setLocalSelections(prev => ({ ...prev, [itemName]: currentInput + 1 }));
    } else if (direction === 'down' && currentInput > 0) {
      setLocalSelections(prev => ({ ...prev, [itemName]: currentInput - 1 }));
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400 font-medium animate-pulse">
        Fetching live item allocations from spreadsheet...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-6 text-white">
      
      {/* Top Automated Information Bar */}
      <div className="mb-8 flex flex-col justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-6 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-100">Advance Request Deck</h1>
          <div className="text-xs text-slate-400 mt-1 space-x-4">
            <span>User: <strong className="text-indigo-400">{userData.name}</strong></span>
            <span>Date: <strong className="text-slate-300">{userData.date}</strong></span>
          </div>
        </div>
        <button className="rounded-xl border border-rose-500/30 bg-rose-950/20 px-4 py-2 text-xs font-semibold text-rose-400 opacity-40 cursor-not-allowed">
          Cancel Existing Request (Phase 4)
        </button>
      </div>

      {/* Item Display Grid */}
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
                  {currentActive > 0 ? 'Requested' : 'Idle'}
                </span>
              </div>

              {/* Interactive Counter Block */}
              <div className="my-6 flex items-center justify-center gap-4">
                <button
                  onClick={() => adjustCounter(item.name, 'down')}
                  disabled={localInput === 0}
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
                  disabled={combinedTotal >= item.maxQty}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 font-bold hover:bg-slate-700 disabled:opacity-20"
                >
                  +
                </button>
              </div>

              {/* Status Section */}
              <div className="mt-auto border-t border-slate-800/60 pt-3 text-[11px] text-slate-400 space-y-1.5">
                <div className="flex justify-between">
                  <span>Application Status:</span>
                  <span className={currentActive > 0 ? 'text-indigo-400 font-bold' : 'text-slate-600'}>
                    {currentActive > 0 ? 'Requested' : 'Not Applied'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Selection Status:</span>
                  <span className={currentActive > 0 ? 'text-amber-400 font-medium' : 'text-slate-600'}>
                    {currentActive > 0 ? 'Pending' : '-'}
                  </span>
                </div>
              </div>

              <button disabled className="mt-4 w-full rounded-xl bg-slate-800 py-2 text-xs font-bold text-slate-500 cursor-not-allowed">
                Submit Button (Phase 3)
              </button>
            </div>
          );
        })}
      </div>

    </div>
  );
}
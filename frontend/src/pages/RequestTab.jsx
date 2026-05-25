import React, { useState, useEffect } from 'react';

export default function RequestTab() {
  const [displayName, setDisplayName] = useState('');
  const [serverDate, setServerDate] = useState('');
  const [items, setItems] = useState([]);
  const [liveCounts, setLiveCounts] = useState({});
  const [formSelections, setFormSelections] = useState({});
  const [loading, setLoading] = useState(true);
  const [actionStatus, setActionStatus] = useState({ type: '', text: '' });
  
  // ⏳ Window Gate Lockout State Hooks
  const [isGateOpen, setIsGateOpen] = useState(true);
  const [sessionLabel, setSessionLabel] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  const backendUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';

  useEffect(() => {
    fetchInitialRosterData();
  }, []);

  const fetchInitialRosterData = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${backendUrl}/api/requests/init`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setDisplayName(data.displayName);
        setServerDate(data.date);
        setItems(data.items);
        setLiveCounts(data.liveCounts);
        setIsGateOpen(data.isGateOpen);
        setSessionLabel(data.currentSessionLabel);
        setStatusMessage(data.nextStatusChangeMessage);

        const initialForm = {};
        data.items.forEach(i => { initialForm[i.name] = 0; });
        setFormSelections(initialForm);
      }
    } catch (err) {
      setActionStatus({ type: 'error', text: 'Failed to balance initial session state components.' });
    } finally {
      setLoading(false);
    }
  };

  const updateQuantitySelection = (itemName, adjustment, maxLimit) => {
    if (!isGateOpen) return; // Block input logic mutations if window closed
    const currentVal = formSelections[itemName] || 0;
    const nextVal = currentVal + adjustment;
    if (nextVal >= 0 && nextVal <= maxLimit) {
      setFormSelections({ ...formSelections, [itemName]: nextVal });
    }
  };

  const processSubmitRequisition = async () => {
    if (!isGateOpen) return;
    setActionStatus({ type: 'working', text: 'Transmitting secure allocation requests...' });
    try {
      const response = await fetch(`${backendUrl}/api/requests/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selections: formSelections }),
        credentials: 'include'
      });
      const data = await response.json();
      if (response.ok) {
        setActionStatus({ type: 'success', text: 'Requests registered onto staging ledger successfully.' });
        fetchInitialRosterData();
      } else {
        setActionStatus({ type: 'error', text: data.error || 'Request routing failed.' });
      }
    } catch (err) {
      setActionStatus({ type: 'error', text: 'Network handshake dropped during execution.' });
    }
  };

  const executeCancellationRequest = async (itemName, currentBasketQty) => {
    if (!isGateOpen || currentBasketQty <= 0) return;
    if (!window.confirm(`Cancel your current basket selection for ${itemName}?`)) return;

    setActionStatus({ type: 'working', text: 'Transmitting balancing counter-ledger entries...' });
    try {
      const response = await fetch(`${backendUrl}/api/requests/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemName, cancelQty: currentBasketQty }),
        credentials: 'include'
      });
      const data = await response.json();
      if (response.ok) {
        setActionStatus({ type: 'success', text: 'Basket configuration cleanly canceled.' });
        fetchInitialRosterData();
      } else {
        setActionStatus({ type: 'error', text: data.error || 'Cancellation routing failure.' });
      }
    } catch (err) {
      setActionStatus({ type: 'error', text: 'Network handshake dropped during cancellation processing.' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-500 font-medium">
        Synchronizing session parameters...
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md border border-slate-100">
      
      {/* ⏳ TIMELINE HEADER CONTROL NOTIFICATION BANNER */}
      <div className={`mb-6 p-4 rounded-lg border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 ${
        isGateOpen 
          ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
          : 'bg-rose-50 border-rose-200 text-rose-800'
      }`}>
        <div>
          <span className="font-bold text-sm tracking-wide uppercase block">
            Current Status: {sessionLabel} ({isGateOpen ? "Open" : "Locked"})
          </span>
          <span className="text-xs opacity-90">{statusMessage}</span>
        </div>
        <div className="text-xs font-mono bg-white bg-opacity-60 px-3 py-1 rounded shadow-sm border border-black border-opacity-5">
          Server Date: {serverDate}
        </div>
      </div>

      <div className="flex justify-between items-center pb-4 mb-6 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-black text-slate-800">Raid Loot Requisition</h2>
          <p className="text-xs text-slate-400">Welcome back, <span className="font-bold text-slate-600">{displayName}</span></p>
        </div>
      </div>

      {actionStatus.text && (
        <div className={`mb-6 p-3 rounded-md text-xs font-semibold ${
          actionStatus.type === 'success' ? 'bg-emerald-100 text-emerald-800' :
          actionStatus.type === 'error' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
        }`}>
          {actionStatus.text}
        </div>
      )}

      {/* ITEM REGISTRATION BLOCK CARDS */}
      <div className="grid gap-4 mb-8">
        {items.map(item => {
          const activeQty = liveCounts[item.name] || 0;
          const chosenQty = formSelections[item.name] || 0;

          return (
            <div key={item.name} className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between p-4 border border-slate-200 rounded-lg bg-slate-50 gap-4">
              <div>
                <h3 className="font-bold text-slate-700 text-sm">{item.name}</h3>
                <div className="text-xs text-slate-500 mt-1">
                  Active Staged Basket: <span className="font-bold text-slate-800">{activeQty} / {item.maxQty} Max</span>
                </div>
              </div>

              <div className="flex items-center gap-4 justify-between sm:justify-end">
                {/* Shuttle controls hidden dynamically if gate is locked */}
                {isGateOpen ? (
                  <div className="flex items-center border border-slate-300 rounded bg-white">
                    <button 
                      onClick={() => updateQuantitySelection(item.name, -1, item.maxQty)}
                      className="px-3 py-1 font-bold text-slate-500 hover:bg-slate-100 transition">-</button>
                    <span className="px-4 font-mono font-bold text-slate-700">{chosenQty}</span>
                    <button 
                      onClick={() => updateQuantitySelection(item.name, 1, item.maxQty)}
                      className="px-3 py-1 font-bold text-slate-500 hover:bg-slate-100 transition">+</button>
                  </div>
                ) : (
                  <span className="text-xs font-bold text-slate-400 italic bg-slate-200 px-3 py-1 rounded">Locked</span>
                )}

                {activeQty > 0 && (
                  <button
                    disabled={!isGateOpen}
                    onClick={() => executeCancellationRequest(item.name, activeQty)}
                    className={`text-xs font-bold px-3 py-2 rounded transition shadow-sm ${
                      isGateOpen 
                        ? 'bg-rose-600 hover:bg-rose-700 text-white cursor-pointer' 
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }`}>
                    Cancel Request
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {isGateOpen && (
        <button
          onClick={processSubmitRequisition}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg shadow transition">
          Confirm & Push Submissions
        </button>
      )}
    </div>
  );
}
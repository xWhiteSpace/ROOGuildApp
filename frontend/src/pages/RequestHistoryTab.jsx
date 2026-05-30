// frontend/src/pages/RequestHistoryTab.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const backendUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';

export default function RequestHistoryTab() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [historyData, setHistoryData] = useState([]);
  const [currentUserName, setCurrentUserName] = useState('');
  const [authError, setAuthError] = useState(false);
  
  // --- 🔍 ADVANCED FILTER AND SEARCH STATES ---
  const [viewFilter, setViewFilter] = useState('all'); // 'all' or 'mine'
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all'); 
  const [outcomeFilter, setOutcomeFilter] = useState('all');

  const fetchGlobalHistoryLog = async () => {
    try {
      setLoading(true);
      setAuthError(false);

      const savedUserSession = localStorage.getItem('dynasty_raid_session');
      const customHeaders = { 'Content-Type': 'application/json' };
      
      if (savedUserSession) {
        try {
          const parsedUser = JSON.parse(savedUserSession);
          setCurrentUserName(parsedUser.displayName || parsedUser.username || '');
          customHeaders['x-user-profile'] = encodeURIComponent(savedUserSession);
        } catch (e) {
          console.error("Failed to extract cached session criteria:", e.message);
        }
      }

      const res = await fetch(`${backendUrl}/api/requests/request-history`, {
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
        setHistoryData(data.history || []);
      }
    } catch (err) {
      console.error("Connection link offline:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGlobalHistoryLog();
  }, []);

  const getItemStyleProfile = (itemType) => {
    switch (itemType) {
      case 'Puppet': return 'text-violet-400 border-violet-500/30 bg-violet-950/20 shadow-[0_0_15px_rgba(139,92,246,0.1)]';
      case 'Illu': return 'text-yellow-400 border-yellow-500/30 bg-yellow-950/10 shadow-[0_0_15px_rgba(234,179,8,0.1)]';
      case 'Light&Dark': return 'text-slate-100 border-slate-700 bg-slate-900/40 shadow-[0_0_15px_rgba(255,255,255,0.05)]';
      case 'Time&Space': return 'text-red-500 border-red-950 bg-black/60 border-l-4 border-l-red-600';
      default: return 'text-slate-400 border-slate-800 bg-slate-900/50';
    }
  };

  /**
   * 📥 BROWSER-NATIVE CSV EXPORT MODULE
   */
  const handleDownloadCSVExport = () => {
    if (filteredRecords.length === 0) return;

    const csvHeaders = ["Timestamp", "Member", "Item", "Qty", "ApplicationStatus", "SelectionStatus", "LiveStatus", "Priority", "EventDate"];
    
    const csvRows = filteredRecords.map(row => [
      `"${row.date}"`,
      `"${row.member}"`,
      `"${row.item}"`,
      row.quantity,
      `"${row.applicationStatus}"`,
      `"${row.selectionStatus}"`,
      `"${row.liveStatus}"`,
      row.priority,
      `"${row.eventDate || ''}"`
    ]);

    const csvContent = [
      csvHeaders.join(","),
      ...csvRows.map(e => e.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `RequestHistory_Export_${viewFilter.toUpperCase()}_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

  const filteredRecords = historyData.filter(row => {
    if (viewFilter === 'mine' && (row.member || '').trim().toLowerCase() !== currentUserName.trim().toLowerCase()) {
      return false;
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchesMember = (row.member || '').toLowerCase().includes(query);
      const matchesItem = (row.item || '').toLowerCase().includes(query);
      if (!matchesMember && !matchesItem) return false;
    }
    if (actionFilter !== 'all' && (row.applicationStatus || '').toLowerCase() !== actionFilter.toLowerCase()) {
      return false;
    }
    if (outcomeFilter !== 'all' && (row.selectionStatus || '').toLowerCase() !== outcomeFilter.toLowerCase()) {
      return false;
    }
    return true;
  });

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 text-white pb-32 relative font-sans space-y-4">
      
      {/* HEADER CONTROLS PLACEMENT */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-6 sm:flex-row sm:items-center shadow-xl">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-100 uppercase">Request History Ledger</h1>
          <div className="text-xs text-slate-400 mt-1 space-x-4">
            <span>Roster Agent: <strong className="text-indigo-400">{currentUserName || 'Unassigned'}</strong></span>
            <span>Total Logged Row Matrix: <strong className="text-slate-300">{filteredRecords.length} lines</strong></span>
          </div>
        </div>

        <div className="flex gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 self-start sm:self-auto shrink-0">
          <button
            onClick={() => setViewFilter('all')}
            className={`rounded-lg px-4 py-1.5 text-xs font-black tracking-tight transition uppercase ${
              viewFilter === 'all' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:bg-slate-800/60'
            }`}
          >
            🌐 All Records
          </button>
          <button
            onClick={() => setViewFilter('mine')}
            className={`rounded-lg px-4 py-1.5 text-xs font-black tracking-tight transition uppercase ${
              viewFilter === 'mine' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:bg-slate-800/60'
            }`}
          >
            👤 My Filter
          </button>
        </div>
      </div>

      {/* --- 🔍 ADVANCED LIVE MULTI-FILTER CONTROL CONSOLE PANEL --- */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-900/40 border border-slate-800/60 p-4 rounded-2xl shadow-lg">
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-black text-slate-500 tracking-wider">Spotlight Query Search</label>
          <input 
            type="text"
            placeholder="🔍 Search member name or item..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-slate-700 transition"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] uppercase font-black text-slate-500 tracking-wider">Filter By Action Context</label>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 outline-none focus:border-slate-700 transition"
          >
            <option value="all">📥 Show All Actions</option>
            <option value="requested">🟢 Requested</option>
            <option value="canceled">🔴 Canceled</option>
            <option value="forcedadd">🟣 ForcedAdd</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] uppercase font-black text-slate-500 tracking-wider">Filter By Final Outcome</label>
          <select
            value={outcomeFilter}
            onChange={(e) => setOutcomeFilter(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 outline-none focus:border-slate-700 transition"
          >
            <option value="all">🏆 Show All Outcomes</option>
            <option value="pending">⏳ Pending</option>
            <option value="selected">✨ Selected</option>
            <option value="notselected">💤 NotSelected</option>
            <option value="absent">🚨 Absent</option>
          </select>
        </div>
      </div>

      {/* GLOBAL VIEW-ONLY REQUISITION GRID MATRIX */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto overflow-y-auto max-h-[60vh] scrollbar-thin">
          <table className="w-full text-left border-collapse min-w-max text-xs font-mono">
            <thead>
              <tr className="bg-slate-950 text-slate-400 font-black uppercase tracking-wider border-b border-slate-800 sticky top-0 z-10 text-[10px]">
                <th className="p-3.5 border-r border-slate-800/60">Timestamp</th>
                <th className="p-3.5 border-r border-slate-800/60">Member</th>
                <th className="p-3.5 border-r border-slate-800/60">Item</th>
                <th className="p-3.5 border-r border-slate-800/60 text-center">Qty</th>
                <th className="p-3.5 border-r border-slate-800/60">ApplicationStatus</th>
                <th className="p-3.5 border-r border-slate-800/60">SelectionStatus</th>
                <th className="p-3.5 border-r border-slate-800/60">LiveStatus</th>
                <th className="p-3.5 border-r border-slate-800/60 text-center">Priority</th>
                <th className="p-3.5">EventDate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 bg-slate-900/40 text-slate-300">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan="9" className="p-8 text-center text-slate-500 italic font-sans text-sm">
                    No corresponding transaction entries logged under this specific filter context.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-950/40 transition-colors">
                    <td className="p-3 text-slate-400 whitespace-nowrap">{row.date}</td>
                    <td className="p-3 font-sans font-bold text-slate-100 whitespace-nowrap">{row.member}</td>
                    <td className="p-3 font-sans whitespace-nowrap">
                      <span className={`px-2.5 py-0.5 rounded border text-[10px] font-sans font-semibold ${getItemStyleProfile(row.item)}`}>
                        {row.item}
                      </span>
                    </td>
                    <td className="p-3 font-bold text-center text-slate-100">{row.quantity}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-tight border ${
                        (row.applicationStatus || '').toLowerCase() === 'requested'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : (row.applicationStatus || '').toLowerCase() === 'forcedadd'
                          ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      }`}>
                        {row.applicationStatus}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black tracking-tight border ${
                        (row.selectionStatus || '').toLowerCase() === 'pending'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : (row.selectionStatus || '').toLowerCase() === 'selected'
                          ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                          : (row.selectionStatus || '').toLowerCase() === 'absent'
                          ? 'bg-red-500/10 text-red-400 border-red-500/20'
                          : 'bg-slate-800 text-slate-500 border-slate-700'
                      }`}>
                        {row.selectionStatus}
                      </span>
                    </td>
                    <td className="p-3 text-slate-400 whitespace-nowrap text-[11px] font-sans uppercase font-semibold">
                      {row.liveStatus ? `⚡ ${row.liveStatus}` : '---'}
                    </td>
                    <td className="p-3 font-bold text-center text-cyan-400">{row.priority}</td>
                    <td className="p-3 text-slate-400 font-bold whitespace-nowrap">
                      {row.eventDate === "" ? '""' : row.eventDate}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* STICKY BOTTOM INTERACTION FOOTER ANCHOR */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-slate-800 bg-slate-950/90 backdrop-blur-md p-4 z-40">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          
          <button
            onClick={handleDownloadCSVExport}
            disabled={filteredRecords.length === 0}
            className="rounded-xl bg-indigo-600 px-6 py-2.5 text-xs font-bold text-white transition hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 shadow-lg tracking-wide"
          >
            📥 Export CSV Spreadsheet
          </button>
          
          <button
            onClick={() => navigate('/')}
            className="rounded-xl border border-slate-700 bg-slate-900 px-6 py-2.5 text-xs font-bold text-slate-300 transition hover:bg-slate-800 hover:text-white shadow-lg tracking-wide"
          >
            ↩️ Return to Lobby
          </button>
          
        </div>
      </div>

    </div>
  );
}
// frontend/src/pages/AttendanceHistoryTab.jsx
import { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, 
  Search, 
  ChevronRight, 
  ArrowLeft,
  Users,
  Volume2,
  FileText,
  Bookmark
} from 'lucide-react';

const backendUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';

export default function AttendanceHistoryTab({ user }) {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState({});
  const [ledger, setLedger] = useState({});
  const [members, setMembers] = useState({});
  const [jobsCatalog, setJobsCatalog] = useState({});
  const [rolesCatalog, setRolesCatalog] = useState({});
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState(null);

  const getRequestHeaders = () => {
    const savedUserSession = localStorage.getItem('dynasty_raid_session');
    const headers = { 'Content-Type': 'application/json' };
    if (savedUserSession) {
      headers['x-user-profile'] = encodeURIComponent(savedUserSession);
    }
    return headers;
  };

  const loadHistoryData = async () => {
    try {
      setLoading(true);
      const headers = getRequestHeaders();

      // Load master lists for display names / classes
      const initRes = await fetch(`${backendUrl}/api/requests/init`, { method: 'GET', headers, credentials: 'include' });
      const initData = await initRes.json();
      if (initData.success) {
        setMembers(initData.members || {});
      }

      const settingsRes = await fetch(`${backendUrl}/api/requests/settings/get`, { method: 'GET', headers, credentials: 'include' });
      const settingsData = await settingsRes.json();
      if (settingsData.success && settingsData.config) {
        setJobsCatalog(settingsData.config.jobs || {});
        setRolesCatalog(settingsData.config.roles || {});
      }

      // Load session logs & user ledgers
      const res = await fetch(`${backendUrl}/api/live-raid/history/all`, {
        method: 'GET',
        headers,
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        setSessions(data.sessions || {});
        setLedger(data.ledger || {});
      }
    } catch (err) {
      console.error("Error loading attendance history logs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistoryData();
  }, [user]);

  // Sort sessions descending by endedAt
  const sortedSessionsList = useMemo(() => {
    return Object.values(sessions).sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0));
  }, [sessions]);

  // Filtered session list based on search bar
  const filteredSessionsList = useMemo(() => {
    if (!searchQuery.trim()) return sortedSessionsList;
    return sortedSessionsList.filter(s => 
      s.eventTitle?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      s.eventDate?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [sortedSessionsList, searchQuery]);

  // Compile detailed table rows when a session is selected
  const detailedRosterRows = useMemo(() => {
    if (!selectedSessionId) return [];
    const list = [];
    
    // Scan all player ledger logs to find matching entries for this sessionId
    Object.entries(ledger).forEach(([uid, playerLogs]) => {
      const playerProfile = members[uid] || {};
      const displayName = playerProfile.displayName || 'Unknown Raider';
      
      Object.values(playerLogs).forEach(entry => {
        if (entry.sessionId === selectedSessionId) {
          const actualPresenceText = entry.ratio > 0 ? "On Discord" : "Not on Discord";
          
          list.push({
            uid,
            displayName,
            date: entry.date,
            jobClass: jobsCatalog[entry.jobCode]?.name || 'No Class',
            jobRole: rolesCatalog[entry.roleCode]?.name || 'No Role',
            commitment: entry.commitmentStatus === 'None' ? 'uncommitted' : entry.commitmentStatus,
            actual: actualPresenceText,
            rate: `${entry.ratio}%`
          });
        }
      });
    });

    return list.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [selectedSessionId, ledger, members, jobsCatalog, rolesCatalog]);

  const selectedSessionMeta = useMemo(() => {
    if (!selectedSessionId) return null;
    return sessions[selectedSessionId] || null;
  }, [selectedSessionId, sessions]);

  return (
    <div className="space-y-4 max-w-[98vw] mx-auto p-1 font-sans text-slate-200 overflow-visible relative">
      
      {/* HEADER SECTION */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 shadow-md flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 select-none">
        <div>
          <div className="text-[10px] font-mono font-bold tracking-widest text-slate-500 uppercase">Raid Governance</div>
          <h1 className="text-lg font-black tracking-wider text-slate-100 uppercase mt-1">Attendance History</h1>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-24 text-[11px] text-slate-500 font-mono italic animate-pulse">
          Synchronizing historical attendance logs from Firebase...
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-4 items-start relative overflow-visible">
          
          {/* LEFT LIST: RAID SESSIONS */}
          <div className={`col-span-12 ${selectedSessionId ? 'xl:col-span-4' : 'xl:col-span-12'} space-y-3`}>
            
            {/* Search filter bar */}
            {!selectedSessionId && (
              <div className="relative w-full select-none">
                <input 
                  type="text" 
                  placeholder="Search Sessions by date or title..." 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)} 
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-200 font-medium placeholder-slate-650 outline-none focus:border-slate-700 font-sans transition-all shadow-inner" 
                />
                <div className="absolute left-2.5 top-3 text-slate-500"><Search size={14} /></div>
              </div>
            )}

            <div className="space-y-2.5 max-h-[70vh] overflow-y-auto pr-1 scrollbar-thin">
              {filteredSessionsList.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-slate-850 rounded-2xl text-xs text-slate-500 font-mono italic">
                  No completed operations session records found.
                </div>
              ) : (
                filteredSessionsList.map((s) => {
                  const isSelected = selectedSessionId === s.id;
                  const durationMins = (s.totalPulses || 0) * 5;

                  return (
                    <div
                      key={s.id}
                      onClick={() => setSelectedSessionId(s.id)}
                      className={`p-4 rounded-xl border relative shadow-sm transition-all duration-150 cursor-pointer ${
                        isSelected 
                          ? 'bg-slate-900 border-indigo-500 shadow-md' 
                          : 'bg-slate-900/10 border-slate-900 hover:border-slate-800'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="truncate pr-4">
                          <span className="text-[9px] font-mono font-bold tracking-widest text-slate-500 uppercase block">
                            {s.eventDate}
                          </span>
                          <h4 className="text-xs font-black uppercase text-slate-200 tracking-wider truncate mt-0.5">
                            {s.eventTitle || 'Untitled Session'}
                          </h4>
                          <span className="text-[8px] font-mono text-indigo-400 mt-1 block">
                            Committed by: {s.committedBy || 'System'}
                          </span>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0 text-right">
                          <span className="bg-slate-950 border border-slate-850 px-2 py-0.5 rounded text-[8px] font-mono text-slate-450 uppercase tracking-widest font-bold">
                            {durationMins} Mins
                          </span>
                          <ChevronRight size={14} className="text-slate-600 group-hover:text-slate-400" />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT DETAILED GRID VIEW TABLE (Exposed only if selectedSessionId is present) */}
          {selectedSessionId && (
            <div className="col-span-12 xl:col-span-8 bg-slate-950/60 border border-slate-800 rounded-3xl p-5 shadow-xl animate-fadeIn space-y-4 relative">
              <div className="flex items-center justify-between border-b border-slate-900 pb-3 select-none">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedSessionId(null)}
                    className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                    title="Return to Session List"
                  >
                    <ArrowLeft size={14} />
                  </button>
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-100">
                      {selectedSessionMeta?.eventTitle} Summary details
                    </h3>
                    <span className="text-[9px] font-mono text-indigo-400">
                      Session ID: {selectedSessionId} · Date: {selectedSessionMeta?.eventDate}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedSessionId(null)}
                  className="text-slate-500 hover:text-slate-350 transition"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Grid matrices metadata snippets */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs select-none">
                <div className="bg-slate-900/40 border border-slate-850 p-3 rounded-xl">
                  <span className="text-[8px] font-mono font-bold uppercase tracking-wider text-slate-500 block">Committed By</span>
                  <span className="text-slate-200 font-bold mt-0.5 block">{selectedSessionMeta?.committedBy || 'System'}</span>
                </div>
                <div className="bg-slate-900/40 border border-slate-850 p-3 rounded-xl">
                  <span className="text-[8px] font-mono font-bold uppercase tracking-wider text-slate-500 block">Total Poll Counts</span>
                  <span className="text-slate-200 font-bold mt-0.5 block">{selectedSessionMeta?.totalPulses} check-ins</span>
                </div>
                <div className="bg-slate-900/40 border border-slate-850 p-3 rounded-xl">
                  <span className="text-[8px] font-mono font-bold uppercase tracking-wider text-slate-500 block">Configs Blueprints</span>
                  <span className="text-slate-200 font-bold mt-0.5 block truncate">
                    {selectedSessionMeta?.selectedConfigIds?.join(', ') || 'N/A'}
                  </span>
                </div>
              </div>

              {/* Data Table */}
              <div className="overflow-x-auto border border-slate-900 rounded-2xl bg-slate-950">
                <table className="min-w-full divide-y divide-slate-900 font-sans text-xs">
                  <thead className="bg-slate-900/45 text-[8px] font-mono font-bold uppercase tracking-wider text-slate-400 select-none">
                    <tr>
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-left">Name</th>
                      <th className="px-4 py-3 text-left">Job Class</th>
                      <th className="px-4 py-3 text-left">Job Role</th>
                      <th className="px-4 py-3 text-left">Commitment</th>
                      <th className="px-4 py-3 text-left">Actual presence</th>
                      <th className="px-4 py-3 text-right">Attendance Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900 font-mono text-[11px] text-slate-300">
                    {detailedRosterRows.map((row, idx) => {
                      const commitmentColor = row.commitment === 'Confirmed' 
                        ? 'text-emerald-400' 
                        : row.commitment === 'Leave' 
                          ? 'text-rose-450' 
                          : 'text-slate-550';
                      
                      const actualColor = row.actual === 'On Discord' 
                        ? 'text-emerald-400 font-bold' 
                        : 'text-slate-550';

                      return (
                        <tr key={idx} className="hover:bg-slate-900/20 transition-colors">
                          <td className="px-4 py-2.5 text-left text-slate-500">{row.date}</td>
                          <td className="px-4 py-2.5 text-left font-sans font-bold text-slate-200">{row.displayName}</td>
                          <td className="px-4 py-2.5 text-left font-sans font-semibold text-slate-350">{row.jobClass}</td>
                          <td className="px-4 py-2.5 text-left font-sans text-slate-400">{row.jobRole}</td>
                          <td className={`px-4 py-2.5 text-left font-sans font-bold ${commitmentColor}`}>
                            {row.commitment}
                          </td>
                          <td className={`px-4 py-2.5 text-left font-sans ${actualColor}`}>{row.actual}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-amber-500">{row.rate}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

            </div>
          )}

        </div>
      )}

    </div>
  );
}

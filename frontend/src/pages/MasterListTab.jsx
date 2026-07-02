// frontend/src/pages/MasterListTab.jsx
import { useState, useEffect } from 'react';

const backendUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';

const IconUser = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M12 7a4 4 0 100-8 4 4 0 000 8z" /></svg>;
const IconShield = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
const IconCalendar = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" strokeLinejoin="round"/></svg>;

export default function MasterListTab({ user }) {
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState({});
  const [jobsCatalog, setJobsCatalog] = useState({});
  const [searchQuery, setSearchQuery] = useState('');

  const loadRosterDirectory = async () => {
    try {
      setLoading(true);
      const savedUserSession = localStorage.getItem('dynasty_raid_session');
      const headers = { 'Content-Type': 'application/json' };
      if (savedUserSession) {
        headers['x-user-profile'] = encodeURIComponent(savedUserSession);
      }

      const res = await fetch(`${backendUrl}/api/requests/init`, { method: 'GET', headers, credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setMembers(data.members || {});
        if (data.events && data.events.jobs) {
          setJobsCatalog(data.events.jobs);
        } else {
          // Alternative fallback to catch root-level dictionary objects safely
          const configRes = await fetch(`${backendUrl}/api/requests/settings/get`, { method: 'GET', headers, credentials: 'include' });
          const configData = await configRes.json();
          if (configData.success && configData.config?.jobs) {
            setJobsCatalog(configData.config.jobs);
          }
        }
      }
    } catch (err) {
      console.error("Error connecting to configuration routers:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRosterDirectory();
  }, [user]);

  // 🧪 Foundational Morale-Preserving Intensity Curve Calculation Engine
  const evaluateParticipationStyle = (attendanceRate = 0) => {
    if (attendanceRate >= 80) return 'text-emerald-400 font-bold drop-shadow-[0_0_8px_rgba(52,211,153,0.4)] animate-pulse';
    if (attendanceRate >= 30) return 'text-emerald-500/70 font-semibold';
    if (attendanceRate >= 10) return 'text-emerald-600/40 font-medium';
    return 'text-slate-500 font-normal'; // Slate Gray fallback curve preserves group impression rules
  };

  const filteredRoster = Object.entries(members).filter(([uid, m]) => {
    if (!searchQuery.trim()) return true;
    return (m.displayName || '').toLowerCase().includes(searchQuery.toLowerCase());
  });

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400 font-medium animate-pulse text-xs font-mono uppercase tracking-widest">
        Synchronizing Global Attendance Matrix...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-2 font-sans animate-fadeIn">
      
      {/* DIRECTORY CONSOLE TOP SECTION */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 shadow-md flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 select-none">
        <div>
          <h1 className="text-lg font-bold tracking-wider text-slate-200 uppercase">MasterList Guild Directory</h1>
          <p className="text-[11px] font-mono text-slate-500 mt-1">SINGLE SOURCE OF TRUTH PLAYER ROSTER HOOKS</p>
        </div>
        <div className="relative w-full sm:w-64">
          <input 
            type="text" 
            placeholder="Search Member Handle..." 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 font-medium placeholder-slate-650 outline-none focus:border-slate-700 transition shadow-inner font-sans" 
          />
        </div>
      </div>

      {/* CORE DATA DATA-TABLE RENDER */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto max-h-[65vh] scrollbar-thin">
          <table className="w-full text-left border-collapse table-fixed min-w-[700px] text-xs font-mono">
            <thead>
              <tr className="bg-slate-950 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-800 sticky top-0 z-10 text-[9px] select-none">
                <th className="p-3.5 px-6 w-[35%]">Member Profile</th>
                <th className="p-3.5 w-[35%]">Job Classification Specialization</th>
                <th className="p-3.5 px-6 text-right w-[30%]">Date Join Record</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 bg-slate-900/40 text-slate-300">
              {filteredRoster.length === 0 ? (
                <tr>
                  <td colSpan="3" className="p-8 text-center text-slate-600 italic font-sans text-xs select-none">No player profile records found within dataset matching search constraints.</td>
                </tr>
              ) : (
                filteredRoster.map(([uid, m]) => {
                  const jobData = jobsCatalog[m.jobCode] || { name: 'Unassigned/None', colorTheme: '#64748b' };
                  
                  // Extract calculated point tally score safely or fall back into baseline indexes
                  const mockedRate = m.attendanceRate !== undefined ? m.attendanceRate : 85; 
                  const dynamicColorClass = evaluateParticipationStyle(mockedRate);

                  return (
                    <tr key={uid} className="group border-b border-slate-900/30 hover:bg-slate-950/20 transition-all duration-75">
                      <td className="p-3.5 px-6 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full shrink-0 bg-slate-700 group-hover:bg-indigo-500 transition-colors" />
                          <span className={`font-sans font-semibold tracking-tight text-xs transition-all ${dynamicColorClass}`}>
                            {m.displayName || 'Unknown Member'}
                          </span>
                        </div>
                      </td>
                      
                      <td className="p-3.5 font-sans whitespace-nowrap">
                        <span 
                          className="px-2.5 py-0.5 rounded border text-[10px] font-medium transition shadow-sm"
                          style={{
                            color: jobData.colorTheme,
                            borderColor: `${jobData.colorTheme}40`,
                            backgroundColor: `${jobData.colorTheme}12`
                          }}
                        >
                          {jobData.name}
                        </span>
                      </td>

                      <td className="p-3.5 px-6 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end bg-slate-950/40 border border-slate-800/60 rounded-xl px-3 py-1 font-mono text-xs text-slate-400 group-hover:border-slate-700 transition">
                          <input 
                            type="date" 
                            defaultValue={m.dateJoin || "2026-07-01"} 
                            disabled={!user?.isOfficer}
                            className="bg-transparent text-slate-300 outline-none text-right font-sans text-xs cursor-pointer disabled:cursor-default"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
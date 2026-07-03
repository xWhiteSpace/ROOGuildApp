// frontend/src/pages/StatisticsTab.jsx
import { useState, useEffect } from 'react';

const backendUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';

// --- 🎨 PROFESSIONAL FLAT VECTOR MICRO-ICONS CONSOLE ---
const IconCalendar = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const IconLayers = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polygon points="2 17 12 22 22 17"/><polygon points="2 12 12 17 22 12"/></svg>;
const IconSliders = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></svg>;

export default function StatisticsTab({ user }) {
  const [loading, setLoading] = useState(true);
  const [jobsCatalog, setJobsCatalog] = useState({});
  const [members, setMembers] = useState({});
  const [userAvailability, setUserAvailability] = useState('join'); // 'join' | 'excused'

  const loadAnalyticsMetrics = async () => {
    try {
      setLoading(true);
      const savedUserSession = localStorage.getItem('dynasty_raid_session');
      const headers = { 'Content-Type': 'application/json' };
      if (savedUserSession) {
        headers['x-user-profile'] = encodeURIComponent(savedUserSession);
      }

      const initRes = await fetch(`${backendUrl}/api/requests/init`, { method: 'GET', headers, credentials: 'include' });
      const initData = await initRes.json();
      if (initData.success) {
        setMembers(initData.members || {});
        
        const configRes = await fetch(`${backendUrl}/api/requests/settings/get`, { method: 'GET', headers, credentials: 'include' });
        const configData = await configRes.json();
        if (configData.success && configData.config?.jobs) {
          setJobsCatalog(configData.config.jobs);
        }
      }
    } catch (err) {
      console.error("Error building dashboard graph metrics:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalyticsMetrics();
  }, [user]);

  const handleUpdateDesiredTarget = async (jobCode, val) => {
    const parsedCount = Math.max(0, parseInt(val, 10) || 0);

    // Optimistic Update: Refresh UI matrix cache immediately at 0ms
    setJobsCatalog(prev => ({
      ...prev,
      [jobCode]: { ...prev[jobCode], desiredCount: parsedCount }
    }));

    try {
      const savedUserSession = localStorage.getItem('dynasty_raid_session');
      const headers = { 'Content-Type': 'application/json' };
      if (savedUserSession) headers['x-user-profile'] = encodeURIComponent(savedUserSession);

      await fetch(`${backendUrl}/api/attendance/update-job-target`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ jobCode, desiredCount: parsedCount }),
        credentials: 'include'
      });
    } catch (err) {
      console.error("Failed to commit recruitment goals:", err);
    }
  };

  // Automated Tally: Counts active guild profiles strictly where isRaidRoster evaluates to true
  const jobDistributionTally = {};
  Object.values(members).forEach(m => {
    if (m.isRaidRoster === true && m.jobCode) {
      jobDistributionTally[m.jobCode] = (jobDistributionTally[m.jobCode] || 0) + 1;
    }
  });

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400 font-medium animate-pulse text-xs font-mono uppercase tracking-widest">
        Compiling Class Balance and Calendar Interfaces...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[98vw] mx-auto p-2 font-sans animate-fadeIn">
      
      {/* HEADER SECTION */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 shadow-md select-none">
        <h1 className="text-lg font-bold tracking-wider text-slate-200 uppercase">Analytics & Commitment Scheduler</h1>
        <p className="text-[11px] font-mono text-slate-500 mt-1">CLASS DENSITY RATIOS AND ADVANCED LEAVE MANAGEMENT</p>
      </div>

      <div className="w-full">
        
        {/* FULL-WIDTH WORKSPACE: COMPOSITION BALANCING PANEL */}
        <div className="w-full bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2 select-none pb-2 border-b border-slate-900">
            <IconSliders /> Roster Composition Balancing Workspace
          </div>
          
          <div className="border border-slate-800 bg-slate-950/40 rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono min-w-[550px]">
              <thead>
                <tr className="bg-slate-950 text-slate-500 uppercase tracking-wider text-[9px] border-b border-slate-800 select-none">
                  <th className="p-3 pl-4 w-[30%]">Job Class</th>
                  <th className="p-3 text-center w-[20%]">Desired Target</th>
                  <th className="p-3 text-center w-[15%]">Active</th>
                  <th className="p-3 pl-4 w-[35%]">Distribution Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/60 font-sans font-semibold">
                {Object.keys(jobsCatalog).length > 0 ? (
                  Object.entries(jobsCatalog).map(([code, jobObj]) => {
                    const activeCount = jobDistributionTally[code] || 0;
                    const desiredTarget = jobObj.desiredCount || 0;
                    const isOverCapacity = activeCount > desiredTarget;

                    // Calculate progress thresholds dynamically
                    let fillPercentage = 0;
                    if (desiredTarget > 0) {
                      fillPercentage = Math.min(100, Math.round((activeCount / desiredTarget) * 100));
                    } else if (activeCount > 0) {
                      fillPercentage = 100;
                    }

                    const meterColorToken = isOverCapacity ? 'bg-rose-500' : 'bg-emerald-500';

                    return (
                      <tr key={code} className="hover:bg-slate-900/10 transition-colors">
                        <td className="p-3 pl-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-sm shrink-0 shadow-sm" style={{ backgroundColor: jobObj.colorTheme }} />
                            <span className="text-slate-200 font-bold text-xs">{jobObj.name}</span>
                          </div>
                        </td>
                        <td className="p-2 text-center">
                          <input 
                            type="number"
                            min="0"
                            value={jobObj.desiredCount ?? 0}
                            disabled={!user?.isOfficer}
                            onChange={(e) => handleUpdateDesiredTarget(code, e.target.value)}
                            className="w-14 bg-slate-950 border border-slate-800 text-slate-200 rounded-lg px-2 py-1 font-mono font-bold text-center text-xs outline-none focus:border-slate-700 disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </td>
                        <td className="p-3 text-center font-mono text-slate-400 font-bold text-xs select-none">
                          {activeCount}
                        </td>
                        <td className="p-3 pr-4 select-none">
                          {/* Segmented Increment Meter Bar Frame */}
                          <div className="w-full bg-slate-800 rounded-lg h-4 relative overflow-hidden border border-slate-900/60 shadow-inner">
                            <div 
                              className={`h-full transition-all duration-500 ease-out ${meterColorToken}`}
                              style={{ width: `${fillPercentage}%` }}
                            />
                            {/* Overlayed 10% high-contrast layout grid lines */}
                            <div className="absolute inset-0 flex pointer-events-none">
                              {Array.from({ length: 9 }).map((_, lineIdx) => (
                                <div 
                                  key={lineIdx} 
                                  className="h-full border-r border-slate-950/25" 
                                  style={{ width: '10%' }} 
                                />
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="4" className="text-center py-12 border border-dashed border-slate-800 rounded-xl text-[11px] text-slate-500 font-mono italic">No custom specializations defined inside SettingsTab catalogs.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        </div>
    </div>
  );
}
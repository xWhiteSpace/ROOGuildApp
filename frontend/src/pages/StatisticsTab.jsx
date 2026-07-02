// frontend/src/pages/StatisticsTab.jsx
import { useState, useEffect } from 'react';

const backendUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';

const IconCalendar = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const IconLayers = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polygon points="2 17 12 22 22 17"/><polygon points="2 12 12 17 22 12"/></svg>;

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

  // Calculate dynamic volume parameters per job signature for visual metrics
  const jobDistributionTally = {};
  Object.values(members).forEach(m => {
    if (m.jobCode) {
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
    <div className="space-y-6 max-w-6xl mx-auto p-2 font-sans animate-fadeIn">
      
      {/* HEADER SECTION */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 shadow-md select-none">
        <h1 className="text-lg font-bold tracking-wider text-slate-200 uppercase">Analytics & Commitment Scheduler</h1>
        <p className="text-[11px] font-mono text-slate-500 mt-1">CLASS DENSITY RATIOS AND ADVANCED LEAVE MANAGEMENT</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: CLASS BALANCE BREAKDOWN VISUAL METRICS (5 SPAN) */}
        <div className="md:col-span-5 bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2 select-none">
            <IconLayers /> Job Class Balance Matrix
          </div>
          
          <div className="space-y-3 pt-2">
            {Object.keys(jobsCatalog).length > 0 ? (
              Object.entries(jobsCatalog).map(([code, jobObj]) => {
                const activeCount = jobDistributionTally[code] || 0;
                const totalRosterCount = Object.keys(members).length || 1;
                const calculatedPercentage = Math.round((activeCount / totalRosterCount) * 100);

                return (
                  <div key={code} className="space-y-1.5 font-mono text-xs">
                    <div className="flex justify-between items-center text-slate-300">
                      <span className="font-sans font-semibold flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0 shadow-sm" style={{ backgroundColor: jobObj.colorTheme }} />
                        {jobObj.name}
                      </span>
                      <span className="text-slate-500 font-bold">{activeCount} Profiles ({calculatedPercentage}%)</span>
                    </div>
                    {/* Visual Bar Indicator Meter */}
                    <div className="w-full bg-slate-950 rounded-full h-2 border border-slate-800/80 overflow-hidden shadow-inner">
                      <div 
                        className="h-full rounded-full transition-all duration-500" 
                        style={{ 
                          backgroundColor: jobObj.colorTheme,
                          width: `${Math.max(3, calculatedPercentage)}%`
                        }} 
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-8 border border-dashed border-slate-800 rounded-xl text-[11px] text-slate-500 font-mono italic">No custom specializations defined inside SettingsTab catalogs.</div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: OFFICE-STYLE ADVANCED LEAVE COMMITMENT CALENDAR (7 SPAN) */}
        <div className="md:col-span-7 bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl select-none">
          <div className="flex justify-between items-center border-b border-slate-800/60 pb-3">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <IconCalendar /> Office Commitment Scheduler
            </div>
            
            {/* Dynamic Selector allowing players to log availability status parameters */}
            <div className="flex bg-slate-950 border border-slate-800 p-0.5 rounded-xl gap-0.5 shadow-inner text-[10px] font-bold uppercase tracking-wide">
              <button onClick={() => setUserAvailability('join')} className={`px-3 py-1 rounded-lg transition-all ${userAvailability === 'join' ? 'bg-emerald-600 text-white shadow' : 'text-slate-500'}`}>Can Join</button>
              <button onClick={() => setUserAvailability('excused')} className={`px-3 py-1 rounded-lg transition-all ${userAvailability === 'excused' ? 'bg-amber-600 text-white shadow' : 'text-slate-500'}`}>Apply Leave</button>
            </div>
          </div>

          {/* Clean Monthly 35-Day Grid Skeleton Layout Wrapper */}
          <div className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-3 font-mono">
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 border-b border-slate-900 pb-1.5">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d}>{d}</div>)}
            </div>
            
            <div className="grid grid-cols-7 gap-1.5 text-xs font-bold text-center">
              {Array.from({ length: 31 }).map((_, idx) => {
                const dayNumber = idx + 1;
                // Highlight explicit sample dates to illustrate upcoming Phase 3 targets
                const isRaidTargetEventDate = dayNumber === 5 || dayNumber === 12 || dayNumber === 19 || dayNumber === 26;

                return (
                  <div 
                    key={idx}
                    className={`p-2.5 rounded-xl border flex flex-col items-center justify-between min-h-[50px] transition transform active:scale-95 cursor-pointer ${
                      isRaidTargetEventDate 
                        ? 'border-indigo-500/40 bg-indigo-950/20 text-indigo-400 font-black shadow-[0_0_12px_rgba(99,102,241,0.1)]' 
                        : 'border-slate-900 bg-slate-900/20 text-slate-400 hover:border-slate-800'
                    }`}
                  >
                    <span>{dayNumber}</span>
                    {isRaidTargetEventDate && (
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse mt-1" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-[10px] text-slate-500 leading-relaxed font-mono">
            📌 <strong className="text-slate-400 uppercase tracking-wider text-[9px] mr-1">Workflow Rule:</strong> Click any upcoming highlighted event block on your scheduler coordinate to log or adjust your advance attendance status declarations prior to the lock closing.
          </p>
        </div>

      </div>

    </div>
  );
}
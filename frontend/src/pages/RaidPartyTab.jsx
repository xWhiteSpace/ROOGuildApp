// frontend/src/pages/RaidPartyTab.jsx
import { useState, useEffect } from 'react';

const backendUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';

// --- 🎨 PURE VECTOR MICRO-ICONS CONSOLE ---
const IconUser = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M12 7a4 4 0 100-8 4 4 0 000 8z" /></svg>;
const IconShield = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
const IconSliders = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></svg>;

export default function RaidPartyTab({ user }) {
  const [loading, setLoading] = useState(true);
  const [activeSession, setActiveSession] = useState(null);
  const [members, setMembers] = useState({});
  const [jobsCatalog, setJobsCatalog] = useState({});
  
  // Staging state structures mapping the active live composition layout grid
  const [gridMatrix, setGridMatrix] = useState({});
  const [sidebarTab, setSidebarTab] = useState('standby'); // 'standby' | 'excused' | 'unexcused'
  const [excusedList, setExcusedList] = useState(new Set());
  const [unexcusedList, setUnexcusedList] = useState(new Set());
  
  // 📐 Geometric Grid Dimensions (Defaults cleanly to 8 Columns x 5 Rows mirroring real layout)
  const [dimensions, setGridDimensions] = useState({ columns: 8, rows: 5 });
  const [pendingDimensions, setPendingDimensions] = useState({ columns: 8, rows: 5 });
  const [showResizeConfirmation, setShowResizeConfirmation] = useState(false);

  const loadWorkbenchData = async () => {
    try {
      setLoading(true);
      const savedUserSession = localStorage.getItem('dynasty_raid_session');
      const headers = { 'Content-Type': 'application/json' };
      if (savedUserSession) {
        headers['x-user-profile'] = encodeURIComponent(savedUserSession);
      }

      // Read active state parameters out of active_session nodes
      const sessionRes = await fetch(`${backendUrl}/api/attendance/active-session`, { method: 'GET', headers, credentials: 'include' });
      const sessionData = await sessionRes.json();
      if (sessionData.success && sessionData.session) {
        setActiveSession(sessionData.session);
        if (sessionData.session.gridTopology) {
          setGridDimensions(sessionData.session.gridTopology);
          setPendingDimensions(sessionData.session.gridTopology);
        }
      }

      // Fetch global master lookup directories to bind names and relational profiles
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
      console.error("Failed to compile active composition workbench variables:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkbenchData();
  }, [user]);

  const handleUpdateGridTopology = () => {
    // 🛡️ DESTRUCTIVE DOWN-RESIZING PROTECTION: Intercept if dimensions are being reduced
    if (pendingDimensions.columns < dimensions.columns || pendingDimensions.rows < dimensions.rows) {
      setShowResizeConfirmation(true);
    } else {
      executeTopologyCommit();
    }
  };

  const executeTopologyCommit = () => {
    // 🧳 DISPLACED MEMBERS RE-ROUTING SAFEGUARD: Shifting overflowing entries back into Standby sidebars
    const updatedMatrix = { ...gridMatrix };
    Object.keys(gridMatrix).forEach(coordinateKey => {
      const [col, row] = coordinateKey.split('-').map(Number);
      if (col > pendingDimensions.columns || row > pendingDimensions.rows) {
        delete updatedMatrix[coordinateKey]; // Evicts grid coordinates safely
      }
    });

    setGridMatrix(updatedMatrix);
    setGridDimensions(pendingDimensions);
    setShowResizeConfirmation(false);
  };

  const toggleStatusBucket = (uid, bucketType) => {
    if (bucketType === 'excused') {
      const nextExcused = new Set(excusedList);
      if (nextExcused.has(uid)) nextExcused.delete(uid);
      else {
        nextExcused.add(uid);
        unexcusedList.delete(uid);
      }
      setExcusedList(nextExcused);
      setUnexcusedList(new Set(unexcusedList));
    } else if (bucketType === 'unexcused') {
      const nextUnexcused = new Set(unexcusedList);
      if (nextUnexcused.has(uid)) nextUnexcused.delete(uid);
      else {
        nextUnexcused.add(uid);
        excusedList.delete(uid);
      }
      setUnexcusedList(nextUnexcused);
      setExcusedList(new Set(excusedList));
    }
  };

  // Extract allocated users out of active layout paths to avoid duplication leaks
  const activeAllocatedUids = Object.values(gridMatrix);
  
  const standbyPool = Object.entries(members).filter(([uid]) => 
    !activeAllocatedUids.includes(uid) && !excusedList.has(uid) && !unexcusedList.has(uid)
  );
  
  const excusedPool = Object.entries(members).filter(([uid]) => excusedList.has(uid));
  const unexcusedPool = Object.entries(members).filter(([uid]) => unexcusedList.has(uid));

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400 font-medium animate-pulse text-xs font-mono uppercase tracking-widest">
        Constructing Relational 8x5 Matrix Blueprint...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[98vw] mx-auto p-2 font-sans animate-fadeIn">
      
      {/* WORKBENCH TOP CONTROL CENTER */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4 select-none">
        <div>
          <h1 className="text-lg font-bold tracking-wider text-slate-200 uppercase">Raid Party Composition Canvas</h1>
          <p className="text-[11px] font-mono text-slate-500 mt-1">IN-GAME 8X5 CELL GEOMETRY MIRROR ENGINE</p>
        </div>

        {/* Dynamic Matrix Sizer Controls */}
        {user?.isOfficer && (
          <div className="flex items-center gap-3 bg-slate-950 border border-slate-800/80 rounded-xl p-2 px-3 shadow-inner">
            <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5"><IconSliders /> Columns:</label>
            <input 
              type="number" 
              value={pendingDimensions.columns} 
              onChange={(e) => setPendingDimensions(prev => ({ ...prev, columns: Math.max(1, parseInt(e.target.value) || 8) }))}
              className="w-10 bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-xs text-center text-amber-500 font-bold font-mono outline-none"
            />
            <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider ml-1">Rows:</label>
            <input 
              type="number" 
              value={pendingDimensions.rows} 
              onChange={(e) => setPendingDimensions(prev => ({ ...prev, rows: Math.max(1, parseInt(e.target.value) || 5) }))}
              className="w-10 bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-xs text-center text-amber-500 font-bold font-mono outline-none"
            />
            <button 
              onClick={handleUpdateGridTopology}
              className="ml-2 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 transition rounded text-[10px] font-bold uppercase tracking-wide text-white cursor-pointer"
            >
              Apply Changes
            </button>
          </div>
        )}
      </div>

      {/* CORE WORKSPACE INTERFACE SPLITTER */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        
        {/* ASYMMETRIC SIDEBAR FILTERED QUEUE POOLS (3 COLUMNS SPAN) */}
        <div className="xl:col-span-3 border border-slate-800 bg-slate-950/40 rounded-2xl p-3.5 flex flex-col space-y-4 shadow-md h-[38rem]">
          <div className="flex bg-slate-950 border border-slate-800/80 p-0.5 rounded-xl shrink-0 gap-0.5 shadow-inner select-none">
            <button type="button" onClick={() => setSidebarTab('standby')} className={`flex-1 py-2 rounded-lg text-[9px] uppercase tracking-wider font-bold transition-all duration-150 cursor-pointer ${sidebarTab === 'standby' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}>
              Standby ({standbyPool.length})
            </button>
            <button type="button" onClick={() => setSidebarTab('excused')} className={`flex-1 py-2 rounded-lg text-[9px] uppercase tracking-wider font-bold transition-all duration-150 cursor-pointer ${sidebarTab === 'excused' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}>
              Excused ({excusedPool.length})
            </button>
            <button type="button" onClick={() => setSidebarTab('unexcused')} className={`flex-1 py-2 rounded-lg text-[9px] uppercase tracking-wider font-bold transition-all duration-150 cursor-pointer ${sidebarTab === 'unexcused' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}>
              Unexcused ({unexcusedPool.length})
            </button>
          </div>

          {/* Roster Queue Card Iteration Loops */}
          <div className="space-y-2 overflow-y-auto pr-0.5 scrollbar-thin h-full">
            {(sidebarTab === 'standby' ? standbyPool : sidebarTab === 'excused' ? excusedPool : unexcusedPool).map(([uid, m]) => {
              const jobData = jobsCatalog[m.jobCode] || { name: 'Unassigned', colorTheme: '#475569' };
              return (
                <div 
                  key={uid}
                  draggable={sidebarTab === 'standby'}
                  onDragStart={(e) => { e.dataTransfer.setData("text/plain", uid); }}
                  className="p-3 rounded-xl border border-slate-800/80 bg-slate-900/30 text-xs font-mono shadow-sm flex flex-col space-y-1.5 relative group"
                >
                  <div className="flex items-center gap-2 font-sans font-bold text-slate-200 text-xs">
                    <IconUser /> {m.displayName || 'Raid Member'}
                  </div>
                  <div className="text-[10px] font-sans font-semibold tracking-wide" style={{ color: jobData.colorTheme }}>
                    {jobData.name}
                  </div>
                  <div className="text-[8px] text-slate-600 tracking-tight font-mono">id: {uid}</div>
                  
                  {/* Action Toggles allowing items to shift across state pools */}
                  {user?.isOfficer && (
                    <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => toggleStatusBucket(uid, 'excused')} className={`p-1 rounded text-[8px] font-bold border transition ${excusedList.has(uid) ? 'bg-amber-600/20 text-amber-400 border-amber-500/30' : 'bg-slate-950 text-slate-400 border-slate-800'}`} title="Mark as Excused">EX</button>
                      <button onClick={() => toggleStatusBucket(uid, 'unexcused')} className={`p-1 rounded text-[8px] font-bold border transition ${unexcusedList.has(uid) ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-slate-950 text-slate-400 border-slate-800'}`} title="Mark as Unexcused">UN</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ⚔️ PERFECT IN-GAME MIRROR CANVAS CONTAINER (9 COLUMNS SPAN) */}
        <div className="xl:col-span-9 border border-slate-800 bg-slate-950/60 rounded-2xl p-4 shadow-xl overflow-x-auto overflow-y-auto scrollbar-thin max-h-[38rem]">
          <div 
            className="grid gap-2 min-w-[1000px]"
            style={{ gridTemplateColumns: `repeat(${dimensions.columns}, minmax(0, 1fr))` }}
          >
            {/* Dynamic Column Headers array block mapping Party 1 to N */}
            {Array.from({ length: dimensions.columns }).map((_, cIdx) => (
              <div key={cIdx} className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest text-center py-1 select-none border-b border-slate-900 pb-2">
                Party {cIdx + 1}
              </div>
            ))}

            {/* Twin-Axis Coordinate Grid Matrix Renderer mapping Columns x Rows */}
            {Array.from({ length: dimensions.rows }).map((_, rIdx) => (
              Array.from({ length: dimensions.columns }).map((_, cIdx) => {
                const coordKey = `${cIdx + 1}-${rIdx + 1}`;
                const allocatedUserUid = gridMatrix[coordKey];
                const memberProfile = allocatedUserUid ? members[allocatedUserUid] : null;
                const jobProfile = memberProfile ? jobsCatalog[memberProfile.jobCode] : null;

                // Evaluate whether this target quadrant falls inside a pending destructive down-resizing overlay phase
                const isUndergoingReductionOverlay = (cIdx + 1) > pendingDimensions.columns || (rIdx + 1) > pendingDimensions.rows;

                return (
                  <div
                    key={coordKey}
                    onDragOver={(e) => { if (!isUndergoingReductionOverlay) e.preventDefault(); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (isUndergoingReductionOverlay) return;
                      const droppedUid = e.dataTransfer.getData("text/plain");
                      if (droppedUid) setGridMatrix(prev => ({ ...prev, [coordKey]: droppedUid }));
                    }}
                    className={`rounded-xl border p-2.5 min-h-[95px] flex flex-col justify-between transition-all font-mono text-xs shadow-inner relative group select-none ${
                      isUndergoingReductionOverlay 
                        ? 'bg-rose-950/10 border-rose-900/20 opacity-50 border-dashed select-none' 
                        : allocatedUserUid 
                          ? 'bg-slate-900/90 border-slate-800 hover:border-slate-700' 
                          : 'bg-slate-950/30 border-dashed border-slate-900 hover:border-slate-800 text-slate-700'
                    }`}
                  >
                    {isUndergoingReductionOverlay ? (
                      <div className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center text-[9px] text-rose-400 font-bold uppercase tracking-wider text-center p-1">Pending Removal</div>
                    ) : allocatedUserUid && memberProfile ? (
                      <>
                        <div className="font-sans font-bold text-slate-200 text-xs truncate max-w-full" title={memberProfile.displayName}>
                          {memberProfile.displayName}
                        </div>
                        <div className="text-[10px] font-sans font-semibold tracking-wide truncate max-w-full" style={{ color: jobProfile?.colorTheme || '#475569' }}>
                          {jobProfile?.name || 'Unassigned'}
                        </div>
                        <div className="text-[8px] text-slate-650 tracking-tighter mt-1">id: {allocatedUserUid}</div>
                        
                        {/* Inline cell removal toggle */}
                        {user?.isOfficer && (
                          <button 
                            type="button"
                            onClick={() => {
                              const nextMatrix = { ...gridMatrix };
                              delete nextMatrix[coordKey];
                              setGridMatrix(nextMatrix);
                            }}
                            className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-[9px] text-slate-500 hover:text-rose-400 cursor-pointer font-bold"
                          >
                            ✖
                          </button>
                        )}
                      </>
                    ) : (
                      <div className="h-full flex items-center justify-center italic text-[9px] text-slate-800 font-medium tracking-wide">
                        + VACANT
                      </div>
                    )}
                  </div>
                );
              })
            ))}
          </div>
        </div>

      </div>

      {/* MODAL WINDOW FOR RESIZING SAFEGUARDS */}
      {showResizeConfirmation && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <h2 className="text-sm font-bold tracking-wider uppercase text-rose-400">Confirm Destructive Grid Resizing?</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Warning: Reducing grid size configurations will delete positions outside the new boundaries. Displaced player cards will automatically move back to the **`[Standby]`** sidebar pool.
            </p>
            <div className="flex justify-end gap-3 pt-2 font-mono text-xs">
              <button 
                type="button"
                onClick={() => { setPendingDimensions(dimensions); setShowResizeConfirmation(false); }}
                className="px-4 py-2 border border-slate-800 bg-slate-950 text-slate-400 hover:text-white rounded-xl transition cursor-pointer"
              >
                Cancel Changes
              </button>
              <button 
                type="button"
                onClick={executeTopologyCommit}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold uppercase tracking-wider transition shadow-lg cursor-pointer"
              >
                Confirm & Apply
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
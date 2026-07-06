// frontend/src/pages/MasterListTab.jsx
import { useState, useEffect } from 'react';

const backendUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';

const IconUser = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M12 7a4 4 0 100-8 4 4 0 000 8z" /></svg>;
const IconShield = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
const IconTrash = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" /></svg>;
const IconSync = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H17" /></svg>;
const IconX = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>;

export default function MasterListTab({ user }) {
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState({});
  const [jobsCatalog, setJobsCatalog] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [syncing, setSyncing] = useState(false);
  
  const [sortKey, setSortKey] = useState('name'); 
  const [sortOrder, setSortOrder] = useState('asc'); 

  // 🔒 High-Security Eviction Modal States
  const [vanishTarget, setVanishTarget] = useState(null);
  const [confirmKeyword, setConfirmKeyword] = useState('');

  const [rosterSearch, setRosterSearch] = useState('');

  const loadRosterDirectory = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const savedUserSession = localStorage.getItem('dynasty_raid_session');
      const headers = { 'Content-Type': 'application/json' };
      if (savedUserSession) {
        headers['x-user-profile'] = encodeURIComponent(savedUserSession);
      }

      const res = await fetch(`${backendUrl}/api/requests/init`, { method: 'GET', headers, credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setMembers(data.members || {});
        
        const configRes = await fetch(`${backendUrl}/api/requests/settings/get`, { method: 'GET', headers, credentials: 'include' });
        const configData = await configRes.json();
        if (configData.success && configData.config?.jobs) {
          setJobsCatalog(configData.config.jobs);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRosterDirectory();
  }, [user]);

  const handleSyncDiscordRoster = async () => {
    try {
      setSyncing(true);
      const savedUserSession = localStorage.getItem('dynasty_raid_session');
      const headers = { 'Content-Type': 'application/json' };
      if (savedUserSession) headers['x-user-profile'] = encodeURIComponent(savedUserSession);

      await fetch(`${backendUrl}/api/requests/sync-roster`, { method: 'POST', headers, credentials: 'include' });
      await loadRosterDirectory();
    } catch (err) {
      console.error(err);
    } finally {
      setSyncing(false);
    }
  };

  const handleRosterMutation = async (uid, updates) => {
    // Optimistic Update: Modify state locally first for a smooth 0ms change reflection
    setMembers(prev => {
      const updated = { ...prev };
      if (updated[uid]) {
        updated[uid] = { ...updated[uid], ...updates };
      }
      return updated;
    });

    try {
      const savedUserSession = localStorage.getItem('dynasty_raid_session');
      const headers = { 'Content-Type': 'application/json' };
      if (savedUserSession) headers['x-user-profile'] = encodeURIComponent(savedUserSession);

      await fetch(`${backendUrl}/api/attendance/update-roster-status`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ targetUid: uid, updates }),
        credentials: 'include'
      });
      // Pass false so it synchronizes seamlessly in the background with zero visual flashing
      await loadRosterDirectory(false);
    } catch (err) {
      console.error(err);
      // Revert cache elements automatically if the network channel fails
      loadRosterDirectory(true);
    }
  };

  const handleExecuteVanish = async () => {
    if (confirmKeyword !== 'YES' || !vanishTarget) return;
    try {
      const savedUserSession = localStorage.getItem('dynasty_raid_session');
      const headers = { 'Content-Type': 'application/json' };
      if (savedUserSession) headers['x-user-profile'] = encodeURIComponent(savedUserSession);

      await fetch(`${backendUrl}/api/attendance/vanish`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ targetUid: vanishTarget }),
        credentials: 'include'
      });
      setVanishTarget(null);
      setConfirmKeyword('');
      await loadRosterDirectory();
    } catch (err) {
      console.error(err);
    }
  };

  let trueRosterList = Object.entries(members).filter(([_, m]) => m.isRaidRoster === true);

  // Apply deterministic alphabetical sorting based on active state parameters
  trueRosterList.sort((a, b) => {
    const nameA = (a[1].displayName || '').toLowerCase();
    const nameB = (b[1].displayName || '').toLowerCase();
    if (sortKey === 'name') {
      return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
    }
    return 0;
  });
  const identityPoolList = Object.entries(members).filter(([_, m]) => 
    !m.isRaidRoster && (m.displayName || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Dynamic row sizing bound strictly between 100 and 200 rows capacity configurations
  const stagingRowsCount = Math.min(200, Math.max(100, trueRosterList.length + 5));

  if (loading) {
    return <div className="p-6 text-xs font-mono uppercase text-slate-500 animate-pulse">Syncing Split-State Datasets...</div>;
  }

  return (
    <div className="grid grid-cols-12 gap-5 max-w-[98vw] mx-auto p-1 font-sans animate-fadeIn">
      
      {/* LEFT CANVAS PANEL: TRUE ROSTER (70% WIDTH OVERRIDE) */}
      <div className="col-span-12 lg:col-span-8 space-y-4">
        <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-2xl shadow-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 select-none">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider shrink-0">📋 True Guild Roster ({trueRosterList.length} Active / Cap 200)</h2>
          <input 
            type="text" 
            placeholder="Find in Active Roster..." 
            value={rosterSearch} 
            onChange={(e) => setRosterSearch(e.target.value)} 
            className="w-full sm:w-48 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1 text-[11px] text-slate-200 outline-none focus:border-slate-700 font-sans transition" 
          />
        </div>

        <div className="border border-slate-800 bg-slate-950/40 rounded-2xl overflow-hidden h-[36rem] overflow-y-auto scrollbar-thin">
          <table className="w-full text-left border-collapse text-xs font-mono table-fixed min-w-[700px]">
            <thead>
              <tr className="bg-slate-950 text-slate-500 uppercase tracking-wider text-[9px] border-b border-slate-800 select-none">
                <th 
                  onClick={() => {
                    const nextOrder = sortKey === 'name' && sortOrder === 'asc' ? 'desc' : 'asc';
                    setSortOrder(nextOrder);
                    setSortKey('name');
                  }}
                  className="p-3 pl-5 w-[28%] cursor-pointer hover:text-white select-none transition-colors"
                  title="Click to Sort Alphabetically by Member Name"
                >
                  Member Name <span className="text-indigo-400 ml-1 font-sans text-xs">{sortKey === 'name' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}</span>
                </th>
                <th className="p-3 w-[18%]">SnowflakeID</th>
                <th className="p-3 w-[26%]">Job Class</th>
                <th className="p-3 w-[18%]">Date Joined</th>
                <th className="p-3 text-center w-[10%]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/60">
              {Array.from({ length: stagingRowsCount }).map((_, idx) => {
                const entry = trueRosterList[idx];
                
                if (!entry) {
                  return (
                    <tr 
                      key={`vacant-${idx}`}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const droppedUid = e.dataTransfer.getData("text/plain");
                        const inheritedDate = members[droppedUid]?.joinedAt || new Date().toISOString().slice(0, 10);
                        if (droppedUid) handleRosterMutation(droppedUid, { isRaidRoster: true, joinedAt: inheritedDate });
                      }}
                      className="border-b border-slate-900/20 bg-slate-950/5 border-dashed transition-colors hover:bg-slate-900/5 select-none"
                    >
                      <td colSpan="5" className="p-3 text-center text-[10px] text-slate-700 italic font-sans font-medium border border-dashed border-slate-900/30 m-1 rounded-xl">
                        + Drop identity card here to allocate position slot #{idx + 1}
                      </td>
                    </tr>
                  );
                }

                const [uid, m] = entry;
                const isFoundMatch = rosterSearch.trim() && (m.displayName || '').toLowerCase().includes(rosterSearch.toLowerCase());
                return (
                  <tr key={uid} className={`hover:bg-slate-900/10 transition-colors group ${isFoundMatch ? 'bg-amber-500/10' : ''}`}>
                    <td className="p-3 pl-5 font-sans font-bold truncate">
                      <span className={isFoundMatch ? 'bg-amber-400/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30 shadow-sm animate-pulse' : 'text-slate-200'}>
                        {m.displayName}
                      </span>
                    </td>
                    <td className="p-3 text-slate-500 tracking-tight text-[10px] select-all">{uid}</td>
                    <td className="p-3">
                      <select 
                        value={m.jobCode || ''} 
                        disabled={!user?.isOfficer}
                        onChange={(e) => handleRosterMutation(uid, { jobCode: e.target.value })}
                        className="bg-slate-950 border border-slate-800 rounded-xl px-2 py-1 text-xs font-sans outline-none w-full font-bold cursor-pointer transition-colors"
                        style={{ 
                          color: jobsCatalog[m.jobCode]?.colorTheme || '#94a3b8',
                          borderColor: jobsCatalog[m.jobCode]?.colorTheme ? `${jobsCatalog[m.jobCode].colorTheme}40` : '#1e293b'
                        }}
                      >
                        <option value="" className="bg-slate-950 text-slate-400 font-sans">Select Job...</option>
                        {Object.entries(jobsCatalog).map(([code, j]) => (
                          <option 
                            key={code} 
                            value={code} 
                            className="bg-slate-950 font-sans font-semibold"
                            style={{ color: j.colorTheme || '#cbd5e1' }}
                          >
                            {j.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3">
                      <input 
                        type="date" 
                        value={m.joinedAt || ''} 
                        disabled={!user?.isOfficer}
                        onChange={(e) => handleRosterMutation(uid, { joinedAt: e.target.value })}
                        className="bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-2.5 py-1 text-center font-sans text-xs outline-none focus:border-slate-700 w-full cursor-pointer"
                      />
                    </td>
                    <td className="p-3 text-center">
                      {user?.isOfficer && (
                        <button 
                          onClick={() => handleRosterMutation(uid, { isRaidRoster: false })}
                          className="text-slate-600 hover:text-rose-400 transition cursor-pointer"
                          title="Return Member to Discord Pool"
                        >
                          <IconTrash />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* RIGHT DRAWER PANEL: DISCORD FEEDER IDENTITY POOL (30% WIDTH OVERRIDE) */}
      <div className="col-span-12 lg:col-span-4 space-y-4">
        <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-2xl shadow-md space-y-3 flex flex-col justify-between select-none">
          <div className="flex justify-between items-center">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5"><IconUser /> Discord Feeder Pool</h2>
            <button 
              onClick={handleSyncDiscordRoster}
              disabled={syncing || !user?.isOfficer}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] uppercase font-bold tracking-wide border border-indigo-500/30 bg-indigo-950/20 text-indigo-400 hover:bg-indigo-600 hover:text-white transition rounded-xl shadow-sm cursor-pointer disabled:opacity-20"
            >
              <IconSync /> {syncing ? 'Syncing...' : 'Sync'}
            </button>
          </div>
          <input 
            type="text" 
            placeholder="Search Pool Identities..." 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            className="w-full bg-slate-950 border border-slate-800/80 rounded-xl px-3 py-1.5 text-[11px] text-slate-200 outline-none focus:border-slate-700 font-sans transition shadow-inner" 
          />
        </div>

        <div className="border border-slate-800 bg-slate-950/40 rounded-2xl p-3 h-[31.5rem] overflow-y-auto scrollbar-thin space-y-2">
          {identityPoolList.map(([uid, m]) => (
            <div 
              key={uid}
              draggable={user?.isOfficer}
              onDragStart={(e) => { e.dataTransfer.setData("text/plain", uid); }}
              className="p-3 rounded-xl border border-slate-800/80 bg-slate-900/30 text-xs font-mono shadow-sm flex flex-col space-y-1 relative group cursor-grab active:cursor-grabbing hover:border-slate-700 transition-colors"
            >
              <div className="font-sans font-bold text-slate-200 truncate pr-16">{m.displayName}</div>
              <div className="text-[9px] text-slate-600 tracking-tighter">id: {uid}</div>
              <div className="text-[8px] text-slate-500 font-sans mt-0.5">Date Joined: {m.joinedAt || '---'}</div>
              
              {user?.isOfficer && (
                <div className="absolute right-2.5 top-3.5 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    type="button"
                    onClick={() => {
                      const inheritedDate = m.joinedAt || new Date().toISOString().slice(0, 10);
                      handleRosterMutation(uid, { isRaidRoster: true, joinedAt: inheritedDate });
                    }}
                    className="px-2 py-0.5 bg-indigo-950/30 border border-indigo-500/20 hover:bg-indigo-600 text-[9px] font-bold uppercase tracking-wider text-indigo-400 hover:text-white rounded-lg cursor-pointer transition-colors"
                  >
                    Add
                  </button>
                  <button 
                    type="button"
                    onClick={() => setVanishTarget(uid)}
                    className="px-2 py-0.5 bg-rose-950/30 border border-rose-500/20 hover:bg-rose-600 text-[9px] font-bold uppercase tracking-wider text-rose-400 hover:text-white rounded-lg cursor-pointer transition-colors"
                  >
                    Vanish
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* CRITICAL DOUBLE-CONFIRMATION VANISH MODAL */}
      {vanishTarget && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <h2 className="text-sm font-bold tracking-wider uppercase text-rose-500">🚨 Program Severe Guild Eviction?</h2>
            <p className="text-xs text-slate-400 leading-relaxed font-sans">
              This action triggers an administrative kick command to remove **{members[vanishTarget]?.displayName}** on the actual Discord server application and permanently erases all tracking profile properties from your database trees.
            </p>
            <div className="space-y-1 font-mono text-xs">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Type keyword <strong className="text-white">YES</strong> to execute:</label>
              <input 
                type="text" 
                value={confirmKeyword}
                onChange={(e) => setConfirmKeyword(e.target.value)}
                placeholder="YES" 
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-center text-amber-500 font-bold font-mono tracking-widest outline-none"
              />
            </div>
            <div className="flex justify-end gap-3 pt-1 font-mono text-xs select-none">
              <button 
                type="button"
                onClick={() => { setVanishTarget(null); setConfirmKeyword(''); }}
                className="px-4 py-2 border border-slate-800 bg-slate-950 text-slate-400 hover:text-white rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="button"
                disabled={confirmKeyword !== 'YES'}
                onClick={handleExecuteVanish}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-10 text-white rounded-xl font-bold uppercase tracking-wider transition shadow-lg cursor-pointer"
              >
                Execute Server Eviction
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
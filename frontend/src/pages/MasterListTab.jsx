// frontend/src/pages/MasterListTab.jsx
import { useState, useEffect } from 'react';

const backendUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';

const IconUser = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M12 7a4 4 0 100-8 4 4 0 000 8z" /></svg>;
const IconShield = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
const IconTrash = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" /></svg>;
const IconSync = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H17" /></svg>;
const IconX = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>;
const IconSave = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2v-9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>;

export default function MasterListTab({ user }) {
  const [loading, setLoading] = useState(true);
  const [dbMembers, setDbMembers] = useState({});
  const [stagedMembers, setStagedMembers] = useState({});
  const [jobsCatalog, setJobsCatalog] = useState({});
  const [rolesCatalog, setRolesCatalog] = useState({});
  const [rosterSearch, setRosterSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [sortKey, setSortKey] = useState('name'); 
  const [sortOrder, setSortOrder] = useState('asc'); 

  const [vanishTarget, setVanishTarget] = useState(null);
  const [confirmKeyword, setConfirmKeyword] = useState('');

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
        setDbMembers(data.members || {});
        setStagedMembers(JSON.parse(JSON.stringify(data.members || {})));
        
        const configRes = await fetch(`${backendUrl}/api/requests/settings/get`, { method: 'GET', headers, credentials: 'include' });
        const configData = await configRes.json();
        if (configData.success) {
          setJobsCatalog(configData.config?.jobs || {});
          setRolesCatalog(configData.config?.roles || {});
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
      await loadRosterDirectory(true);
    } catch (err) {
      console.error(err);
    } finally {
      setSyncing(false);
    }
  };

  const handleStageLocalUpdate = (uid, field, value) => {
    setStagedMembers(prev => {
      const updated = { ...prev };
      if (updated[uid]) {
        updated[uid] = { ...updated[uid], [field]: value };
      }
      return updated;
    });
  };

  const handleSaveRosterProgress = async () => {
    try {
      setSaving(true);
      const savedUserSession = localStorage.getItem('dynasty_raid_session');
      const headers = { 'Content-Type': 'application/json' };
      if (savedUserSession) headers['x-user-profile'] = encodeURIComponent(savedUserSession);

      const res = await fetch(`${backendUrl}/api/attendance/roster/save-batch`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ stagedMembers }),
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        alert('💾 SUCCESS: Master list parameters synchronized completely.');
        await loadRosterDirectory(false);
      } else {
        alert(data.error || 'Failed to sync roster updates.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
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

  const activeRaidRosterList = Object.entries(stagedMembers).filter(([_, m]) => m.isRaidRoster === true);

  activeRaidRosterList.sort((a, b) => {
    const nameA = (a[1].displayName || '').toLowerCase();
    const nameB = (b[1].displayName || '').toLowerCase();
    if (sortKey === 'name') {
      return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
    }
    return 0;
  });

  const identityPoolList = Object.entries(stagedMembers).filter(([_, m]) => 
    !m.isRaidRoster && (m.displayName || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isDirty = JSON.stringify(dbMembers) !== JSON.stringify(stagedMembers);
  const stagingRowsCount = Math.min(200, Math.max(100, activeRaidRosterList.length + 5));

  if (loading) {
    return <div className="p-6 text-xs font-mono uppercase text-slate-500 animate-pulse">Syncing Split-State Datasets...</div>;
  }

  return (
    <div className="grid grid-cols-12 gap-5 max-w-[98vw] mx-auto p-1 font-sans animate-fadeIn pb-24">
      
      {/* MASTER ACTIVE DIRECTORY PANEL */}
      <div className="col-span-12 lg:col-span-9 space-y-4">
        <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-2xl shadow-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 select-none">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider shrink-0">📋 True Guild Roster ({activeRaidRosterList.length} Active / Cap 200)</h2>
          <input 
            type="text" 
            placeholder="Find in Active Roster..." 
            value={rosterSearch} 
            onChange={(e) => setRosterSearch(e.target.value)} 
            className="w-full sm:w-48 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1 text-[11px] text-slate-200 outline-none focus:border-slate-700 font-sans transition" 
          />
        </div>

        <div className="border border-slate-800 bg-slate-950/40 rounded-2xl overflow-hidden h-[36rem] overflow-y-auto scrollbar-thin">
          <table className="w-full text-left border-collapse text-xs font-mono table-fixed min-w-[950px]">
            <thead>
              <tr className="bg-slate-950 text-slate-500 uppercase tracking-wider text-[9px] border-b border-slate-800 select-none">
                <th 
                  onClick={() => {
                    const nextOrder = sortKey === 'name' && sortOrder === 'asc' ? 'desc' : 'asc';
                    setSortOrder(nextOrder);
                    setSortKey('name');
                  }}
                  className="p-3 pl-5 w-[20%] cursor-pointer hover:text-white transition-colors"
                >
                  Member Name <span className="text-indigo-400 ml-1 font-sans text-xs">{sortKey === 'name' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}</span>
                </th>
                <th className="p-3 w-[14%]">SnowflakeID</th>
                <th className="p-3 w-[20%]">Job Class</th>
                <th className="p-3 w-[18%]">Role Classification</th>
                <th className="p-3 w-[13%]">Group Assignment</th>
                <th className="p-3 w-[10%]">Date Joined</th>
                <th className="p-3 text-center w-[5%]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/60">
              {Array.from({ length: stagingRowsCount }).map((_, idx) => {
                const entry = activeRaidRosterList[idx];
                
                if (!entry) {
                  return (
                    <tr 
                      key={`vacant-${idx}`}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const droppedUid = e.dataTransfer.getData("text/plain");
                        const inheritedDate = stagedMembers[droppedUid]?.joinedAt || new Date().toISOString().slice(0, 10);
                        if (droppedUid) {
                          handleStageLocalUpdate(droppedUid, 'isRaidRoster', true);
                          handleStageLocalUpdate(droppedUid, 'joinedAt', inheritedDate);
                        }
                      }}
                      className="border-b border-slate-900/20 bg-slate-950/5 border-dashed transition-colors hover:bg-slate-900/5 select-none"
                    >
                      <td colSpan="7" className="p-3 text-center text-[10px] text-slate-700 italic font-sans font-medium border border-dashed border-slate-900/30 m-1 rounded-xl">
                        + Drop identity card here to allocate position slot #{idx + 1}
                      </td>
                    </tr>
                  );
                }

                const [uid, m] = entry;
                const isFoundMatch = rosterSearch.trim() && (m.displayName || '').toLowerCase().includes(rosterSearch.toLowerCase());
                const isGhost = m.status === 'Ghost';

                return (
                  <tr key={uid} className={`hover:bg-slate-900/10 transition-colors group ${isFoundMatch ? 'bg-amber-500/10' : ''} ${isGhost ? 'bg-rose-950/5 text-slate-400' : ''}`}>
                    <td className="p-3 pl-5 font-sans font-bold truncate">
                      <div className="flex items-center gap-2">
                        <span className={isFoundMatch ? 'bg-amber-400/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30 shadow-sm' : 'text-slate-200'}>
                          {m.displayName}
                        </span>
                        {isGhost && (
                          <span className="px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[8px] font-mono uppercase font-black tracking-wide">
                            [Ghost]
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-slate-500 tracking-tight text-[10px] select-all">{uid}</td>
                    <td className="p-3">
                      <select 
                        value={m.jobCode || ''} 
                        disabled={!user?.isOfficer}
                        onChange={(e) => handleStageLocalUpdate(uid, 'jobCode', e.target.value)}
                        className="bg-slate-950 border border-slate-800 rounded-xl px-2 py-1 text-xs font-sans queen-select-box outline-none w-full font-bold cursor-pointer transition-colors"
                        style={{ 
                          color: jobsCatalog[m.jobCode]?.colorTheme || '#94a3b8',
                          borderColor: jobsCatalog[m.jobCode]?.colorTheme ? `${jobsCatalog[m.jobCode].colorTheme}40` : '#1e293b'
                        }}
                      >
                        <option value="" className="bg-slate-950 text-slate-400 font-sans">Select Job...</option>
                        {Object.entries(jobsCatalog).map(([code, j]) => (
                          <option key={code} value={code} className="bg-slate-950 font-sans font-semibold" style={{ color: j.colorTheme || '#cbd5e1' }}>
                            {j.name}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="p-3">
                      <select
                        value={m.roleCode || ''}
                        disabled={!user?.isOfficer}
                        onChange={(e) => handleStageLocalUpdate(uid, 'roleCode', e.target.value)}
                        className="bg-slate-950 border border-slate-800 rounded-xl px-2 py-1 text-xs font-sans outline-none w-full text-indigo-400 font-bold border-indigo-900/30 cursor-pointer"
                      >
                        <option value="" className="text-slate-500 bg-slate-950">Select Role...</option>
                        {Object.entries(rolesCatalog).map(([code, r]) => (
                          <option key={code} value={code} className="text-indigo-300 bg-slate-950 font-semibold">{r.name}</option>
                        ))}
                      </select>
                    </td>

                    <td className="p-3">
                      <input 
                        type="text"
                        value={m.groupTag || ''}
                        disabled={!user?.isOfficer}
                        placeholder="e.g. Team A"
                        onChange={(e) => handleStageLocalUpdate(uid, 'groupTag', e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-2.5 py-1 text-xs font-sans outline-none focus:border-slate-700 font-medium"
                      />
                    </td>

                    <td className="p-3">
                      <input 
                        type="date" 
                        value={m.joinedAt || ''} 
                        disabled={!user?.isOfficer}
                        onChange={(e) => handleStageLocalUpdate(uid, 'joinedAt', e.target.value)}
                        className="bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-2 py-1 text-center font-sans text-xs outline-none focus:border-slate-700 w-full cursor-pointer"
                      />
                    </td>
                    <td className="p-3 text-center">
                      {user?.isOfficer && (
                        <button 
                          onClick={() => handleStageLocalUpdate(uid, 'isRaidRoster', false)}
                          className="text-slate-600 hover:text-rose-400 transition cursor-pointer"
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

      {/* DISCORD DISCOVERY POOL DRAWER */}
      <div className="col-span-12 lg:col-span-3 space-y-4">
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
              <div className="absolute right-2.5 top-3.5 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  type="button"
                  onClick={() => {
                    const inheritedDate = m.joinedAt || new Date().toISOString().slice(0, 10);
                    handleStageLocalUpdate(uid, 'isRaidRoster', true);
                    handleStageLocalUpdate(uid, 'joinedAt', inheritedDate);
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
            </div>
          ))}
        </div>
      </div>

      {/* PERSISTENT MANUAL SAVE STICKY DESK COMPONENT */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-slate-900 bg-slate-950/90 backdrop-blur-md p-4 z-50 shadow-[0_-8px_24px_rgba(0,0,0,0.5)]">
        <div className="mx-auto max-w-6xl flex items-center justify-end gap-4 select-none">
          <button
            type="button"
            onClick={handleSaveRosterProgress}
            disabled={!isDirty || saving || !user?.isOfficer}
            className={`flex items-center gap-1.5 rounded-xl px-6 py-2.5 text-xs font-black uppercase tracking-wider text-white transition-all shadow-xl cursor-pointer ${
              isDirty 
                ? 'bg-indigo-600 hover:bg-indigo-500' 
                : 'bg-slate-900 border border-slate-800 text-slate-600 cursor-not-allowed shadow-none'
            }`}
          >
            <IconSave /> {saving ? 'Committing Batch Data...' : 'Save Roster Progress'}
          </button>
        </div>
      </div>

      {/* VANISH EXVICTION MODAL TARGET */}
      {vanishTarget && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <h2 className="text-sm font-bold tracking-wider uppercase text-rose-500">🚨 Severe Guild Eviction</h2>
            <p className="text-xs text-slate-400 leading-relaxed font-sans">
              This triggers a kick configuration command on the active Discord server and purges all related history rows completely out of your cloud database records.
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
            <div className="flex justify-end gap-3 pt-1 font-mono text-xs">
              <button type="button" onClick={() => { setVanishTarget(null); setConfirmKeyword(''); }} className="px-4 py-2 border border-slate-800 bg-slate-950 text-slate-400 hover:text-white rounded-xl transition cursor-pointer">Cancel</button>
              <button type="button" disabled={confirmKeyword !== 'YES'} onClick={handleExecuteVanish} className="px-5 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-10 text-white rounded-xl font-bold uppercase tracking-wider transition shadow-lg cursor-pointer">Execute Eviction</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
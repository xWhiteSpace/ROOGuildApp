// frontend/src/pages/AttendanceHistoryTab.jsx
import { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, 
  Search, 
  ChevronRight, 
  ArrowLeft,
  X,
  User,
  Layers,
  TrendingUp,
  Mic,
  MicOff,
  CheckCircle,
  XCircle,
  MinusCircle,
  Trash2,
  Swords
} from 'lucide-react';
import { calculatePoints, MAX_RAID_SCORE } from '../utils/attendanceScore';

const backendUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';

export default function AttendanceHistoryTab({ user }) {
  const isOfficer = user?.isOfficer === true;
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState({});
  const [members, setMembers] = useState({});
  const [jobsCatalog, setJobsCatalog] = useState({});
  
  const [activeTabMode, setActiveTabMode] = useState('events'); // 'events' or 'trends'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [selectedMemberUid, setSelectedMemberUid] = useState(null);

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

      const initRes = await fetch(`${backendUrl}/api/requests/init`, { method: 'GET', headers, credentials: 'include' });
      const initData = await initRes.json();
      if (initData.success) {
        setMembers(initData.members || {});
      }

      const settingsRes = await fetch(`${backendUrl}/api/requests/settings/get`, { method: 'GET', headers, credentials: 'include' });
      const settingsData = await settingsRes.json();
      if (settingsData.success && settingsData.config) {
        setJobsCatalog(settingsData.config.jobs || {});
      }

      const res = await fetch(`${backendUrl}/api/live-raid/history/all`, {
        method: 'GET',
        headers,
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        setSessions(data.sessions || {});
      }
    } catch (err) {
      console.error("Error loading attendance history logs:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSession = async (e, sessionId) => {
    e.stopPropagation();
    const session = sessions[sessionId];
    if (!window.confirm(`Delete session "${session?.eventTitle || 'Raid'}" (${session?.eventDate})?\nThis cannot be undone.`)) return;
    try {
      const headers = getRequestHeaders();
      const res = await fetch(`${backendUrl}/api/live-raid/history/${sessionId}`, {
        method: 'DELETE',
        headers,
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setSessions((prev) => {
          const next = { ...prev };
          delete next[sessionId];
          return next;
        });
        if (selectedSessionId === sessionId) setSelectedSessionId(null);
      } else {
        alert(`Failed to delete: ${data.error}`);
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  // Officer toggle: confirm/unconfirm in-game presence for a member on an archived session (+1 raid score).
  const handleToggleInGameStatus = async (sessionId, uid) => {
    if (!isOfficer || !sessionId || !uid) return;
    const prevConfirmed = sessions[sessionId]?.inGameStatus?.[uid] === true;
    const nextConfirmed = !prevConfirmed;

    setSessions((prev) => {
      const session = prev[sessionId];
      if (!session) return prev;
      const nextInGame = { ...(session.inGameStatus || {}) };
      if (nextConfirmed) nextInGame[uid] = true;
      else delete nextInGame[uid];
      return {
        ...prev,
        [sessionId]: { ...session, inGameStatus: nextInGame },
      };
    });

    try {
      const headers = getRequestHeaders();
      const res = await fetch(`${backendUrl}/api/live-raid/history/${sessionId}/in-game`, {
        method: 'PATCH',
        headers,
        credentials: 'include',
        body: JSON.stringify({ userId: uid, confirmed: nextConfirmed }),
      });
      const data = await res.json();
      if (!data.success) {
        // Revert optimistic update
        setSessions((prev) => {
          const session = prev[sessionId];
          if (!session) return prev;
          const nextInGame = { ...(session.inGameStatus || {}) };
          if (prevConfirmed) nextInGame[uid] = true;
          else delete nextInGame[uid];
          return {
            ...prev,
            [sessionId]: { ...session, inGameStatus: nextInGame },
          };
        });
        alert(data.error || 'Failed to update in-game status.');
      }
    } catch (err) {
      setSessions((prev) => {
        const session = prev[sessionId];
        if (!session) return prev;
        const nextInGame = { ...(session.inGameStatus || {}) };
        if (prevConfirmed) nextInGame[uid] = true;
        else delete nextInGame[uid];
        return {
          ...prev,
          [sessionId]: { ...session, inGameStatus: nextInGame },
        };
      });
      alert(`Error: ${err.message}`);
    }
  };

  useEffect(() => {
    loadHistoryData();
  }, [user]);

  // --- VIEW A: RAID LOG HISTORY (BY EVENT/DATE) ---
  const sortedSessionsList = useMemo(() => {
    return Object.values(sessions).sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0));
  }, [sessions]);

  const filteredSessionsList = useMemo(() => {
    if (!searchQuery.trim()) return sortedSessionsList;
    return sortedSessionsList.filter(s => 
      s.eventTitle?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      s.eventDate?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [sortedSessionsList, searchQuery]);

  // Master List Driven Loop for True Single Source of Truth (SSOT)
  const sessionRosterTableRows = useMemo(() => {
    if (!selectedSessionId || !sessions[selectedSessionId]) return [];
    const targetSession = sessions[selectedSessionId];
    const rows = [];

    Object.entries(members).forEach(([uid, profile]) => {
      if (profile.isRaidRoster !== true) return;

      const userTicks = targetSession.userTallies?.[uid] || 0;
      const totalPulses = targetSession.totalPulses || 0;

      const commitment = targetSession.commitments?.[uid] || 'None';
      const inGameConfirmed = targetSession.inGameStatus?.[uid] === true;

      const pts = calculatePoints(commitment, userTicks, totalPulses, inGameConfirmed);

      rows.push({
        uid,
        displayName: profile.displayName || 'Unknown Raider',
        jobCode: profile.jobCode || '',
        commitment,
        presentTicks: userTicks,
        totalPulses,
        inGameConfirmed,
        points: pts
      });
    });

    return rows.sort((a, b) => b.points.total - a.points.total || a.displayName.localeCompare(b.displayName));
  }, [selectedSessionId, sessions, members]);

  const sessionPlayerTally = useMemo(() => {
    const total = sessionRosterTableRows.length;
    const played = sessionRosterTableRows.filter((row) => row.presentTicks > 0).length;
    return { played, total };
  }, [sessionRosterTableRows]);

  // --- VIEW B: MEMBER TRENDS TRACKER ---
  const filteredMembersList = useMemo(() => {
    const list = Object.entries(members)
      .filter(([_, p]) => p.isRaidRoster === true)
      .map(([uid, p]) => ({ uid, displayName: p.displayName || 'Unknown Raider', jobCode: p.jobCode || '' }));
    
    if (!searchQuery.trim()) return list.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return list.filter(m => m.displayName.toLowerCase().includes(searchQuery.toLowerCase()))
               .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [members, searchQuery]);

  // Compile full chronological history array for a selected player
  const memberTrendTimeline = useMemo(() => {
    if (!selectedMemberUid) return [];
    const timeline = [];

    // Sort active sessions chronically to follow path timelines
    const chronologicalSessions = Object.values(sessions).sort((a, b) => (a.endedAt || 0) - (b.endedAt || 0));

    chronologicalSessions.forEach(s => {
      const userTicks = s.userTallies?.[selectedMemberUid] || 0;
      const totalPulses = s.totalPulses || 0;

      const commitment = s.commitments?.[selectedMemberUid] || 'None';
      const inGameConfirmed = s.inGameStatus?.[selectedMemberUid] === true;

      const pts = calculatePoints(commitment, userTicks, totalPulses, inGameConfirmed);

      timeline.push({
        sessionId: s.id,
        eventTitle: s.eventTitle || 'Raid run',
        eventDate: s.eventDate,
        points: pts
      });
    });

    // Slice to show exclusively the last 8 runs for readable graph footprints
    return timeline.slice(-8);
  }, [selectedMemberUid, sessions]);

  // Native Pure-SVG Path Generator for the Line Graph
  const svgGraphPath = useMemo(() => {
    if (memberTrendTimeline.length < 2) return '';
    const width = 500;
    const height = 120;
    const padX = 36;
    const padY = 20;

    const pointsCount = memberTrendTimeline.length;
    const stepX = (width - padX * 2) / (pointsCount - 1);

    return memberTrendTimeline.map((item, index) => {
      const x = padX + index * stepX;
      const y = height - padY - ((item.points.total / MAX_RAID_SCORE) * (height - padY * 2));
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  }, [memberTrendTimeline]);

  return (
    <div className="space-y-4 max-w-[98vw] mx-auto p-1 font-sans text-slate-200">
      
      {/* TWO-WAY SUB-NAV MODE SELECTOR */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 shadow-md flex flex-col sm:flex-row items-center justify-between gap-4 select-none">
        <div>
          <span className="text-[10px] font-mono font-bold tracking-widest text-slate-500 uppercase block">Raid Governance</span>
          <h1 className="text-md font-black tracking-wider text-slate-100 uppercase mt-0.5">Attendance Performance Deck</h1>
        </div>

        <div className="flex bg-slate-950 border border-slate-850 p-0.5 rounded-xl shrink-0">
          <button
            onClick={() => { setActiveTabMode('events'); setSelectedSessionId(null); setSelectedMemberUid(null); setSearchQuery(''); }}
            className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all flex items-center gap-1.5 ${activeTabMode === 'events' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <Layers size={13} /> Raid Log Ledger
          </button>
          <button
            onClick={() => { setActiveTabMode('trends'); setSelectedSessionId(null); setSelectedMemberUid(null); setSearchQuery(''); }}
            className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all flex items-center gap-1.5 ${activeTabMode === 'trends' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <TrendingUp size={13} /> Member Trend Card
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-24 text-[11px] text-slate-500 font-mono italic animate-pulse">
          Synchronizing historical point architectures from Realtime Database...
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-4 items-start">
          
          {/* ================= MODE A: RAID LOG HISTORY ================= */}
          {activeTabMode === 'events' && (
            <>
              {/* Left Selector Deck */}
              <div className={`col-span-12 ${selectedSessionId ? 'xl:col-span-3' : 'xl:col-span-12'} space-y-3`}>
                {!selectedSessionId && (
                  <div className="relative w-full">
                    <input 
                      type="text" 
                      placeholder="Search Logs by date or title..." 
                      value={searchQuery} 
                      onChange={(e) => setSearchQuery(e.target.value)} 
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-2 text-xs outline-none focus:border-slate-700 font-sans transition-all" 
                    />
                    <div className="absolute left-2.5 top-3 text-slate-500"><Search size={14} /></div>
                  </div>
                )}

                <div className="space-y-2 max-h-[68vh] overflow-y-auto pr-1 scrollbar-thin">
                  {filteredSessionsList.map((s) => {
                    const isSelected = selectedSessionId === s.id;
                    return (
                      <div
                        key={s.id}
                        onClick={() => setSelectedSessionId(s.id)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer group ${isSelected ? 'bg-slate-900 border-indigo-500 shadow' : 'bg-slate-950/40 border-slate-900 hover:border-slate-800'}`}
                      >
                        <div className="flex justify-between items-center gap-2">
                          <div className="truncate min-w-0">
                            <span className="text-[9px] font-mono font-bold tracking-widest text-slate-500 block">{s.eventDate}</span>
                            <h4 className="text-xs font-black uppercase text-slate-200 tracking-wider truncate mt-0.5">{s.eventTitle || 'Raid'}</h4>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isOfficer && (
                              <button
                                type="button"
                                onClick={(e) => handleDeleteSession(e, s.id)}
                                className="p-1 rounded-lg text-slate-700 hover:text-rose-400 hover:bg-rose-950/40 transition-colors opacity-0 group-hover:opacity-100"
                                title="Delete session"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                            <ChevronRight size={14} className="text-slate-600" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Detail Ledger Table */}
              {selectedSessionId && (
                <div className="col-span-12 xl:col-span-9 bg-slate-950/60 border border-slate-800 rounded-3xl p-4 shadow-xl space-y-4 animate-fadeIn">
                  <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                    <div className="flex items-center gap-3">
                      <button onClick={() => setSelectedSessionId(null)} className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition cursor-pointer">
                        <ArrowLeft size={14} />
                      </button>
                      <div>
                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-200">
                          {sessions[selectedSessionId]?.eventTitle} ({sessions[selectedSessionId]?.eventDate})
                        </h3>
                        <span className="text-[9px] font-mono text-indigo-400">Committed By: {sessions[selectedSessionId]?.committedBy || 'System'}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-black font-mono text-slate-100 tracking-tight">
                        {sessionPlayerTally.played}
                        <span className="text-slate-500 font-bold">/{sessionPlayerTally.total}</span>
                      </div>
                      <div className="text-[9px] font-mono font-bold uppercase tracking-widest text-slate-500">Players</div>
                    </div>
                  </div>

                  <div className="overflow-x-auto border border-slate-900 rounded-xl bg-slate-950">
                    <table className="min-w-full divide-y divide-slate-900 font-sans text-xs">
                      <thead className="bg-slate-900/45 text-[9px] font-mono font-bold uppercase tracking-wider text-slate-400 select-none">
                        <tr>
                          <th className="px-4 py-2.5 text-left">Character Name</th>
                          <th className="px-4 py-2.5 text-center w-24">Calendar Status</th>
                          <th className="px-4 py-2.5 text-center w-24">Discord Presence</th>
                          <th className="px-4 py-2.5 text-center w-24">In-game Status</th>
                          <th className="px-4 py-2.5 text-center w-28">Duration pulse</th>
                          <th className="px-4 py-2.5 text-right w-28">Raid Score</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900 font-mono text-[12px]">
                        {sessionRosterTableRows.map((row) => {
                          const jobObj = jobsCatalog[row.jobCode];
                          const scoreRatio = row.points.total / MAX_RAID_SCORE;
                          return (
                            <tr key={row.uid} className={`hover:bg-slate-900/20 transition-colors ${scoreRatio === 0 ? 'bg-rose-950/5' : ''}`}>
                              <td className="px-4 py-2 flex items-center gap-2 font-sans">
                                <img src={`/assets/icons/classes/${jobObj?.iconFile || 'default.svg'}`} alt="" className="w-4 h-4 object-contain shrink-0" onError={(e)=>{e.target.style.display='none';}} />
                                <div>
                                  <span className="font-bold text-slate-100 block">{row.displayName}</span>
                                  <span className="text-[8px] tracking-wide text-slate-500 uppercase font-mono block">{jobObj?.name || 'NO CLASS'}</span>
                                </div>
                              </td>
                              <td className="px-4 py-2 text-center">
                                <div className="flex justify-center">
                                  {row.points.calPt === 1.0 ? (
                                    <CheckCircle size={15} className={row.commitment === 'Leave' ? 'text-amber-500' : 'text-emerald-400'} title={row.commitment} />
                                  ) : (
                                    <XCircle size={15} className="text-slate-600 opacity-40" title="Uncommitted / No Signup" />
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-2 text-center">
                                <div className="flex justify-center">
                                  {row.points.discPt === 1.0 ? <Mic size={15} className="text-indigo-400" /> : <MicOff size={15} className="text-slate-600 opacity-40" />}
                                </div>
                              </td>
                              <td className="px-4 py-2 text-center">
                                <div className="flex justify-center">
                                  <button
                                    type="button"
                                    disabled={!isOfficer}
                                    onClick={() => handleToggleInGameStatus(selectedSessionId, row.uid)}
                                    title={row.inGameConfirmed ? 'In-game confirmed (+1). Click to unset.' : 'Not confirmed in-game. Click to confirm (+1).'}
                                    className={`p-1 rounded-lg transition ${
                                      isOfficer ? 'cursor-pointer hover:bg-slate-900' : 'cursor-default'
                                    } ${row.inGameConfirmed ? 'text-cyan-400' : 'text-slate-600 opacity-40'}`}
                                  >
                                    <Swords size={15} />
                                  </button>
                                </div>
                              </td>
                              <td className="px-4 py-2 text-center text-slate-400 text-[11px]">
                                {row.presentTicks} / {row.totalPulses} <span className="text-[9px] text-slate-600">({Math.round(row.points.durationPt * 100)}%)</span>
                              </td>
                              <td className={`px-4 py-2 text-right font-black font-sans ${row.points.total === MAX_RAID_SCORE ? 'text-emerald-400' : row.points.total >= 2.0 ? 'text-amber-500' : 'text-rose-500'}`}>
                                {row.points.total.toFixed(2)} <span className="text-[9px] text-slate-500 font-normal">/ {MAX_RAID_SCORE.toFixed(1)}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ================= MODE B: MEMBER TRENDS ================= */}
          {activeTabMode === 'trends' && (
            <>
              {/* Left Selector Deck */}
              <div className={`col-span-12 ${selectedMemberUid ? 'xl:col-span-3' : 'xl:col-span-12'} space-y-3`}>
                <div className="relative w-full">
                  <input 
                    type="text" 
                    placeholder="Search Character name..." 
                    value={searchQuery} 
                    onChange={(e) => setSearchQuery(e.target.value)} 
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-2 text-xs outline-none focus:border-slate-700 font-sans transition-all" 
                  />
                  <div className="absolute left-2.5 top-3 text-slate-500"><Search size={14} /></div>
                </div>

                <div className="space-y-1.5 max-h-[68vh] overflow-y-auto pr-1 scrollbar-thin">
                  {filteredMembersList.map((m) => {
                    const isSelected = selectedMemberUid === m.uid;
                    const jobObj = jobsCatalog[m.jobCode];
                    return (
                      <div
                        key={m.uid}
                        onClick={() => setSelectedMemberUid(m.uid)}
                        className={`p-2.5 rounded-xl border flex items-center gap-2.5 transition-all cursor-pointer ${isSelected ? 'bg-slate-900 border-indigo-500 shadow' : 'bg-slate-950/40 border-slate-900 hover:border-slate-800'}`}
                      >
                        <img src={`/assets/icons/classes/${jobObj?.iconFile || 'default.svg'}`} alt="" className="w-4 h-4 object-contain" onError={(e)=>{e.target.style.display='none';}} />
                        <span className="text-xs font-bold text-slate-200">{m.displayName}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Detail Sparkline Trend Tracker */}
              {selectedMemberUid && (
                <div className="col-span-12 xl:col-span-9 bg-slate-950/60 border border-slate-800 rounded-3xl p-5 shadow-xl animate-fadeIn space-y-6">
                  <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                    <div className="flex items-center gap-3">
                      <button onClick={() => setSelectedMemberUid(null)} className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition cursor-pointer">
                        <ArrowLeft size={14} />
                      </button>
                      <div>
                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-100">
                          {members[selectedMemberUid]?.displayName} Reliability Trend
                        </h3>
                        <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block mt-0.5">Timeline monitoring: Last 8 consecutive lockouts</span>
                      </div>
                    </div>
                  </div>

                  {/* NATIVE PURE-SVG SPARKLINE GRAPH PLOT GRID */}
                  {memberTrendTimeline.length >= 2 ? (
                    <div className="bg-slate-950 border border-slate-900 rounded-2xl p-4 shadow-inner flex flex-col items-center">
                      <div className="w-full max-w-[500px] h-[130px] relative">
                        <svg className="w-full h-full overflow-visible" viewBox="0 0 500 120" fill="none">
                          {/* Y-axis guides: 100% / 50% / 0% */}
                          <line x1="36" y1="20" x2="464" y2="20" stroke="#334155" strokeWidth="1" strokeDasharray="3 3" />
                          <line x1="36" y1="60" x2="464" y2="60" stroke="#475569" strokeWidth="1" strokeDasharray="2 4" />
                          <line x1="36" y1="100" x2="464" y2="100" stroke="#334155" strokeWidth="1" strokeDasharray="3 3" />
                          <text x="4" y="23" fill="#64748b" fontSize="8" fontFamily="monospace">100%</text>
                          <text x="4" y="63" fill="#64748b" fontSize="8" fontFamily="monospace">50%</text>
                          <text x="4" y="103" fill="#64748b" fontSize="8" fontFamily="monospace">0%</text>
                          
                          {/* Chronological Grid Connectors */}
                          <path d={svgGraphPath} stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                          
                          {/* Coordinates anchor nodes */}
                          {memberTrendTimeline.map((item, index) => {
                            const stepX = (500 - 72) / (memberTrendTimeline.length - 1);
                            const x = 36 + index * stepX;
                            const y = 100 - ((item.points.total / MAX_RAID_SCORE) * 80);
                            return (
                              <g key={index} className="group cursor-pointer">
                                <circle cx={x} cy={y} r="4" className="fill-indigo-500 stroke-slate-950" strokeWidth="1.5" />
                                <circle cx={x} cy={y} r="8" className="fill-indigo-500/0 hover:fill-indigo-500/10 transition-all" />
                              </g>
                            );
                          })}
                        </svg>
                      </div>
                      <div className="w-full max-w-[500px] flex justify-between text-[8px] font-mono font-bold uppercase tracking-wide text-slate-500 px-3 mt-1 select-none">
                        <span>Earlier scores</span>
                        <span>Last 8 consecutive</span>
                        <span>Latest score</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-[11px] text-slate-500 font-mono italic">Insufficient dataset depth history to compute graphical lines matrix.</div>
                  )}

                  {/* FLAT TIMELINE GRID CARDS */}
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
                    <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-slate-500 block mb-2 select-none">Flat Milestone Check-ins:</span>
                    {memberTrendTimeline.map((log, index) => (
                      <div key={index} className="bg-slate-900/30 border border-slate-900 p-2 px-3 rounded-xl flex items-center justify-between font-mono text-xs">
                        <div className="truncate pr-4">
                          <span className="text-[8px] text-slate-500 block">{log.eventDate}</span>
                          <span className="font-sans font-bold text-slate-300 uppercase tracking-wide truncate mt-0.5 block">{log.eventTitle}</span>
                        </div>
                        <div className="flex items-center gap-4 shrink-0 font-sans text-right">
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                            <span title={`Calendar: ${log.points.calPt} pt`} className={log.points.calPt === 1.0 ? 'text-emerald-400' : 'text-slate-600'}>
                              {log.points.calPt === 1.0 ? <Calendar size={12} /> : <XCircle size={12} />}
                            </span>
                            <span title={`Discord Voice Presence: ${log.points.discPt} pt`} className={log.points.discPt === 1.0 ? 'text-indigo-400' : 'text-slate-600'}>
                              {log.points.discPt === 1.0 ? <Mic size={12} /> : <MicOff size={12} />}
                            </span>
                            <span title={`In-game Status: ${log.points.inGamePt} pt`} className={log.points.inGamePt === 1.0 ? 'text-cyan-400' : 'text-slate-600 opacity-40'}>
                              <Swords size={12} />
                            </span>
                            <span title={`Duration pulse: ${log.points.durationPt.toFixed(2)} pt`} className="text-[9px] font-mono text-slate-600">({Math.round(log.points.durationPt * 100)}%)</span>
                          </div>
                          <span className={`font-black text-sm ${log.points.total === MAX_RAID_SCORE ? 'text-emerald-400' : log.points.total >= 2.0 ? 'text-amber-500' : 'text-rose-500'}`}>
                            {log.points.total.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    )).reverse()}
                  </div>
                </div>
              )}
            </>
          )}

        </div>
      )}

    </div>
  );
}
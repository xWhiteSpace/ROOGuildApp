// frontend/src/pages/Scheduler.jsx
import { useState, useEffect } from 'react';

const backendUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';

// --- 🎨 HIGHEST QUALITY PRODUCTION SVG VECTOR PLATES ---
const IconLeft = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>;
const IconRight = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>;
const IconRaidFlash = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>;
const IconCheck = () => <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>;
const IconLeave = () => <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>;
const IconClock = () => <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>;

export default function Scheduler({ user }) {
  const [loading, setLoading] = useState(true);
  const [eventsCatalog, setEventsCatalog] = useState({});
  const [commitments, setCommitments] = useState({});
  
  // Navigation State Calendar Context Framework
  const [viewDate, setViewDate] = useState(new Date(2026, 6, 1)); // Default focused inside July 2026
  const [selectedDayContext, setSelectedDayContext] = useState(null);

  const loadSchedulerEcosystem = async () => {
    try {
      setLoading(true);
      const savedUserSession = localStorage.getItem('dynasty_raid_session');
      const headers = { 'Content-Type': 'application/json' };
      if (savedUserSession) {
        headers['x-user-profile'] = encodeURIComponent(savedUserSession);
      }

      // Fetch global SSOT event configurations 
      const configRes = await fetch(`${backendUrl}/api/requests/settings/get`, { method: 'GET', headers, credentials: 'include' });
      const configData = await configRes.json();
      if (configData.success && configData.config?.events) {
        setEventsCatalog(configData.config.events);
      }

      // Fetch live user commitments maps
      const initRes = await fetch(`${backendUrl}/api/requests/init`, { method: 'GET', headers, credentials: 'include' });
      const initData = await initRes.json();
      if (initData.success) {
        setCommitments(initData.commitments || {});
      }
    } catch (err) {
      console.error("Scheduler loading sequence error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchedulerEcosystem();
  }, [user]);

  const handleLogCommitment = async (dateStr, eventId, statusTarget) => {
    try {
      const savedUserSession = localStorage.getItem('dynasty_raid_session');
      const headers = { 'Content-Type': 'application/json' };
      if (savedUserSession) headers['x-user-profile'] = encodeURIComponent(savedUserSession);

      // Optimistic Local State Update for instantaneous 0ms visual transformation
      const compositeKey = `${dateStr}_${eventId}`;
      setCommitments(prev => {
        const updated = { ...prev };
        if (statusTarget === 'None') {
          if (updated[compositeKey]) {
            const userGroupClone = { ...updated[compositeKey] };
            delete userGroupClone[user.id];
            updated[compositeKey] = userGroupClone;
          }
        } else {
          updated[compositeKey] = {
            ...updated[compositeKey],
            [user.id]: {
              displayName: user.displayName || user.username || 'Active Raider',
              status: statusTarget,
              declaredAt: Date.now()
            }
          };
        }
        return updated;
      });

      await fetch(`${backendUrl}/api/attendance/commit-availability`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ dateStr, eventId, status: statusTarget }),
        credentials: 'include'
      });
    } catch (err) {
      console.error("Failed to commit player alignment window:", err);
      loadSchedulerEcosystem();
    }
  };

  // --- 📅 DETERMINISTIC CALENDAR NATIVE MATH ENGINE ---
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalMonthDays = new Date(year, month + 1, 0).getDate();

  const calendarGridCells = [];
  // Pad out matching blank buffer cells for offset days of preceding week tracks
  for (let i = 0; i < firstDayIndex; i++) {
    calendarGridCells.push(null);
  }
  // Populate true calculated calendar days
  for (let day = 1; day <= totalMonthDays; day++) {
    calendarGridCells.push(day);
  }

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const handlePrevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setViewDate(new Date(year, month + 1, 1));

  // Auto-Match Helper: Scans phase 3 configs to discover matching raid items for a given calendar day
  const getEventForDay = (dayNum) => {
    if (!dayNum) return null;
    const dateObj = new Date(year, month, dayNum);
    const dayOfWeek = dateObj.getDay(); // 0 = Sunday, 2 = Tuesday, 4 = Thursday etc.

    // Evaluate against global SSOT catalog configurations
    const match = Object.entries(eventsCatalog).find(([_, ev]) => {
      const phase3 = ev.phases?.[3];
      return phase3 && parseInt(phase3.dayStart, 10) === dayOfWeek;
    });

    if (!match) return null;
    
    // Construct formatting string components YYYY-MM-DD
    const pad = (n) => String(n).padStart(2, '0');
    const computedDateStr = `${year}-${pad(month + 1)}-${pad(dayNum)}`;

    return {
      eventId: match[0],
      config: match[1],
      dateStr: computedDateStr,
      dayNum
    };
  };

  // Instantiate active context selection default fallback logic
  const activeDayFocus = selectedDayContext || getEventForDay(new Date().getDate()) || getEventForDay(5);
  const userCurrentStatus = activeDayFocus ? commitments[`${activeDayFocus.dateStr}_${activeDayFocus.eventId}`]?.[user?.id]?.status : null;

  if (loading) {
    return <div className="p-6 text-xs font-mono uppercase text-slate-500 animate-pulse tracking-widest">Compiling Operational Leave Calendars...</div>;
  }

  return (
    <div className="grid grid-cols-12 gap-5 max-w-[98vw] mx-auto p-1 font-sans animate-fadeIn">
      
      {/* LEFT PANEL: PURE NATIVE VIEWPORT CALENDAR CANVAS (75% OVERRIDE) */}
      <div className="col-span-12 lg:col-span-9 space-y-4">
        <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-2xl shadow-md flex justify-between items-center select-none">
          <div className="flex items-center gap-3">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">🗓️ {monthNames[month]} {year}</h2>
          </div>
          <div className="flex gap-1.5">
            <button onClick={handlePrevMonth} className="p-2 border border-slate-800 bg-slate-950 hover:bg-slate-900 rounded-xl transition text-slate-400 hover:text-white cursor-pointer"><IconLeft /></button>
            <button onClick={handleNextMonth} className="p-2 border border-slate-800 bg-slate-950 hover:bg-slate-900 rounded-xl transition text-slate-400 hover:text-white cursor-pointer"><IconRight /></button>
          </div>
        </div>

        <div className="border border-slate-800 bg-slate-950/40 rounded-3xl p-4 shadow-xl">
          {/* Day Header Strips */}
          <div className="grid grid-cols-7 gap-2 text-center text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono mb-3 select-none pb-2 border-b border-slate-900">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d}>{d}</div>)}
          </div>

          {/* Core Layout Grid Cells Matrix */}
          <div className="grid grid-cols-7 gap-2.5">
            {calendarGridCells.map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} className="bg-slate-950/10 border border-transparent rounded-2xl min-h-[5.5rem]" />;
              }

              const eventMatch = getEventForDay(day);
              const isCurrentlySelected = activeDayFocus && activeDayFocus.dayNum === day;
              
              // Resolve active counters for matching event nodes
              let liveConfirmedCount = 0;
              let liveLeaveCount = 0;
              let userPersonalStatus = null;

              if (eventMatch) {
                const dayCommitmentNode = commitments[`${eventMatch.dateStr}_${eventMatch.eventId}`] || {};
                
                // Track your personal logged status signature for immediate grid display
                if (dayCommitmentNode[user?.id]) {
                  userPersonalStatus = dayCommitmentNode[user.id].status;
                }

                Object.values(dayCommitmentNode).forEach(c => {
                  if (c.status === 'Confirmed') liveConfirmedCount++;
                  if (c.status === 'Leave') liveLeaveCount++;
                });
              }

              // Compute structural indicators dynamically to eliminate loose floating markers/dots
              const statusClasses = userPersonalStatus === 'Confirmed'
                ? 'border-l-2 border-l-emerald-500 bg-emerald-500/5 shadow-[inset_1px_0_0_rgba(16,185,129,0.2)]'
                : userPersonalStatus === 'Leave'
                  ? 'border-l-2 border-l-slate-700 opacity-40 bg-slate-950/10'
                  : '';

              // Apply symmetrical left-border color accents to maximize real-time status scannability
              const stateStyles = userPersonalStatus === 'Confirmed'
                ? 'border-l-2 border-l-emerald-500 bg-emerald-500/[0.02] shadow-[inset_1px_0_0_rgba(16,185,129,0.1)]'
                : userPersonalStatus === 'Leave'
                  ? 'border-l-2 border-l-amber-500 bg-amber-500/[0.02] shadow-[inset_1px_0_0_rgba(245,158,11,0.1)]'
                  : '';

              return (
                <div
                  key={`day-${day}`}
                  onClick={() => eventMatch && setSelectedDayContext(eventMatch)}
                  className={`p-3 rounded-2xl border min-h-[6rem] transition-all relative flex flex-col justify-between ${
                    eventMatch 
                      ? `${isCurrentlySelected ? 'border-indigo-500 bg-indigo-950/30 shadow-[0_0_15px_rgba(99,102,241,0.15)]' : 'border-slate-800/80 bg-slate-900/20 hover:border-slate-700'} ${stateStyles} cursor-pointer group`
                      : 'border-slate-900/40 bg-slate-950/10 text-slate-600 select-none'
                  }`}
                >
                  {/* Top Day Number Row */}
                  <div className="flex justify-between items-center select-none w-full">
                    <span className={`text-xs font-bold font-mono ${eventMatch ? 'text-slate-400' : 'text-slate-700'}`}>{day}</span>
                  </div>

                  {/* Operational Event Highlights Container */}
                  {eventMatch && (
                    <div className="space-y-2 mt-2">
                      <div className="flex items-center gap-1 text-[10px] font-bold text-indigo-400/90 font-sans truncate">
                        <span className="p-0.5 rounded bg-indigo-500/10 text-indigo-400 shrink-0"><IconRaidFlash /></span>
                        <span className="truncate uppercase tracking-tight">{eventMatch.config.title}</span>
                      </div>
                      
                      {/* Clean Typographic Minimalist Counters */}
                      <div className="flex justify-end items-center gap-2 font-mono text-[10px] font-bold select-none opacity-40 group-hover:opacity-100 transition-opacity">
                        <span className="text-emerald-500">P:{liveConfirmedCount}</span>
                        <span className="text-amber-500">L:{liveLeaveCount}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* RIGHT PANEL: INTERACTIVE RAIDER COMMITMENT HUB (25% OVERRIDE) */}
      <div className="col-span-12 lg:col-span-3 space-y-4">
        <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-2xl shadow-md select-none">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">⚡ Raider Commitment Desk</h3>
        </div>

        {activeDayFocus ? (
          <div className="border border-slate-800 bg-slate-950/40 rounded-3xl p-5 space-y-5 shadow-xl">
            {/* Selected Date Context Headers */}
            <div className="space-y-1 select-none">
              <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest">Selected Operation</span>
              <h4 className="text-sm font-black text-slate-200 tracking-wide font-sans mt-0.5">⚔️ {activeDayFocus.config.title}</h4>
              <div className="text-xs font-mono text-indigo-400 font-bold mt-1 bg-indigo-950/20 border border-indigo-900/40 rounded-xl px-3 py-1.5 flex items-center justify-between">
                <span>{activeDayFocus.dateStr}</span>
              </div>
            </div>

            {/* Local Time Frame Coordinates Block */}
            <div className="bg-slate-900/20 border border-slate-900 rounded-2xl p-3.5 space-y-2 select-none">
              <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                <IconClock /> Phase 3 Action Window
              </div>
              <div className="text-xs font-mono font-bold text-slate-300 pl-5">
                {activeDayFocus.config.phases?.[3]?.timeStart || '20:55'} ~ {activeDayFocus.config.phases?.[3]?.timeEnd || '22:15'}
              </div>
            </div>

            {/* Interactive Functional Trigger Button Toggles */}
            <div className="space-y-2 pt-1">
              <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest select-none block mb-1">Declare Your Availability Profile:</span>
              
              <button
                type="button"
                onClick={() => {
                  const nextStatus = userCurrentStatus === 'Confirmed' ? 'None' : 'Confirmed';
                  handleLogCommitment(activeDayFocus.dateStr, activeDayFocus.eventId, nextStatus);
                }}
                className={`w-full p-3 rounded-2xl border text-xs font-bold font-sans uppercase tracking-wide flex items-center justify-between transition-all transform active:scale-98 cursor-pointer ${
                  userCurrentStatus === 'Confirmed'
                    ? 'border-emerald-500 bg-emerald-950/20 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.1)]'
                    : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <span>Confirm Present</span>
                {userCurrentStatus === 'Confirmed' && <IconCheck />}
              </button>

              <button
                type="button"
                onClick={() => {
                  const nextStatus = userCurrentStatus === 'Leave' ? 'None' : 'Leave';
                  handleLogCommitment(activeDayFocus.dateStr, activeDayFocus.eventId, nextStatus);
                }}
                className={`w-full p-3 rounded-2xl border text-xs font-bold font-sans uppercase tracking-wide flex items-center justify-between transition-all transform active:scale-98 cursor-pointer ${
                  userCurrentStatus === 'Leave'
                    ? 'border-amber-500 bg-amber-950/20 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.1)]'
                    : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <span>Request Leave / Absence</span>
                {userCurrentStatus === 'Leave' && <IconLeave />}
              </button>
            </div>

            {/* Real-time Confirmation Badge Status Footnote */}
            <div className="border-t border-slate-900 pt-3 select-none">
              <div className="bg-slate-950 rounded-xl p-3 text-[10px] font-mono text-slate-500 leading-relaxed text-center">
                {userCurrentStatus ? (
                  <span>Status locked as <strong className={`${userCurrentStatus === 'Confirmed' ? 'text-emerald-400' : 'text-amber-400'} uppercase font-sans`}>[{userCurrentStatus}]</strong>. Officers can view this instantly on the party canvas page.</span>
                ) : (
                  <span>⚠️ You have not declared status updates for this upcoming operation night.</span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="border border-dashed border-slate-800 bg-slate-950/10 rounded-3xl p-8 text-center text-xs font-mono italic text-slate-600 select-none">
            Select any active operational event slot on the calendar grid coordinates to declare profile availability parameters.
          </div>
        )}
      </div>

    </div>
  );
}
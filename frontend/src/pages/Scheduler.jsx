// frontend/src/pages/Scheduler.jsx
import { useState, useEffect, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Check, 
  X, 
  Clock, 
  Tag, 
  Trash2, 
  Edit3, 
  AlertCircle 
} from 'lucide-react';

const backendUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';

export default function Scheduler({ user }) {
  const calendarRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [eventsCatalog, setEventsCatalog] = useState({});
  const [commitments, setCommitments] = useState({});
  const [specialEvents, setSpecialEvents] = useState({});
  
  const [specialCategoriesList, setSpecialCategoriesList] = useState(["Raid", "Meeting", "PVP", "Casual"]);
  const [selectedDayContext, setSelectedDayContext] = useState(null);
  const [activeNavView, setActiveNavView] = useState('month');
  const [calendarTitle, setCalendarTitle] = useState('July 2026');
  
  // Modal States
  const [showAddModal, setShowAddModal] = useState(false);
  const [editEventId, setEditEventId] = useState(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formTimeStart, setFormTimeStart] = useState('21:30');
  const [formTimeEnd, setFormTimeEnd] = useState('23:00');
  const [formType, setFormType] = useState('Raid');
  const [formDesc, setFormDesc] = useState('');
  const [formTracked, setFormTracked] = useState(true);

  const loadSchedulerEcosystem = async () => {
    try {
      setLoading(true);
      const savedUserSession = localStorage.getItem('dynasty_raid_session');
      const headers = { 'Content-Type': 'application/json' };
      if (savedUserSession) headers['x-user-profile'] = encodeURIComponent(savedUserSession);

      const configRes = await fetch(`${backendUrl}/api/requests/settings/get`, { method: 'GET', headers, credentials: 'include' });
      const configData = await configRes.json();
      if (configData.success && configData.config?.events) setEventsCatalog(configData.config.events);
      if (configData.success && configData.config?.specialEventCategories) setSpecialCategoriesList(configData.config.specialEventCategories);

      const initRes = await fetch(`${backendUrl}/api/requests/init`, { method: 'GET', headers, credentials: 'include' });
      const initData = await initRes.json();
      if (initData.success) setCommitments(initData.commitments || {});
      
      const specialRes = await fetch(`${backendUrl}/api/attendance/special-events`, { method: 'GET', headers, credentials: 'include' });
      const specialData = await specialRes.json();
      if (specialData.success) setSpecialEvents(specialData.specialEvents || {});
    } catch (err) {
      console.error("Scheduler load failure:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchedulerEcosystem();
  }, [user]);

  // Update Custom Header Text when calendar switches months/views
  const updateHeaderTitle = () => {
    if (calendarRef.current) {
      setCalendarTitle(calendarRef.current.getApi().view.title);
    }
  };

  useEffect(() => {
    if (!loading) setTimeout(updateHeaderTitle, 50);
  }, [loading, activeNavView]);

  // View Switcher Trigger mapping to standard views
  const handleViewChange = (viewType) => {
    setActiveNavView(viewType);
    const api = calendarRef.current?.getApi();
    if (api) {
      api.changeView(viewType === 'month' ? 'dayGridMonth' : 'timeGridWeek');
      updateHeaderTitle();
    }
  };

  const handlePrev = () => {
    calendarRef.current?.getApi().prev();
    updateHeaderTitle();
  };

  const handleNext = () => {
    calendarRef.current?.getApi().next();
    updateHeaderTitle();
  };

  // 🛡️ TIMEZONE-SAFE LOCAL DATE EXTRACTOR: Prevents UTC conversions from shifting date strings
  const formatDateToLocalString = (dateObj) => {
    if (!dateObj) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}`;
  };

  // ─── TRANSLATE FIREBASE DATA STREAM INTO CALENDAR DATA CONTRACT ───
  const getFormattedEvents = () => {
    const list = [];

    // 1. Weekly Template Events (FullCalendar handles daysOfWeek repetition natively)
    Object.entries(eventsCatalog).forEach(([id, ev]) => {
      const p3 = ev.phases?.[3];
      if (p3) {
        list.push({
          id,
          title: ev.title,
          startTime: p3.timeStart || "20:55",
          endTime: p3.timeEnd || "22:15",
          daysOfWeek: [parseInt(p3.dayStart, 10)],
          className: 'fc-event-template',
          extendedProps: { isSpecial: false, config: ev }
        });
      }
    });

    // 2. Absolute Ad-Hoc Special Events
    Object.entries(specialEvents).forEach(([id, ev]) => {
      list.push({
        id,
        title: ev.title,
        start: `${ev.date}T${ev.timeStart}`,
        end: `${ev.date}T${ev.timeEnd}`,
        className: 'fc-event-special',
        extendedProps: { isSpecial: true, config: { title: ev.title, phases: { 3: { timeStart: ev.timeStart, timeEnd: ev.timeEnd } } }, details: ev, dateStr: ev.date }
      });
    });

    return list;
  };

  const handleAddSpecialEvent = async () => {
    if (!formTitle.trim() || !formDate) return alert("Fill required inputs.");
    try {
      const savedUserSession = localStorage.getItem('dynasty_raid_session');
      const headers = { 'Content-Type': 'application/json' };
      if (savedUserSession) headers['x-user-profile'] = encodeURIComponent(savedUserSession);

      const isEdit = !!editEventId;
      const url = isEdit ? `${backendUrl}/api/attendance/special-events/${editEventId}` : `${backendUrl}/api/attendance/special-events/add`;

      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers,
        body: JSON.stringify({ title: formTitle, description: formDesc, date: formDate, timeStart: formTimeStart, timeEnd: formTimeEnd, type: formType, isAttendanceTracked: formTracked }),
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        setShowAddModal(false);
        setFormTitle('');
        setFormDesc('');
        setEditEventId(null);
        setSelectedDayContext(null);
        loadSchedulerEcosystem();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogCommitment = async (dateStr, eventId, statusTarget) => {
    try {
      const savedUserSession = localStorage.getItem('dynasty_raid_session');
      const headers = { 'Content-Type': 'application/json' };
      if (savedUserSession) headers['x-user-profile'] = encodeURIComponent(savedUserSession);

      const compositeKey = `${dateStr}_${eventId}`;
      setCommitments(prev => {
        const updated = { ...prev };
        if (statusTarget === 'None') {
          if (updated[compositeKey]) delete updated[compositeKey][user.id];
        } else {
          updated[compositeKey] = {
            ...updated[compositeKey],
            [user.id]: { displayName: user.displayName || user.username || 'Raider', status: statusTarget, declaredAt: Date.now() }
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
      console.error(err);
      loadSchedulerEcosystem();
    }
  };

  const activeDayFocus = selectedDayContext;
  const userCurrentStatus = activeDayFocus ? commitments[`${activeDayFocus.dateStr}_${activeDayFocus.eventId}`]?.[user?.id]?.status : null;

  if (loading) {
    return <div className="p-6 text-xs font-mono text-slate-500 animate-pulse uppercase tracking-widest">Calling Pre-Built API Pipelines...</div>;
  }

  return (
    <div className="grid grid-cols-12 gap-5 max-w-[98vw] mx-auto p-1 font-sans text-slate-200">
      
      {/* 🎨 CLEAN ECOSYSTEM OVERRIDES: Differentiate standard templates from special operations */}
      <style>{`
        .fc-event-template { background-color: rgba(30, 41, 59, 0.45) !important; border-color: rgb(51, 65, 85) !important; cursor: pointer; }
        .fc-event-special { background-color: rgba(109, 40, 217, 0.25) !important; border-color: rgba(139, 92, 246, 0.5) !important; cursor: pointer; }
        .fc .fc-event-title { font-size: 10px !important; text-transform: uppercase !important; font-weight: 700 !important; tracking: wide; padding: 2px 4px; color: #f8fafc !important; }
        .fc-timegrid-event { border-radius: 8px !important; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
      `}</style>
      
      {/* LEFT COMPONENT: CORE FULLCALENDAR EMBED ENGINE */}
      <div className="col-span-12 lg:col-span-9 space-y-4">
        <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-2xl flex justify-between items-center select-none">
          <div className="flex items-center gap-4 flex-wrap">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">🗓️ {calendarTitle}</h2>
            {user?.isOfficer && (
              <button
                type="button"
                onClick={() => {
                  setFormTitle(''); setFormDesc(''); setFormDate(new Date().toISOString().split('T')[0]); setEditEventId(null); setShowAddModal(true);
                }}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-[10px] uppercase font-bold text-white transition flex items-center gap-1.5 shadow cursor-pointer"
              >
                <Plus size={14} strokeWidth={2.5} /> Add Special Event
              </button>
            )}

            <div className="flex bg-slate-950 p-0.5 rounded-xl border border-slate-800/80 gap-0.5 shadow-inner">
              <button type="button" onClick={() => handleViewChange('month')} className={`px-3 py-1 rounded-lg text-[9px] uppercase font-bold tracking-wider transition ${activeNavView === 'month' ? 'bg-slate-800 text-white shadow' : 'text-slate-500'}`}>Month</button>
              <button type="button" onClick={() => handleViewChange('week')} className={`px-3 py-1 rounded-lg text-[9px] uppercase font-bold tracking-wider transition ${activeNavView === 'week' ? 'bg-slate-800 text-white shadow' : 'text-slate-500'}`}>Week</button>
            </div>
          </div>
          <div className="flex gap-1.5">
            <button onClick={handlePrev} className="p-2 border border-slate-800 bg-slate-950 hover:bg-slate-900 rounded-xl text-slate-400 hover:text-white cursor-pointer"><ChevronLeft size={16} strokeWidth={2.5} /></button>
            <button onClick={handleNext} className="p-2 border border-slate-800 bg-slate-950 hover:bg-slate-900 rounded-xl text-slate-400 hover:text-white cursor-pointer"><ChevronRight size={16} strokeWidth={2.5} /></button>
          </div>
        </div>

        {/* CALENDAR API MOUNT CONTAINER */}
        <div className="border border-slate-800 bg-slate-950/40 rounded-3xl p-4 shadow-xl contextual-calendar-provider">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={false}
            dayMaxEvents={3}
            events={getFormattedEvents()}
            slotMinTime="18:00:00"
            slotMaxTime="24:00:00"
            allDaySlot={false}
            slotEventOverlap={true} // ⚔️ INDUSTRY STANDARD CONFLICT SLICER: Split overlaps side-by-side perfectly
            height="auto"
            eventClick={(info) => {
              const props = info.event.extendedProps;
              const dateStr = props.isSpecial ? props.dateStr : formatDateToLocalString(info.event.start);
              setSelectedDayContext({
                eventId: info.event.id,
                config: props.config,
                dateStr,
                dayNum: info.event.start.getDate(),
                isSpecial: props.isSpecial,
                details: props.details || null
              });
            }}
          />
        </div>
      </div>

      {/* RIGHT COMPONENT: RAIDER AVAILABILITY DESK SIDEBAR */}
      <div className="col-span-12 lg:col-span-3 space-y-4">
        <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-2xl">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">⚡ Raider Commitment Desk</h3>
        </div>

        {activeDayFocus ? (
          <div className="border border-slate-800 bg-slate-950/40 rounded-3xl p-5 space-y-5 shadow-xl animate-fadeIn">
            <div className="space-y-1 select-none">
              <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest">Selected Operation</span>
              <h4 className="text-sm font-black text-slate-200 tracking-wide font-sans mt-0.5">
                {activeDayFocus.isSpecial ? '🔮' : '⚔️'} {activeDayFocus.config.title}
              </h4>
              <div className="text-xs font-mono text-indigo-400 font-bold mt-1 bg-indigo-950/20 border border-indigo-900/40 rounded-xl px-3 py-1.5">
                <span>{activeDayFocus.dateStr}</span>
              </div>
            </div>

            <div className="bg-slate-900/20 border border-slate-900 rounded-2xl p-3.5 space-y-2">
              <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                <Clock size={14} className="text-slate-500" /> Action Window
              </div>
              <div className="text-xs font-mono font-bold text-slate-300 pl-5">
                {activeDayFocus.config.phases?.[3]?.timeStart || '21:30'} ~ {activeDayFocus.config.phases?.[3]?.timeEnd || '23:00'}
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest block mb-1">Declare Your Availability Profile:</span>
              <button type="button" onClick={() => handleLogCommitment(activeDayFocus.dateStr, activeDayFocus.eventId, userCurrentStatus === 'Confirmed' ? 'None' : 'Confirmed')} className={`w-full p-3 rounded-2xl border text-xs font-bold uppercase tracking-wide flex items-center justify-between transition active:scale-95 cursor-pointer ${userCurrentStatus === 'Confirmed' ? 'border-emerald-500 bg-emerald-950/20 text-emerald-400' : 'border-slate-800 bg-slate-900/40 text-slate-400'}`}>
                <span>Confirm Present</span> {userCurrentStatus === 'Confirmed' && <Check size={16} />}
              </button>
              <button type="button" onClick={() => handleLogCommitment(activeDayFocus.dateStr, activeDayFocus.eventId, userCurrentStatus === 'Leave' ? 'None' : 'Leave')} className={`w-full p-3 rounded-2xl border text-xs font-bold uppercase tracking-wide flex items-center justify-between transition active:scale-95 cursor-pointer ${userCurrentStatus === 'Leave' ? 'border-amber-500 bg-amber-950/20 text-amber-400' : 'border-slate-800 bg-slate-900/40 text-slate-400'}`}>
                <span>Request Leave</span> {userCurrentStatus === 'Leave' && <X size={16} />}
              </button>
            </div>

            <div className="border-t border-slate-900 pt-3 text-[10px] font-mono text-slate-500 text-center">
              {userCurrentStatus ? (
                <span>Status: <strong className={userCurrentStatus === 'Confirmed' ? 'text-emerald-400' : 'text-amber-400'}>[{userCurrentStatus}]</strong> synced to live canvas.</span>
              ) : (
                <span>⚠️ Unscheduled deployment node. Please submit sign-up state.</span>
              )}
            </div>

            {/* MANAGEMENT CONTROLS POSITIONED PERFECTLY AT BOTTOM OF HUB CARD */}
            {activeDayFocus.isSpecial && user?.isOfficer && (
              <div className="pt-3 border-t border-slate-900/60 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    const det = activeDayFocus.details || {};
                    setFormTitle(det.title || activeDayFocus.config.title || '');
                    setFormDesc(det.description || '');
                    setFormDate(det.date || activeDayFocus.dateStr || '');
                    setFormTimeStart(det.timeStart || '21:30');
                    setFormTimeEnd(det.timeEnd || '23:00');
                    setFormType(det.type || 'Raid');
                    setFormTracked(det.isAttendanceTracked !== undefined ? det.isAttendanceTracked : true);
                    setEditEventId(activeDayFocus.eventId);
                    setShowAddModal(true);
                  }}
                  className="w-full p-2 rounded-xl border border-indigo-950 bg-indigo-950/20 hover:bg-indigo-600 text-indigo-400 hover:text-white text-[10px] font-bold uppercase tracking-wider transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Edit3 size={13} /> Edit Event Details
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm("Permanently wipe this special ad-hoc deployment block?")) return;
                    try {
                      const savedUserSession = localStorage.getItem('dynasty_raid_session');
                      const headers = { 'Content-Type': 'application/json' };
                      if (savedUserSession) headers['x-user-profile'] = encodeURIComponent(savedUserSession);
                      const res = await fetch(`${backendUrl}/api/attendance/special-events/${activeDayFocus.eventId}`, { method: 'DELETE', headers, credentials: 'include' });
                      const data = await res.json();
                      if (data.success) { setSelectedDayContext(null); loadSchedulerEcosystem(); }
                    } catch (err) { console.error(err); }
                  }}
                  className="w-full p-2 rounded-xl border border-rose-950 bg-rose-950/20 hover:bg-rose-600 text-rose-400 hover:text-white text-[10px] font-bold uppercase tracking-wider transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Trash2 size={13} /> Delete Special Event
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="border border-dashed border-slate-800 bg-slate-950/10 rounded-3xl p-8 text-center text-xs font-mono italic text-slate-600 select-none">
            Select an active event box on the calendar to log profile availability.
          </div>
        )}
      </div>

      {/* MODAL CONFIGURATION HUB OVERLAY */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
          <div className="fixed inset-0 z-0" onClick={() => setShowAddModal(false)} />
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl relative z-10 space-y-4 font-sans text-xs text-slate-200">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold uppercase tracking-wide">{editEventId ? 'Modify Event Data' : 'Schedule Special Instance'}</h2>
              <button type="button" onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white cursor-pointer"><X size={16} /></button>
            </div>
            <div className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Event Title</label>
                <input type="text" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-slate-700" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1"><Tag size={12}/> Category</label>
                  <select value={formType} onChange={(e) => setFormType(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 outline-none cursor-pointer">
                    {specialCategoriesList.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Target Date</label>
                  <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-mono outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Start Time</label>
                  <input type="text" maxLength="5" value={formTimeStart} onChange={(e) => setFormTimeStart(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-center font-mono text-amber-500 font-bold outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">End Time</label>
                  <input type="text" maxLength="5" value={formTimeEnd} onChange={(e) => setFormTimeEnd(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-center font-mono text-amber-400 font-bold outline-none" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1"><AlertCircle size={12}/> Notes</label>
                <textarea rows="2" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 outline-none resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2 font-mono">
              <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 border border-slate-800 bg-slate-950 text-slate-400 hover:text-white rounded-xl transition cursor-pointer">Cancel</button>
              <button type="button" onClick={handleAddSpecialEvent} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold uppercase rounded-xl shadow-lg transition cursor-pointer">{editEventId ? 'Save Changes' : 'Push to Cloud'}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
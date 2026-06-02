// frontend/src/pages/SettingsTab.jsx
import { useState, useEffect } from 'react';

// 🌐 Absolute target network routing parameters for cross-domain Vercel/Render deployments
const backendUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';

const COMMON_TIMEZONES = [
  { value: 'Asia/Manila', label: 'Manila (GMT+8)' },
  { value: 'Asia/Singapore', label: 'Singapore (GMT+8)' },
  { value: 'Asia/Taipei', label: 'Taipei (GMT+8)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (GMT+9)' },
  { value: 'America/New_York', label: 'New York (EST/EDT)' },
  { value: 'UTC', label: 'Coordinated Universal Time (UTC)' }
];

export default function SettingsTab() {
  const [isLocked, setIsLocked] = useState(true);
  const [passphrase, setPassphrase] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  
  // Dynamic Configuration Template Workspace Core States
  const [config, setConfig] = useState({
    timezone: 'Asia/Manila',
    isForceLocked: false,
    adminRoles: [],
    items: [],
    events: {}
  });

  // State handles for inputting new items, roles, and events
  const [newRoleStr, setNewRoleStr] = useState('');
  const [newEventName, setNewEventName] = useState('');

  /**
   * 🛡️ AUTOMATED HEADER EXTRACTOR UTILITY
   * Packs structural identity vectors directly out of the browser's local cache
   * to guarantee safe transit to Render hosts if cookies get dropped by cross-site policies.
   */
  const getRequestHeaders = () => {
    const savedUserSession = localStorage.getItem('dynasty_raid_session');
    const headers = { 'Content-Type': 'application/json' };
    if (savedUserSession) {
      headers['x-user-profile'] = encodeURIComponent(savedUserSession);
    }
    return headers;
  };

  const loadGlobalConfigurationTree = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/requests/settings/get`, {
        method: 'GET',
        headers: getRequestHeaders(),
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
      }
    } catch (err) {
      console.error("Error loading settings from server routing layer:", err);
    }
  };

  useEffect(() => {
    loadGlobalConfigurationTree();
  }, []);

  const handleVerifyPassphrase = async () => {
    try {
      setErrorMsg('');
      const res = await fetch(`${backendUrl}/api/requests/settings/unlock`, {
        method: 'POST',
        headers: getRequestHeaders(),
        credentials: 'include',
        body: JSON.stringify({ masterKey: passphrase })
      });
      const data = await res.json();
      if (data.success) {
        setIsLocked(false);
        setErrorMsg('');
        setPassphrase('');
      } else {
        setErrorMsg(data.error || 'Invalid configuration master verification key.');
      }
    } catch (err) {
      setErrorMsg('Network timeout connecting to server authentication gateway.');
    }
  };

  const handleDetectBrowserTimezone = () => {
    try {
      setSuccessMsg('');
      setErrorMsg('');
      const systemZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (systemZone) {
        setConfig(prev => ({ ...prev, timezone: systemZone }));
        setSuccessMsg(`🧭 Auto-detected browser environment location: ${systemZone}`);
      }
    } catch (e) {
      setErrorMsg('Could not securely auto-detect browser timezone variables.');
    }
  };

  const handleUpdateItemLimit = (id, direction) => {
    const updatedItems = config.items.map(item => {
      if (item.id !== id) return item;
      const currentQty = item.limitQty || 0;
      const nextQty = direction === 'up' ? currentQty + 1 : Math.max(0, currentQty - 1);
      return { ...item, limitQty: nextQty };
    });
    setConfig(prev => ({ ...prev, items: updatedItems }));
  };

  const handleAddItemNode = () => {
    const nextIndex = config.items.length + 1;
    const paddingStr = String(nextIndex).padStart(3, '0');
    const newItemObj = {
      id: `item_${paddingStr}`,
      name: `Custom Loot Classification ${nextIndex}`,
      limitQty: 1
    };
    setConfig(prev => ({ ...prev, items: [...prev.items, newItemObj] }));
  };

  const handleAddRoleNode = () => {
    if (!newRoleStr.trim()) return;
    if (config.adminRoles.includes(newRoleStr.trim())) {
      setErrorMsg('Role string signature already declared.');
      return;
    }
    setConfig(prev => ({ ...prev, adminRoles: [...prev.adminRoles, newRoleStr.trim()] }));
    setNewRoleStr('');
  };

  const handleRemoveRoleNode = (roleName) => {
    setConfig(prev => ({ ...prev, adminRoles: prev.adminRoles.filter(r => r !== roleName) }));
  };

  const handleAddEventNode = () => {
    if (!newEventName.trim()) return;
    const nextEventIndex = Object.keys(config.events || {}).length + 1;
    const paddingStr = String(nextEventIndex).padStart(3, '0');
    const newEventKey = `ev_${paddingStr}`;
    
    const defaultEventStructure = {
      title: newEventName.trim(),
      phases: {
        1: { dayStart: 0, timeStart: "22:15", dayEnd: 1, timeEnd: "22:15" },
        2: { dayStart: 1, timeStart: "22:15", dayEnd: 2, timeEnd: "20:55" },
        3: { dayStart: 2, timeStart: "20:55", dayEnd: 2, timeEnd: "22:15" }
      }
    };

    setConfig(prev => ({
      ...prev,
      events: { ...prev.events, [newEventKey]: defaultEventStructure }
    }));
    setNewEventName('');
  };

  const handleRemoveEventNode = (evKey) => {
    const updatedEvents = { ...config.events };
    delete updatedEvents[evKey];
    setConfig(prev => ({ ...prev, events: updatedEvents }));
  };

  const handlePhaseChange = (evKey, phaseNum, field, value) => {
    const updatedEvents = { ...config.events };
    if (updatedEvents[evKey] && updatedEvents[evKey].phases?.[phaseNum]) {
      updatedEvents[evKey].phases[phaseNum][field] = field.includes('dayStart') || field.includes('dayEnd') ? Number(value) : value;
      setConfig(prev => ({ ...prev, events: updatedEvents }));
    }
  };

  const handleSaveWorkspaceChanges = async () => {
    try {
      setSuccessMsg('');
      setErrorMsg('');
      const res = await fetch(`${backendUrl}/api/requests/settings/save`, {
        method: 'POST',
        headers: getRequestHeaders(),
        credentials: 'include',
        body: JSON.stringify({ config })
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg('✨ Global configurations successfully saved and committed to Firebase.');
        loadGlobalConfigurationTree();
      } else {
        setErrorMsg(data.error || 'Failed to update dynamic configuration matrix.');
      }
    } catch (err) {
      setErrorMsg('Failed to process secure data save configuration transaction payload.');
    }
  };

  const daysOfWeekMap = [
    { value: 0, label: 'Sunday' },
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' }
  ];

  if (isLocked) {
    return (
      <div className="mx-auto max-w-md p-8 text-center text-white border border-slate-800 bg-slate-900 rounded-3xl mt-16 shadow-2xl">
        <div className="text-3xl mb-3 select-none">🔒</div>
        <h2 className="text-base font-black tracking-wider uppercase text-slate-200">Settings Desk Key Locked</h2>
        <p className="text-xs text-slate-400 mt-1 mb-6 font-sans">Input the environment operational master key to release database configuration channels.</p>
        
        <input 
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          placeholder="Enter Operational Master Key..."
          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-center text-amber-500 font-mono tracking-widest outline-none mb-3 focus:border-amber-500/40"
          onKeyDown={(e) => e.key === 'Enter' && handleVerifyPassphrase()}
        />
        {errorMsg && <div className="text-[11px] font-sans font-medium text-rose-400 mb-3">⚠️ {errorMsg}</div>}
        
        <button 
          onClick={handleVerifyPassphrase}
          className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black uppercase tracking-wider transition shadow-lg cursor-pointer"
        >
          Verify Authorization Key
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6 text-white pb-32 font-sans space-y-6">
      
      {/* HEADER SECTION BLOCK */}
      <div className="flex justify-between items-center border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-black anonymity-wider uppercase tracking-tight text-slate-100">⚙️ System Configuration Desk</h1>
          <div className="text-xs text-slate-400 mt-0.5">Modify global server parameters, timetables, and relational layout structures safely.</div>
        </div>
        <button 
          onClick={() => setIsLocked(true)} 
          className="px-3 py-1.5 bg-slate-900 border border-slate-800 text-[10px] uppercase font-black tracking-wider rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
        >
          Lock Channels 🔒
        </button>
      </div>

      {/* FEEDBACK INTERFACES */}
      {successMsg && <div className="bg-emerald-950/20 border border-emerald-500/20 text-emerald-400 text-xs p-3 rounded-xl font-semibold shadow-md">{successMsg}</div>}
      {errorMsg && <div className="bg-rose-950/20 border border-rose-500/20 text-rose-400 text-xs p-3 rounded-xl font-semibold shadow-md">⚠️ {errorMsg}</div>}

      {/* MANUAL OVERRIDE AND GLOBAL TIMEZONE SETTINGS SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* AUTOMATED WEEKLY VS FORCE OVERRIDE SLIDER COMPONENT TOGGLE */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 shadow-md space-y-3 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider">Bidding Gate Switch Controller</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Manually lock registration channels or allow the rolling calendar clock to run automatically.</p>
          </div>
          <div className="flex p-1 bg-slate-950 border border-slate-800 rounded-xl w-full">
            <button 
              onClick={() => setConfig(prev => ({ ...prev, isForceLocked: false }))}
              className={`flex-1 py-2 text-[9px] font-black uppercase tracking-wider rounded-lg transition cursor-pointer ${!config.isForceLocked ? 'bg-indigo-600 text-white shadow-inner' : 'text-slate-500 hover:bg-slate-900/40'}`}
            >
              ⭕ Run Automated Weekly Cycle
            </button>
            <button 
              onClick={() => setConfig(prev => ({ ...prev, isForceLocked: true }))}
              className={`flex-1 py-2 text-[9px] font-black uppercase tracking-wider rounded-lg transition cursor-pointer ${config.isForceLocked ? 'bg-rose-600 text-white shadow-inner' : 'text-slate-500 hover:bg-slate-900/40'}`}
            >
              🔒 Force Hard Override Lockdown
            </button>
          </div>
        </div>

        {/* TIMEZONE SELECTION CONFIGURATION TRACK */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 shadow-md space-y-3 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider">Global Timezone Environment Profile</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Select your target timeline region, or hit Auto-Detect to instantly parse browser configurations.</p>
          </div>
          <div className="flex gap-2">
            <select
              value={config.timezone || 'Asia/Manila'}
              onChange={(e) => setConfig(prev => ({ ...prev, timezone: e.target.value }))}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-sans text-amber-500 outline-none focus:border-slate-700/60 font-semibold"
            >
              {COMMON_TIMEZONES.map(z => <option key={z.value} value={z.value}>{z.label}</option>)}
              {!COMMON_TIMEZONES.find(z => z.value === config.timezone) && (
                <option value={config.timezone}>{config.timezone} (Custom)</option>
              )}
            </select>
            <button
              onClick={handleDetectBrowserTimezone}
              className="px-4 rounded-xl border border-slate-700 bg-slate-950 text-slate-400 hover:text-white text-xs whitespace-nowrap font-bold transition cursor-pointer"
            >
              🧭 Auto-Detect
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 1: REQUEST-RELATED PARAMETERS (EVENTS AND TIME MATRICES MAPPER) */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 shadow-md space-y-4">
        <div className="flex justify-between items-center border-b border-slate-800/80 pb-2">
          <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider">Section 1: Request-Related Timeline & Schedules Mapper</h3>
          <div className="flex gap-2">
            <input 
              type="text"
              placeholder="New Event Title (e.g. CastleSiege)..."
              value={newEventName}
              onChange={(e) => setNewEventName(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 outline-none font-sans"
            />
            <button 
              onClick={handleAddEventNode}
              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-[10px] font-black uppercase tracking-wider rounded-xl transition cursor-pointer"
            >
              ➕ Add Event
            </button>
          </div>
        </div>

        {config.events && Object.keys(config.events).length > 0 ? (
          Object.keys(config.events).map((evKey) => {
            const ev = config.events[evKey];
            return (
              <div key={evKey} className="bg-slate-950 border border-slate-800/60 rounded-xl p-4 space-y-3 font-sans">
                <div className="flex justify-between items-center bg-slate-900/30 p-2 rounded-lg border border-slate-800/40">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-slate-600 font-bold select-none">{evKey}</span>
                    <input 
                      type="text"
                      value={ev.title || ''}
                      onChange={(e) => {
                        const updated = { ...config.events };
                        updated[evKey].title = e.target.value;
                        setConfig(prev => ({ ...prev, events: updated }));
                      }}
                      className="bg-transparent text-sm font-bold text-slate-200 outline-none border-b border-transparent focus:border-slate-700 font-sans"
                    />
                  </div>
                  <button 
                    onClick={() => handleRemoveEventNode(evKey)}
                    className="text-[10px] text-rose-400 hover:text-rose-500 uppercase font-black tracking-wider transition cursor-pointer"
                  >
                    ✖ Remove Event
                  </button>
                </div>

                {/* 3-PHASE ROLLING TIMETABLE CONTROLS */}
                <div className="space-y-2">
                  {['1', '2', '3'].map((phaseNum) => {
                    const phase = ev.phases?.[phaseNum] || { dayStart: 0, timeStart: '00:00', dayEnd: 0, timeEnd: '00:00' };
                    const phaseLabels = { 1: 'Phase 1: Request Open', 2: 'Phase 2: Request Close', 3: 'Phase 3: Event Session' };
                    
                    return (
                      <div key={phaseNum} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center bg-slate-950 p-2 rounded-xl border border-slate-900 text-xs font-mono">
                        <div className="md:col-span-4 text-[11px] font-sans font-bold text-slate-400 flex items-center gap-2">
                          <span className="w-5 h-5 rounded bg-slate-900 flex items-center justify-center font-mono text-[10px] border border-slate-800 text-amber-500 font-black">{phaseNum}</span>
                          {phaseLabels[phaseNum]}
                        </div>
                        
                        {/* Horizon Start Config */}
                        <div className="md:col-span-4 flex items-center gap-1.5">
                          <span className="text-[10px] text-slate-600 uppercase font-sans font-black">Start:</span>
                          <select 
                            value={phase.dayStart}
                            onChange={(e) => handlePhaseChange(evKey, phaseNum, 'dayStart', e.target.value)}
                            className="bg-slate-900 border border-slate-800 text-slate-300 rounded-lg px-2 py-1 outline-none text-xs font-sans w-24"
                          >
                            {daysOfWeekMap.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                          </select>
                          <input 
                            type="text" 
                            maxLength="5"
                            value={phase.timeStart}
                            onChange={(e) => handlePhaseChange(evKey, phaseNum, 'timeStart', e.target.value)}
                            className="bg-slate-900 border border-slate-800 text-amber-500 rounded-lg px-2 py-1 text-center outline-none text-xs w-16"
                            placeholder="22:15"
                          />
                        </div>

                        {/* Horizon End Config */}
                        <div className="md:col-span-4 flex items-center gap-1.5">
                          <span className="text-[10px] text-slate-600 uppercase font-sans font-black">End:</span>
                          <select 
                            value={phase.dayEnd}
                            onChange={(e) => handlePhaseChange(evKey, phaseNum, 'dayEnd', e.target.value)}
                            className="bg-slate-900 border border-slate-800 text-slate-300 rounded-lg px-2 py-1 outline-none text-xs font-sans w-24"
                          >
                            {daysOfWeekMap.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                          </select>
                          <input 
                            type="text" 
                            maxLength="5"
                            value={phase.timeEnd}
                            onChange={(e) => handlePhaseChange(evKey, phaseNum, 'timeEnd', e.target.value)}
                            className="bg-slate-900 border border-slate-800 text-amber-500 rounded-lg px-2 py-1 text-center outline-none text-xs w-16"
                            placeholder="22:15"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-6 text-xs text-slate-500 font-mono">No rolling weekly event nodes mapped inside configuration.</div>
        )}
      </div>

      {/* SECTION 2: SIGN-IN RELATED PARAMETERS */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 shadow-md space-y-4">
        <div className="flex justify-between items-center border-b border-slate-800/80 pb-2">
          <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider">Section 2: Sign-In Related Discord Admin Roles</h3>
          <div className="flex gap-2">
            <input 
              type="text"
              placeholder="Input Server Role Case-Sensitive..."
              value={newRoleStr}
              onChange={(e) => setNewRoleStr(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 outline-none font-sans"
              onKeyDown={(e) => e.key === 'Enter' && handleAddRoleNode()}
            />
            <button 
              onClick={handleAddRoleNode}
              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-[10px] font-black uppercase tracking-wider rounded-xl transition cursor-pointer"
            >
              ➕ Add Role
            </button>
          </div>
        </div>

        <p className="text-[11px] text-slate-500 font-sans">Members matching these exact Discord roles are granted access to execute Officer controls and allocation desks.</p>

        {config.adminRoles && config.adminRoles.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {config.adminRoles.map((role) => (
              <div key={role} className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl font-mono text-xs shadow-sm">
                <span className="text-indigo-400 font-sans font-bold">🛡️ {role}</span>
                <button 
                  onClick={() => handleRemoveRoleNode(role)}
                  className="text-slate-600 hover:text-rose-400 text-[10px] font-black transition pl-1 cursor-pointer"
                  title="Remove authorized string registry"
                >
                  ✖
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-slate-500 font-mono py-2">No custom server mapping limits declared. Defaulting to standard metadata officer checks.</div>
        )}
      </div>

      {/* SECTION 3: IN-GAME RELATED PARAMETERS */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 shadow-md space-y-4">
        <div className="flex justify-between items-center border-b border-slate-800/80 pb-2">
          <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider">Section 3: In-Game Related Item Capacity & Limits</h3>
          <button 
            onClick={handleAddItemNode}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-[10px] font-black uppercase tracking-wider rounded-xl transition cursor-pointer"
          >
            ➕ Add Item
          </button>
        </div>

        <div className="space-y-2 max-w-3xl">
          {config.items && config.items.length > 0 ? (
            config.items.map((item, index) => (
              <div key={item.id} className="grid grid-cols-12 items-center gap-3 bg-slate-950 border border-slate-800/60 p-2.5 rounded-xl font-mono shadow-sm">
                <span className="col-span-1 text-slate-600 font-black text-center text-xs">#{index + 1}</span>
                <span className="col-span-2 text-[10px] text-slate-500 font-bold select-none">{item.id}</span>
                
                <input 
                  type="text"
                  value={item.name || ''}
                  onChange={(e) => {
                    const updated = config.items.map(i => i.id === item.id ? { ...i, name: e.target.value } : i);
                    setConfig(prev => ({ ...prev, items: updated }));
                  }}
                  className="col-span-6 bg-slate-900 border border-slate-800/80 rounded-xl px-3 py-1 text-xs text-slate-200 outline-none focus:border-slate-700 font-sans font-bold"
                  placeholder="Loot Name Track Label..."
                />
                
                {/* ➕ RELATIONAL VALUE INCREMENT CONTROLLER CONTROLS */}
                <div className="col-span-3 flex items-center justify-end gap-2.5 select-none pr-1">
                  <button 
                    onClick={() => handleUpdateItemLimit(item.id, 'down')} 
                    className="w-6 h-6 rounded-lg bg-slate-900 text-slate-400 font-sans text-xs font-black border border-slate-800 hover:bg-slate-800 hover:text-white transition cursor-pointer"
                  >
                    -
                  </button>
                  <span className="text-xs font-black text-amber-500 w-6 text-center tracking-tight">{item.limitQty || 0}</span>
                  <button 
                    onClick={() => handleUpdateItemLimit(item.id, 'up')} 
                    className="w-6 h-6 rounded-lg bg-slate-900 text-slate-400 font-sans text-xs font-black border border-slate-800 hover:bg-slate-800 hover:text-white transition cursor-pointer"
                  >
                    +
                  </button>
                  
                  <button 
                    onClick={() => setConfig(prev => ({ ...prev, items: prev.items.filter(i => i.id !== item.id) }))}
                    className="text-[10px] text-slate-700 hover:text-rose-500 transition pl-1 font-sans font-bold cursor-pointer"
                    title="Delete item node configuration parameters"
                  >
                    ✖
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-6 text-xs text-slate-500 font-mono">No inventory item registry nodes uncoiled. Add custom limits using the trigger button.</div>
          )}
        </div>
      </div>

      {/* FIXED FOOTER CONTROLLER ACTIONS BAR */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-slate-900 bg-slate-950/85 backdrop-blur-md p-4 z-50">
        <div className="mx-auto max-w-4xl flex items-center justify-end gap-3.5">
          <button 
            onClick={loadGlobalConfigurationTree} 
            className="rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-2.5 text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-900 transition cursor-pointer"
          >
            ↩️ Discard Live Modifications
          </button>
          <button 
            onClick={handleSaveWorkspaceChanges} 
            className="rounded-xl bg-indigo-600 px-6 py-2.5 text-xs font-black uppercase tracking-wider text-white transition hover:bg-indigo-500 shadow-xl cursor-pointer"
          >
            💾 Save Global Parameters to Firebase
          </button>
        </div>
      </div>

    </div>
  );
}
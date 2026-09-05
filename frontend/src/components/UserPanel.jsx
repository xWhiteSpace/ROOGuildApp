// frontend/src/components/UserPanel.jsx
import { useState, useEffect } from 'react';
import { ref as dbRef, onValue as fbOnValue } from 'firebase/database';
import { database } from '../services/firebaseClient';
import { DEFAULT_TZ } from '../utils/guildTime';
import DiscordSignInButton from './DiscordSignInButton';

// --- 🎨 PURE VECTOR MICRO-ICONS CONSOLE ---
const IconUser = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const IconShield = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
const IconLogout = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>;
const IconClock = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;

// Derive the short timezone label (e.g. "GMT+8") from the guild timezone
const TZ_LABEL = (() => {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: DEFAULT_TZ, timeZoneName: 'short' })
      .formatToParts(new Date())
      .find(p => p.type === 'timeZoneName')?.value ?? DEFAULT_TZ;
  } catch {
    return DEFAULT_TZ;
  }
})();

export default function UserPanel({ user, onLogout }) {
  const [serverTimeOffset, setServerTimeOffset] = useState(0);
  const [clockDisplay, setClockDisplay] = useState('');

  // Subscribe once to Firebase's server time offset
  useEffect(() => {
    const unsub = fbOnValue(dbRef(database, '.info/serverTimeOffset'), (snap) => {
      setServerTimeOffset(snap.val() || 0);
    });
    return () => unsub();
  }, []);

  // Tick every second using the server-synced offset, displayed in the guild timezone
  useEffect(() => {
    const tick = () => {
      const now = new Date(Date.now() + serverTimeOffset);
      setClockDisplay(
        now.toLocaleTimeString('en-US', {
          timeZone: DEFAULT_TZ,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [serverTimeOffset]);

  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-slate-100 shadow-md">
      {user ? (
        <>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">Signed in as</div>
            <div className="text-sm font-semibold text-slate-200 truncate mt-1 flex items-center gap-1.5">
              <span className="text-indigo-400"><IconUser /></span> {user.displayName || user.username}
            </div>
            
            {/* 🛡️ DYNAMIC LIVE CORE ROLES MONITOR CAPSULES */}
            {user.roles && user.roles.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2 select-none">
                {user.roles.map((role, idx) => (
                  <span 
                    key={idx} 
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-mono font-bold uppercase tracking-wider bg-amber-500/10 border border-amber-500/20 text-amber-400 shadow-sm"
                  >
                    <IconShield /> {role}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Server-synced guild clock — displayed in guild timezone */}
          <div className="flex flex-col items-center gap-0.5 px-4 border-x border-slate-800 select-none" title={`Server time · ${DEFAULT_TZ}`}>
            <div className="flex items-center gap-1.5 text-slate-400">
              <IconClock />
              <span className="text-[9px] font-mono font-bold uppercase tracking-widest">Server Time</span>
            </div>
            <span className="text-base font-mono font-bold text-slate-200 tabular-nums leading-tight">
              {clockDisplay || '--:--:--'}
            </span>
            <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">{TZ_LABEL}</span>
          </div>
          
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900/80 border border-slate-800 hover:border-slate-700 text-[10px] uppercase font-bold tracking-wider rounded-xl text-slate-400 hover:text-white transition cursor-pointer shadow-sm shrink-0"
          >
            Logout <IconLogout />
          </button>
        </>
      ) : (
        <div className="flex flex-col gap-3 w-full">
          <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">Authentication Required</div>
          <DiscordSignInButton
            compact
            className="flex items-center justify-center gap-2 w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold uppercase tracking-wider rounded-xl transition shadow-lg"
          />
        </div>
      )}
    </div>
  );
}
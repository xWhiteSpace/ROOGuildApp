import { useState, useEffect } from 'react';
import ChatConsole from '../components/ChatConsole';
import { ref, onValue } from 'firebase/database';
import { database } from '../services/firebaseClient';
import { sendChatMessage } from '../services/chatService';

export default function LiveBiddingTab({ user }) {
  const [draft, setDraft] = useState('');
  const [discordMembers, setDiscordMembers] = useState([]);
  const [syncStatus, setSyncStatus] = useState({ state: 'loading', message: 'Connecting to server roster...' });

  const [queueData, setQueueData] = useState({ now: null, next: null, standby: [] });
  const [tally, setTally] = useState({
    puppet: { current: 0, max: 0 },
    illu: { current: 0, max: 0 },
    lnd: { current: 0, max: 0 },
    tns: { current: 0, max: 0 }
  });

  // Pull calculations automatically directly from low-latency live Firebase streams
  useEffect(() => {
    const queueRef = ref(database, 'auction/queue');
    const tallyRef = ref(database, 'auction/tally');

    const unsubscribeQueue = onValue(queueRef, (snapshot) => {
      if (snapshot.exists()) setQueueData(snapshot.val());
    });

    const unsubscribeTally = onValue(tallyRef, (snapshot) => {
      if (snapshot.exists()) setTally(snapshot.val());
    });

    return () => {
      unsubscribeQueue();
      unsubscribeTally();
    };
  }, []);

  // Fetch server Discord profiles (Immunized for Ngrok Mobile Tunnels)
  useEffect(() => {
    const fetchRoster = async () => {
      const envUrl = import.meta.env.VITE_BACKEND_API_URL;
      const baseUrls = envUrl ? [envUrl] : ['http://localhost:5001', 'http://localhost:5000'];
      const candidatePaths = ['/api/auth/discord-members', '/auth/discord-members', '/api/discord-members', '/discord-members'];

      let syncCompleted = false;
      let discoveredServerError = false;

      for (const baseUrl of baseUrls) {
        if (syncCompleted || discoveredServerError) break;
        const cleanBase = baseUrl.replace(/\/$/, '');

        for (const path of candidatePaths) {
          try {
            const targetUrl = `${cleanBase}${path}`;
            const res = await fetch(targetUrl, { 
              method: 'GET', 
              credentials: 'include',
              // 🌟 INTERCEPT FIX: Skips the ngrok alert page for clean background JSON execution
              headers: {
                'ngrok-skip-browser-warning': 'true',
                'Accept': 'application/json'
              }
            });
            
            if (res.status === 404) continue;

            const data = await res.json();
            if (res.ok && data?.success && Array.isArray(data?.members)) {
              setDiscordMembers(data.members);
              setSyncStatus({ state: 'success', message: 'Connected successfully!' });
              syncCompleted = true;
              break; 
            } else {
              setSyncStatus({ state: 'error', message: `Backend Error (${res.status})` });
              discoveredServerError = true;
              break;
            }
          } catch (err) {}
        }
      }
      if (!syncCompleted && !discoveredServerError) {
        setSyncStatus({ state: 'error', message: 'Bot Sync Error: Route path not found.' });
      }
    };
    fetchRoster();
  }, []);

  const resolveFullDiscordNickname = (spreadsheetName) => {
    if (!spreadsheetName || discordMembers.length === 0) return spreadsheetName;
    const lowerName = spreadsheetName.toLowerCase();
    const matchedUser = discordMembers.find((m) => {
      const cleanNick = m.nickname ? m.nickname.split('|')[0].trim().toLowerCase() : '';
      const cleanDisplay = m.displayName ? m.displayName.split('|')[0].trim().toLowerCase() : '';
      const username = m.username ? m.username.toLowerCase() : '';
      return cleanNick === lowerName || cleanDisplay === lowerName || username === lowerName;
    });
    return matchedUser ? (matchedUser.nickname || matchedUser.displayName || matchedUser.username) : spreadsheetName;
  };

  const handleTagNow = () => {
    if (!queueData?.now) return;
    setDraft(`@${resolveFullDiscordNickname(queueData.now.name)} Your turn now! `);
  };

  const handleTagNext = () => {
    if (!queueData?.next) return;
    setDraft(`@${resolveFullDiscordNickname(queueData.next.name)} You are next in line! `);
  };

  const handleTagStandby = () => {
    if (!queueData?.standby || queueData.standby.length === 0) return;
    const tags = queueData.standby.slice(0, 3).map((p) => `@${resolveFullDiscordNickname(p.name)}`).join(' ');
    setDraft(`${tags} Standby, you are up soon! `);
  };

  const handleReadyToBid = async () => {
    if (!user) return alert('You must be logged in to state readiness.');
    try { await sendChatMessage('I am ready to bid!'); } catch (error) { console.error(error); }
  };

  const handleDoneBidding = async () => {
    if (!user) return alert('You must be logged in to signal completion.');
    try { await sendChatMessage('DONE'); } catch (error) { console.error(error); }
  };

  return (
    <div className="flex flex-col h-auto lg:h-[calc(100vh-10rem)] space-y-4 lg:space-y-1.5 text-white bg-slate-950 p-2 lg:p-1 overflow-y-auto lg:overflow-hidden select-none justify-between">
      
      {/* 🚀 Infinite LED Sign Marquee Keyframe Engine */}
      <style>{`
        @keyframes ledSignMarqueeLoop {
          0% { transform: translate3d(100%, 0, 0); }
          100% { transform: translate3d(-100%, 0, 0); }
        }
        .animate-led-marquee-sign {
          display: inline-block;
          white-space: nowrap;
          animation: ledSignMarqueeLoop 10s linear infinite;
        }
      `}</style>

      {/* --- TOP METRICS HEADER CONTAINER --- */}
      {(() => {
        const getPillStyles = (curr = 0, max = 0) => {
          if (!max || max === 0) {
            return 'bg-slate-950/40 border-slate-800/80 text-slate-400';
          }
          if (curr > max) {
            return 'bg-rose-950/30 border-rose-500/50 text-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.08)] animate-pulse';
          }
          if (curr === max) {
            return 'bg-emerald-950/30 border-emerald-500/50 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.08)]';
          }
          if (curr < max) {
            return 'bg-amber-950/25 border-amber-500/40 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.04)]';
          }
          return 'bg-slate-950/40 border-slate-800/80 text-slate-300';
        };

        return (
          <header className="flex flex-col md:flex-row items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-3 sm:px-3 sm:py-2 shadow-lg shrink-0 w-full">
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-start">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-1.5 py-1 border-r border-slate-800 mr-1 hidden md:block">
                Loot Tally
              </div>

              {/* PUPPET CAPSULE */}
              <div className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border text-[11px] font-bold tracking-wide transition-all duration-300 ${getPillStyles(tally?.puppet?.current, tally?.puppet?.max)}`}>
                <span className="opacity-60 uppercase text-[9px] tracking-wider">Puppet</span>
                <span className="font-mono text-xs bg-slate-950/60 px-1.5 py-0.5 rounded border border-slate-800/30">
                  {tally?.puppet?.current || 0}/{tally?.puppet?.max || 0}
                </span>
              </div>

              {/* ILLU CAPSULE */}
              <div className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border text-[11px] font-bold tracking-wide transition-all duration-300 ${getPillStyles(tally?.illu?.current, tally?.illu?.max)}`}>
                <span className="opacity-60 uppercase text-[9px] tracking-wider">Illu</span>
                <span className="font-mono text-xs bg-slate-950/60 px-1.5 py-0.5 rounded border border-slate-800/30">
                  {tally?.illu?.current || 0}/{tally?.illu?.max || 0}
                </span>
              </div>

              {/* LIGHT & DARK CAPSULE */}
              <div className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border text-[11px] font-bold tracking-wide transition-all duration-300 ${getPillStyles(tally?.lnd?.current, tally?.lnd?.max)}`}>
                <span className="opacity-60 uppercase text-[9px] tracking-wider">LnD</span>
                <span className="font-mono text-xs bg-slate-950/60 px-1.5 py-0.5 rounded border border-slate-800/30">
                  {tally?.lnd?.current || 0}/{tally?.lnd?.max || 0}
                </span>
              </div>

              {/* TIME & SPACE CAPSULE */}
              <div className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border text-[11px] font-bold tracking-wide transition-all duration-300 ${getPillStyles(tally?.tns?.current, tally?.tns?.max)}`}>
                <span className="opacity-60 uppercase text-[9px] tracking-wider">TnS</span>
                <span className="font-mono text-xs bg-slate-950/60 px-1.5 py-0.5 rounded border border-slate-800/30">
                  {tally?.tns?.current || 0}/{tally?.tns?.max || 0}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end w-full md:w-auto shrink-0 border-t border-slate-800/60 md:border-t-0 pt-2 md:pt-0">
              <div className={`px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wider uppercase border flex items-center gap-1.5 ${
                syncStatus.state === 'success' ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' :
                syncStatus.state === 'warning' ? 'bg-amber-500/5 border-amber-500/20 text-amber-400' :
                'bg-rose-500/5 border-rose-500/20 text-rose-400'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  syncStatus.state === 'success' ? 'bg-emerald-400' :
                  syncStatus.state === 'warning' ? 'bg-amber-400' : 'bg-rose-400'
                }`} />
                Bot Link: {syncStatus.state === 'success' ? 'Online' : 'Sync Error'}
              </div>
            </div>
          </header>
        );
      })()}

      {/* --- ROW 1: QUEUE WORKSPACE GRID --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 h-auto lg:h-[150px] shrink-0 min-h-0 w-full">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between rounded-xl border border-amber-500/30 bg-gradient-to-br from-slate-900 to-amber-950/10 p-4 shadow-md relative h-full gap-4 overflow-hidden w-full">
          <div className="absolute top-2 left-4 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full text-[9px] font-bold text-amber-400 tracking-widest uppercase z-20">
            Now Bidding
          </div>
          <div className="flex-1 min-w-0 mt-3 lg:mt-1 w-full overflow-hidden relative bg-slate-950/40 rounded-lg px-2 h-14 flex items-center border border-slate-800/40">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white capitalize drop-shadow-md animate-led-marquee-sign">
              {queueData?.now ? queueData.now.name : 'No Active Bidder'}
            </h1>
          </div>

          {queueData?.now && (
            <div className="bg-slate-950/70 border border-slate-800/80 p-2 rounded-lg w-full lg:w-[240px] max-h-[120px] lg:max-h-[110px] overflow-y-auto shadow-inner flex flex-col shrink-0 z-10">
              <span className="text-[9px] uppercase tracking-wider text-slate-500 block mb-1 font-semibold">
                Active Requests
              </span>
              <ul className="space-y-1 text-[11px] font-mono text-cyan-400">
                {queueData.now.items && queueData.now.items.length > 0 ? (
                  queueData.now.items.map((item, idx) => (
                    <li key={idx} className="bg-cyan-950/20 px-2 py-1 rounded border border-cyan-900/20 truncate flex items-center justify-between gap-1">
                      <span className="truncate">{item}</span>
                      <span className="text-[8px] font-sans font-bold uppercase bg-cyan-900/40 text-cyan-300 px-1 rounded shrink-0">Live</span>
                    </li>
                  ))
                ) : (
                  <li className="text-slate-600 text-[10px] italic py-1">No active items.</li>
                )}
              </ul>
            </div>
          )}
        </div>

        <div className="grid grid-rows-2 gap-2 h-auto lg:h-full w-full">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 flex flex-col justify-center relative overflow-hidden min-h-[60px] lg:min-h-0">
            <div className="absolute top-1.5 left-3 text-[9px] font-bold uppercase tracking-widest text-cyan-400">
              Next In Line
            </div>
            <div className="text-lg font-bold tracking-tight text-slate-100 mt-2 truncate">
              {queueData?.next ? queueData.next.name : 'Queue Empty'}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 flex flex-col justify-center relative overflow-hidden min-h-[60px] lg:min-h-0">
            <div className="absolute top-1.5 left-3 text-[9px] font-bold uppercase tracking-widest text-slate-400">
              Standby Pool
            </div>
            <ul className="flex flex-wrap items-center gap-x-3 text-xs font-semibold text-slate-300 mt-2 pl-0.5 truncate">
              {queueData?.standby && queueData.standby.length > 0 ? (
                queueData.standby.slice(0, 3).map((player, idx) => (
                  <li key={idx} className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] text-slate-600 font-bold">{idx + 1}.</span>
                    <span className="truncate max-w-[90px]">{player.name}</span>
                  </li>
                ))
              ) : (
                <li className="text-slate-500 text-[10px]">No players on standby</li>
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* --- ROW 2: AUTOMATED ACTION MACRO BUTTON ROW --- */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1.5 shrink-0 w-full">
        <button onClick={handleTagNow} disabled={!queueData?.now || !user} className="rounded-lg border border-amber-600 bg-amber-600/5 py-2 text-[10px] font-bold tracking-wider text-amber-400 uppercase transition hover:bg-amber-600 hover:text-white disabled:opacity-30 truncate px-1">Tag NOW</button>
        <button onClick={handleTagNext} disabled={!queueData?.next || !user} className="rounded-lg border border-cyan-600 bg-cyan-600/5 py-2 text-[10px] font-bold tracking-wider text-cyan-400 uppercase transition hover:bg-cyan-600 hover:text-white disabled:opacity-30 truncate px-1">Tag NEXT</button>
        <button onClick={handleTagStandby} disabled={!queueData?.standby || queueData.standby.length === 0 || !user} className="rounded-lg border border-slate-700 bg-slate-800/30 py-2 text-[10px] font-bold tracking-wider text-slate-300 uppercase transition hover:bg-slate-700 hover:text-white disabled:opacity-30 truncate px-1 col-span-2 sm:col-span-1">Tag STANDBY</button>
        <button onClick={handleReadyToBid} disabled={!user} className="rounded-lg border border-emerald-600 bg-emerald-600/5 py-2 text-[10px] font-bold tracking-wider text-emerald-400 uppercase transition hover:bg-emerald-600 hover:text-white disabled:opacity-30 truncate px-1">Ready ⚡</button>
        <button onClick={handleDoneBidding} disabled={!user} className="rounded-lg border border-rose-600 bg-rose-600/5 py-2 text-[10px] font-bold tracking-wider text-rose-400 uppercase transition hover:bg-rose-600 hover:text-white disabled:opacity-30 truncate px-1">Done ✅</button>
      </div>

      {/* --- ROW 3: DISCORD LIVE FEED CONSOLE --- */}
      <div className="flex-1 min-h-[340px] lg:min-h-0 w-full">
        <ChatConsole user={user} draft={draft} setDraft={setDraft} discordMembers={discordMembers} />
      </div>

    </div>
  );
}
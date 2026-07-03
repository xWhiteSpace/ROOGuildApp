// frontend/src/components/LeftNavBar.jsx
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useEffect } from 'react';

// --- 🎨 PURE VECTOR MICRO-ICONS CONSOLE ---
const IconRequest = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>;
const IconLive = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>;
const IconBook = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2zM22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>;
const IconHistory = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>;
const IconPast = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/></svg>;
const IconEvidence = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>;
const IconHelp = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01"/></svg>;
const IconSettings = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>;
const IconScheduler = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const IconChevron = ({ collapsed }) => <svg className={`w-3.5 h-3.5 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/></svg>;
const IconX = () => <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>;

const auctionItems = [
  { label: 'Request', path: '/', icon: IconRequest },
  { label: 'Mimic Book', path: '/mimic-book', icon: IconBook },
  { label: 'Request History', path: '/request-history', icon: IconHistory },
  { label: 'Past Auction', path: '/past-auction', icon: IconPast },
  { label: 'Submit Evidence', path: '/submit-evidence', icon: IconEvidence }
];

const raidItems = [
  { label: 'MasterList', path: '/attendance/masterlist', icon: IconRequest },
  { label: 'Raid Party', path: '/attendance/raidparty', icon: IconBook },
  { label: 'Statistics', path: '/attendance/statistics', icon: IconHistory },
  { label: 'Scheduler', path: '/attendance/scheduler', icon: IconScheduler }
];

export default function LeftNavBar({ macroTab }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [helpUrl, setHelpUrl] = useState('');

  useEffect(() => {
    const fetchHelpUrl = async () => {
      try {
        const backendUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';
        const res = await fetch(`${backendUrl}/api/requests/settings/get`, {
          headers: {
            ...(backendUrl.includes('ngrok') ? { 'ngrok-skip-browser-warning': 'true' } : {})
          }
        });
        const data = await res.json();
        if (data.success && data.config?.helpEmbedUrl) {
          setHelpUrl(data.config.helpEmbedUrl);
        }
      } catch (err) {
        console.error("Error fetching help URL:", err);
      }
    };
    fetchHelpUrl();
  }, []);

const activeNavItems = macroTab === 'raid' ? raidItems : auctionItems;

  return (
    <aside className={`min-h-screen border-r border-slate-900 bg-slate-950 p-4 transition-all duration-300 relative shrink-0 shadow-2xl select-none ${
      isCollapsed ? 'w-20' : 'w-64'
    }`}>
      
      {/* 🛠️ Dynamic Navigation Dock Toggle Switch Control */}
      <button 
        type="button"
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute top-7 -right-3 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white rounded-lg w-6 h-6 flex items-center justify-center z-50 shadow-md transition cursor-pointer"
        title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
      >
        <IconChevron collapsed={isCollapsed} />
      </button>

      {/* Main Header Brand Context Layer */}
      <div className={`mb-6 px-2 py-3 transition-all duration-200 overflow-hidden font-sans ${
        isCollapsed ? 'h-0 opacity-0 mb-0 py-0' : 'opacity-100'
      }`}>
        <div className="text-sm font-bold uppercase tracking-wider text-slate-200">
          {macroTab === 'raid' ? 'Raid Governance' : 'Auction Dashboard'}
        </div>
        <div className="text-[10px] text-slate-500 font-mono tracking-widest uppercase mt-0.5">
          {macroTab === 'raid' ? 'Roster Management, Parties, Stats' : 'Request Item, View Bid, Review History.'}
        </div>
      </div>

      {/* UNIFIED CORE LIST ELEMENT ANCHORS DECK */}
      <nav className="space-y-1">
        {activeNavItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `flex items-center rounded-xl px-3 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all duration-150 ${
                isActive
                  ? 'bg-indigo-600 text-white shadow font-bold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
              } ${isCollapsed ? 'justify-center' : ''}`
            }
            title={item.label}
          >
            {isCollapsed ? (
              <span className="flex items-center justify-center" title={item.label}>
                <item.icon />
              </span>
            ) : (
              <>
                <span className="shrink-0"><item.icon /></span>
                <span className="ml-3 whitespace-nowrap truncate">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}

        {/* ⚙️ INTEGRATED VISUAL SEPARATOR & SYSTEM SETTINGS ANCHOR ROW */}
        <div className="my-3 border-t border-slate-900 w-full" />

        <button
          type="button"
          onClick={() => setIsHelpOpen(true)}
          className={`w-full flex items-center rounded-xl px-3 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all duration-150 text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 ${isCollapsed ? 'justify-center' : ''}`}
          title="System User Guide & Help Portal"
        >
          {isCollapsed ? (
            <span className="flex items-center justify-center" title="Help Guide">
              <IconHelp />
            </span>
          ) : (
            <>
              <span className="shrink-0"><IconHelp /></span>
              <span className="ml-3 whitespace-nowrap truncate">Help Guide</span>
            </>
          )}
        </button>

        <NavLink
          to="/settings-configuration"
          className={({ isActive }) =>
            `flex items-center rounded-xl px-3 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all duration-150 ${
              isActive
                ? 'bg-indigo-600 text-white shadow font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
            } ${isCollapsed ? 'justify-center' : ''}`
          }
          title="System Settings Configuration Desk"
        >
          {isCollapsed ? (
            <span className="flex items-center justify-center" title="System Settings">
              <IconSettings />
            </span>
          ) : (
            <>
              <span className="shrink-0"><IconSettings /></span>
              <span className="ml-3 whitespace-nowrap truncate">System Settings</span>
            </>
          )}
        </NavLink>
      </nav>

      {/* STATE-DRIVEN SYSTEM HELP POPUP OVERLAY */}
      {isHelpOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[100] p-4 font-sans animate-fadeIn">
          <div className="fixed inset-0 z-0" onClick={() => setIsHelpOpen(false)} />
          <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-3xl shadow-2xl p-6 flex flex-col h-[80vh] justify-between text-white relative z-10 space-y-4">
            
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-semibold tracking-wider uppercase text-slate-200 flex items-center gap-2">
                  <IconHelp /> System Help Guide
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => setIsHelpOpen(false)} 
                className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <IconX />
              </button>
            </div>
            
            <div className="flex-1 my-2 flex items-center justify-center overflow-hidden bg-slate-950 rounded-2xl border border-slate-900 p-2 min-h-0">
              {helpUrl ? (
                <>
                  {/* Desktop & Tablet responsive view container */}
                  <iframe 
                    src={helpUrl} 
                    className="hidden md:block w-full h-full rounded-xl aspect-video" 
                    allowFullScreen
                  ></iframe>
                  {/* Mobile responsive instruction card fallback view */}
                  <div className="block md:hidden text-center p-6 space-y-4 font-sans">
                    <div className="text-2xl text-indigo-400 flex justify-center"><IconHelp /></div>
                    <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">To read your guild guide presentation comfortably on small mobile viewports, please open the documentation directly inside a new tab space.</p>
                    <a 
                      href={helpUrl} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-white shadow-lg hover:bg-indigo-500 transition cursor-pointer"
                    >
                      Open Slide Presentation ↗
                    </a>
                  </div>
                </>
              ) : (
                <div className="text-xs text-slate-500 font-mono italic">No interactive guide presentation configured by guild officers yet.</div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button 
                type="button"
                onClick={() => setIsHelpOpen(false)} 
                className="px-5 py-2 border border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-400 hover:text-white text-[10px] font-bold uppercase tracking-wider rounded-xl transition cursor-pointer shadow-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
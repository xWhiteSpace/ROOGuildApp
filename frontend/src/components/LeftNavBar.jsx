// frontend/src/components/LeftNavBar.jsx
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useEffect } from 'react';

const navItems = [
  { label: 'Request', path: '/', icon: '📥' },
  { label: 'Live Bidding', path: '/live-bidding', icon: '⚡' },
  { label: 'Mimic Book', path: '/mimic-book', icon: '📖' },
  { label: 'Request History', path: '/request-history', icon: '📜' },
  { label: 'Past Auction', path: '/past-auction', icon: '📦' },
  { label: 'Submit Evidence', path: '/submit-evidence', icon: '📷' }
];

export default function LeftNavBar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [helpUrl, setHelpUrl] = useState('');

  useEffect(() => {
    const fetchHelpUrl = async () => {
      try {
        const backendUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';
        const res = await fetch(`${backendUrl}/api/requests/settings/get`);
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

  return (
    <aside className={`min-h-screen border-r border-slate-800 bg-slate-950/90 p-4 transition-all duration-300 relative shrink-0 ${
      isCollapsed ? 'w-20' : 'w-72'
    }`}>
      
      {/* 🛠️ Dynamic Navigation Dock Toggle Switch Control */}
      <button 
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute top-6 -right-3 bg-slate-800 border border-slate-700 text-slate-400 hover:text-white rounded-full w-6 h-6 flex items-center justify-center text-[10px] font-bold z-50 shadow-lg select-none tracking-tighter cursor-pointer"
        title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
      >
        {isCollapsed ? '>>' : '<<'}
      </button>

      {/* Main Header Brand Context Layer */}
      <div className={`mb-8 px-3 py-4 text-slate-100 transition-all duration-200 overflow-hidden ${
        isCollapsed ? 'h-0 opacity-0 mb-0 py-0' : 'opacity-100'
      }`}>
        <div className="text-2xl font-semibold whitespace-nowrap">Auction Dashboard</div>
        {/* 🛡️ Responsive Wrap Pass: Removing whitespace-nowrap allows long descriptive items to stack into two lines */}
        <div className="text-xs text-slate-400 mt-1 leading-relaxed">Request, view your bids, and check history</div>
      </div>

      {/* UNIFIED CORE LIST ELEMENT ANCHORS DECK */}
      <nav className="space-y-2">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `flex items-center rounded-2xl px-4 py-3 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-900 hover:text-white'
              } ${isCollapsed ? 'justify-center' : ''}`
            }
            title={item.label}
          >
            {isCollapsed ? (
              <span className="text-base font-sans select-none" title={item.label}>
                {item.icon}
              </span>
            ) : (
              <>
                <span className="text-base font-sans select-none">{item.icon}</span>
                <span className="ml-3 whitespace-nowrap">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}

        {/* ⚙️ INTEGRATED VISUAL SEPARATOR & SYSTEM SETTINGS ANCHOR ROW */}
        <div className="my-4 border-t border-slate-900/80 w-full" />

        <button
          onClick={() => setIsHelpOpen(true)}
          className={`w-full flex items-center rounded-2xl px-4 py-3 text-sm font-medium transition-all duration-200 text-slate-300 hover:bg-slate-900 hover:text-white ${isCollapsed ? 'justify-center' : ''}`}
          title="System User Guide & Help Portal"
        >
          {isCollapsed ? (
            <span className="text-base font-sans select-none">❓</span>
          ) : (
            <>
              <span className="text-base font-sans select-none">❓</span>
              <span className="ml-3 whitespace-nowrap">Help Guide</span>
            </>
          )}
        </button>

        <NavLink
          to="/settings-configuration"
          className={({ isActive }) =>
            `flex items-center rounded-2xl px-4 py-3 text-sm font-medium transition-all duration-200 ${
              isActive
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-300 hover:bg-slate-900 hover:text-white'
            } ${isCollapsed ? 'justify-center' : ''}`
          }
          title="System Settings Configuration Desk"
        >
          {isCollapsed ? (
            <span className="text-base font-sans select-none">⚙️</span>
          ) : (
            <>
              <span className="text-base font-sans select-none">⚙️</span>
              <span className="ml-3 whitespace-nowrap">System Settings</span>
            </>
          )}
        </NavLink>
      </nav>

    </aside>

    {/* STATE-DRIVEN SYSTEM HELP POPUP OVERLAY */}
    {isHelpOpen && (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 font-sans animate-fadeIn">
        <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-2xl shadow-2xl p-6 flex flex-col h-[85vh] justify-between text-white">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-200 flex items-center gap-2">❓ System Help Guide</h3>
            <button onClick={() => setIsHelpOpen(false)} className="text-slate-500 hover:text-slate-300 font-mono text-sm p-1 cursor-pointer">✕</button>
          </div>
          
          <div className="flex-1 my-4 flex items-center justify-center overflow-hidden bg-slate-950 rounded-xl border border-slate-850 p-2 min-h-0">
            {helpUrl ? (
              <>
                {/* Desktop & Tablet responsive view container */}
                <iframe 
                  src={helpUrl} 
                  className="hidden md:block w-full h-full rounded-lg aspect-video" 
                  allowFullScreen
                ></iframe>
                {/* Mobile responsive instruction card fallback view */}
                <div className="block md:hidden text-center p-6 space-y-4 font-sans">
                  <div className="text-2xl">📱</div>
                  <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">To read your guild guide presentation comfortably on small mobile viewports, please open the documentation directly inside a new tab space.</p>
                  <a 
                    href={helpUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-lg hover:bg-indigo-500 transition cursor-pointer"
                  >
                    Open Slide Presentation ↗
                  </a>
                </div>
              </>
            ) : (
              <div className="text-xs text-slate-500 font-mono italic">No interactive guide presentation configured by guild officers yet.</div>
            )}
          </div>

          <div className="flex justify-center pt-2">
            <button onClick={() => setIsHelpOpen(false)} className="rounded-xl border border-slate-700 bg-slate-800 px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-300 hover:text-white transition shadow-lg cursor-pointer">
              Close
                </button>
              </div>
            </div>
          </div>
        )}
  );
}
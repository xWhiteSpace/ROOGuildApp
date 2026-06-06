// frontend/src/components/LeftNavBar.jsx
import { useState } from 'react';
import { NavLink } from 'react-router-dom';

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
        <div className="text-sm text-slate-400 mt-1 whitespace-nowrap">Request, View your bids, Check history</div>
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
  );
}
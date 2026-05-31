// frontend/src/components/UserPanel.jsx
import React from 'react';

export default function UserPanel({ user, onLogout }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-3xl bg-slate-900/90 px-4 py-3 text-slate-100 shadow-sm">
      {user ? (
        <>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-slate-400">Signed in as</div>
            <div className="text-base font-semibold text-white truncate">
              {user.displayName || user.username}
            </div>
            
            {/* 🛡️ DYNAMIC LIVE CORE ROLES MATRIX PANEL DISPLAY */}
            {user.roles && user.roles.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5 select-none">
                {user.roles.map((role, idx) => (
                  <span 
                    key={idx} 
                    className="px-2 py-0.5 rounded-md text-[9px] font-sans font-black uppercase tracking-wider bg-amber-500/10 border border-amber-500/20 text-amber-400 shadow-sm"
                  >
                    🛡️ {role}
                  </span>
                ))}
              </div>
            )}
          </div>
          
          <button
            type="button"
            onClick={onLogout}
            className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 shrink-0 transition-colors shadow"
          >
            Logout
          </button>
        </>
      ) : (
        <div className="flex flex-col gap-2 w-full">
          <div className="text-sm text-slate-400">Not signed in</div>
          <a
            href={`${import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001'}/auth/login`}
            className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 text-center transition-colors shadow"
          >
            Sign in with Discord
          </a>
        </div>
      )}
    </div>
  );
}
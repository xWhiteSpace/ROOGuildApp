import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEFAULT_TZ } from '../utils/guildTime';
import { apiFetch } from '../services/apiClient';
import DiscordSignInButton from './DiscordSignInButton';

const IconChevron = ({ open }) => (
  <svg className={`w-3 h-3 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9l6 6 6-6" />
  </svg>
);
const IconLogout = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
  </svg>
);
const IconClock = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

function tzShortLabel(timezone) {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: timezone || DEFAULT_TZ, timeZoneName: 'short' })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName')?.value ?? (timezone || DEFAULT_TZ);
  } catch {
    return timezone || DEFAULT_TZ;
  }
}

export default function ValhallaToolbar({ user, onLogout, onSessionUser, forceCloseMenu = false }) {
  const navigate = useNavigate();
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [clockDisplay, setClockDisplay] = useState('');
  const [tenants, setTenants] = useState([]);
  const [guildTz, setGuildTz] = useState(user?.tenantTimezone || DEFAULT_TZ);

  useEffect(() => {
    const tick = () => {
      setClockDisplay(
        new Date().toLocaleTimeString('en-US', {
          timeZone: guildTz || DEFAULT_TZ,
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
  }, [guildTz]);

  useEffect(() => {
    if (!user) return undefined;
    if (user?.tenantTimezone) setGuildTz(user.tenantTimezone);
    apiFetch('/api/tenants/mine', { method: 'GET' })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setTenants(data.tenants || []);
        }
      })
      .catch(() => {});
    return undefined;
  }, [user]);

  useEffect(() => {
    if (forceCloseMenu) setOpen(false);
  }, [forceCloseMenu]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const switchTenant = async (tenantId) => {
    if (!tenantId || tenantId === user?.currentTenantId) return;
    setOpen(false);
    const res = await apiFetch('/api/tenants/select', {
      method: 'POST',
      body: JSON.stringify({ tenantId }),
    });
    const data = await res.json();
    if (data.success && data.user) {
      onSessionUser?.(data.user);
      localStorage.setItem('guild_raid_session', JSON.stringify(data.user));
      window.location.assign('/');
    }
  };

  const go = (path) => {
    setOpen(false);
    navigate(path);
  };

  if (!user) {
    return (
      <DiscordSignInButton
        compact
        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-white"
      />
    );
  }

  const displayName = user.displayName || user.username;
  const otherTenants = tenants.filter((t) => t.id !== user.currentTenantId);
  const menuItemClass = 'w-full text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-300 hover:bg-slate-800 hover:text-white';

  return (
    <div className="flex items-center justify-end gap-x-3 text-slate-200">
      <div className="hidden md:flex items-center gap-1.5 select-none shrink-0" title={`Guild time · ${guildTz}`}>
        <IconClock />
        <span className="text-[11px] font-mono font-bold tabular-nums text-slate-200">{clockDisplay || '--:--:--'}</span>
        <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500">{tzShortLabel(guildTz)}</span>
      </div>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-haspopup="menu"
          className="flex items-center gap-1.5 min-w-0 max-w-[12rem] max-md:max-w-[7.5rem] px-2 py-1 rounded-lg hover:bg-slate-800 text-slate-200"
        >
          <span className="text-[11px] font-semibold truncate">[{displayName}]</span>
          <IconChevron open={open} />
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 top-full mt-1.5 w-56 rounded-xl border border-slate-800 bg-slate-900 shadow-xl py-1 z-[90]"
          >
            <div className="px-3 py-2 border-b border-slate-800">
              <div className="text-[11px] font-semibold text-white truncate">{displayName}</div>
              {user.tenantName && (
                <div className="text-[10px] font-mono text-slate-500 truncate mt-0.5">{user.tenantName}</div>
              )}
              <div className="flex md:hidden items-center gap-1.5 mt-1.5 text-slate-400" title={`Guild time · ${guildTz}`}>
                <IconClock />
                <span className="text-[10px] font-mono font-bold tabular-nums text-slate-300">{clockDisplay || '--:--:--'}</span>
                <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500">{tzShortLabel(guildTz)}</span>
              </div>
            </div>

            {user.isOfficer && (
              <button type="button" role="menuitem" className={menuItemClass} onClick={() => go('/workspace')}>
                Workspace
              </button>
            )}

            {otherTenants.map((t) => (
              <button
                key={t.id}
                type="button"
                role="menuitem"
                className={menuItemClass}
                onClick={() => switchTenant(t.id)}
              >
                Switch to {t.displayName || t.id}
              </button>
            ))}

            <button
              type="button"
              role="menuitem"
              className={menuItemClass}
              onClick={() => {
                try {
                  sessionStorage.setItem('ro_guild_intent', 'signup');
                } catch {
                  /* ignore */
                }
                go('/select-guild?intent=signup');
              }}
            >
              Add Discord server
            </button>

            <div className="my-1 border-t border-slate-800" />

            <button
              type="button"
              role="menuitem"
              className={`${menuItemClass} flex items-center justify-between text-slate-400`}
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
            >
              Log out
              <IconLogout />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

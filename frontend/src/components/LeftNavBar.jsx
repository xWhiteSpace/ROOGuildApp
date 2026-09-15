// frontend/src/components/LeftNavBar.jsx
import { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { apiFetch } from '../services/apiClient';
import { getGame, resolvePostLoginPath } from '../games/catalog';
import { PRODUCT_MARK_SRC, PRODUCT_ON_DARK_CLASS } from '../brand';

const IconRequest = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>;
const IconLive = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>;
const IconBook = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2zM22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>;
const IconHistory = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>;
const IconPast = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/></svg>;
const IconHelp = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01"/></svg>;
const IconSettings = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06-.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>;
const IconScheduler = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const IconUser = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>;
const IconPeak = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 16l4-8 4 4 5-9"/></svg>;
const IconGallery = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>;
const IconCalendar = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const IconChevron = ({ collapsed }) => <svg className={`w-3.5 h-3.5 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/></svg>;
const IconSectionChevron = ({ open }) => <svg className={`w-3 h-3 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>;
const IconX = () => <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>;
const IconBack = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>;
const IconController = () => (
  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 12h4M8 10v4" />
    <circle cx="16" cy="11" r="0.7" fill="currentColor" stroke="none" />
    <circle cx="18" cy="13" r="0.7" fill="currentColor" stroke="none" />
    <rect x="2" y="8" width="20" height="10" rx="5" />
  </svg>
);

const ICONS = {
  request: IconRequest,
  live: IconLive,
  book: IconBook,
  history: IconHistory,
  past: IconPast,
  scheduler: IconScheduler,
  user: IconUser,
  peak: IconPeak,
  gallery: IconGallery,
  calendar: IconCalendar,
};

const HELP_URL_BY_KEY = {
  auction: 'auction',
  raid: 'raid',
};

function navClass(isActive, isCollapsed) {
  return `flex items-center rounded-xl px-3 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all duration-150 ${
    isActive
      ? 'bg-indigo-600 text-white shadow font-bold'
      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
  } ${isCollapsed ? 'justify-center' : ''}`;
}

function useMdUp() {
  const [mdUp, setMdUp] = useState(() => (
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : true
  ));

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const onChange = () => setMdUp(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return mdUp;
}

export default function LeftNavBar({ user, activeGameId, mobileOpen = false, onMobileOpen, onMobileClose }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const mdUp = useMdUp();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [helpView, setHelpView] = useState('list');
  const [auctionHelpUrl, setAuctionHelpUrl] = useState('');
  const [raidHelpUrl, setRaidHelpUrl] = useState('');
  const [openSections, setOpenSections] = useState({});
  const showIconsOnly = mdUp && isCollapsed;
  const asideRef = useRef(null);
  const swipeStartX = useRef(0);
  const swipeStartY = useRef(0);

  const game = getGame(activeGameId);
  const helpUrls = { auction: auctionHelpUrl, raid: raidHelpUrl };
  const helpGuides = (game?.modules || [])
    .filter((mod) => mod.helpKey)
    .map((mod) => ({
      id: mod.id,
      helpKey: mod.helpKey,
      title: `${mod.label} Help Guide`,
      url: helpUrls[HELP_URL_BY_KEY[mod.helpKey] || mod.helpKey] || '',
    }));
  const activeGuide = helpGuides.find((guide) => guide.id === helpView) || null;
  const sectionOpen = (id) => openSections[id] !== false;

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--valhalla-sidebar-width',
      mdUp ? (isCollapsed ? '5rem' : '16rem') : '0px',
    );
    return () => {
      document.documentElement.style.removeProperty('--valhalla-sidebar-width');
    };
  }, [isCollapsed, mdUp]);

  useEffect(() => {
    onMobileClose?.();
  }, [pathname, onMobileClose]);

  useEffect(() => {
    if (mdUp) onMobileClose?.();
  }, [mdUp, onMobileClose]);

  useEffect(() => {
    const el = asideRef.current;
    if (!el || mdUp || !mobileOpen) return undefined;

    const onTouchStart = (event) => {
      const touch = event.touches[0];
      if (!touch) return;
      swipeStartX.current = touch.clientX;
      swipeStartY.current = touch.clientY;
    };

    const onTouchEnd = (event) => {
      const touch = event.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - swipeStartX.current;
      const dy = touch.clientY - swipeStartY.current;
      if (dx < -64 && Math.abs(dx) > Math.abs(dy)) onMobileClose?.();
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [mdUp, mobileOpen, onMobileClose]);

  useEffect(() => {
    if (!game || helpGuides.length === 0) return undefined;
    const fetchHelpUrl = async () => {
      try {
        const res = await apiFetch('/api/requests/settings/help', { method: 'GET' });
        const data = await res.json();
        if (data.success) {
          setAuctionHelpUrl(data.helpEmbedUrl || '');
          setRaidHelpUrl(data.raidHelpEmbedUrl || '');
        }
      } catch (err) {
        console.error('Error fetching help URL:', err);
      }
    };
    fetchHelpUrl();
    return undefined;
  }, [game?.id]);

  const toggleSection = (id) => {
    setOpenSections((prev) => ({ ...prev, [id]: prev[id] === false }));
  };

  const openHelp = () => {
    setHelpView('list');
    setIsHelpOpen(true);
  };

  const closeHelp = () => {
    setIsHelpOpen(false);
    setHelpView('list');
  };

  const goHome = () => {
    onMobileClose?.();
    navigate(getGame(activeGameId)?.homePath || resolvePostLoginPath(user));
  };

  return (
    <>
    <aside
      ref={asideRef}
      aria-hidden={!mdUp && !mobileOpen}
      className={`border-r border-slate-900 bg-slate-950 p-4 max-md:pt-16 shadow-2xl select-none z-[60] flex flex-col min-h-0 max-md:absolute max-md:inset-0 max-md:w-full max-md:transition-transform max-md:duration-300 md:relative md:h-full md:shrink-0 md:transition-all ${
        showIconsOnly ? 'md:w-20' : 'md:w-64'
      } ${mobileOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full max-md:pointer-events-none'}`}
    >
      <button
        type="button"
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="hidden md:flex absolute top-7 -right-3 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white rounded-lg w-6 h-6 items-center justify-center z-50 shadow-md transition cursor-pointer"
        title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
      >
        <IconChevron collapsed={isCollapsed} />
      </button>
      <button
        type="button"
        onClick={onMobileClose}
        className="md:hidden absolute top-7 right-3 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white rounded-lg w-8 h-8 flex items-center justify-center z-50 shadow-md transition cursor-pointer"
        title="Close menu"
        aria-label="Close menu"
      >
        <IconChevron collapsed={false} />
      </button>

      <div className="mb-6 px-2 py-3 font-sans shrink-0">
        <button
          type="button"
          onClick={goHome}
          title="Home"
          className="block w-full cursor-pointer"
        >
          <img
            src={user?.tenantLogoUrl || PRODUCT_MARK_SRC}
            alt={user?.tenantName || 'Guild'}
            onError={(event) => {
              event.currentTarget.onerror = null;
              event.currentTarget.src = PRODUCT_MARK_SRC;
              event.currentTarget.classList.add('brightness-0', 'invert');
            }}
            className={`object-contain rounded-xl hover:ring-2 hover:ring-indigo-500/40 ${showIconsOnly ? 'mx-auto h-12 w-12' : 'h-28 w-28'} ${user?.tenantLogoUrl ? '' : PRODUCT_ON_DARK_CLASS}`}
          />
        </button>
        {showIconsOnly ? (
          game && (
            <div className="mt-3 flex justify-center text-indigo-400" title={game.label}>
              <IconController />
            </div>
          )
        ) : (
          <div className="mt-3">
            <div className="text-sm font-semibold text-white truncate" title={user?.tenantName || ''}>
              {user?.tenantName || 'Guild'}
            </div>
            {game ? (
              <div className="mt-3 flex items-center gap-2 text-slate-200" title={game.label}>
                <span className="text-indigo-400"><IconController /></span>
                <span className="text-sm font-bold uppercase tracking-wider truncate">{game.label}</span>
              </div>
            ) : (
              <div className="mt-3 text-sm font-bold uppercase tracking-wider text-slate-500">Choose a game</div>
            )}
          </div>
        )}
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-0.5 scrollbar-thin">
        {(game?.modules || []).map((mod) => {
          const open = sectionOpen(mod.id);
          return (
            <div key={mod.id} className="space-y-1">
              {showIconsOnly ? (
                <button
                  type="button"
                  onClick={() => toggleSection(mod.id)}
                  className="w-full flex items-center justify-center py-1 text-slate-600 hover:text-slate-300"
                  title={`${open ? 'Collapse' : 'Expand'} ${mod.label}`}
                >
                  <IconSectionChevron open={open} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => toggleSection(mod.id)}
                  className="w-full flex items-center justify-between px-3 pt-3 pb-1 text-[9px] font-mono uppercase tracking-widest text-slate-500 hover:text-slate-300"
                >
                  <span>{mod.label}</span>
                  <IconSectionChevron open={open} />
                </button>
              )}
              {open && mod.items.map((item) => {
                const Icon = ICONS[item.icon] || IconRequest;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.end === true || item.path === '/'}
                    onClick={onMobileClose}
                    className={({ isActive }) => navClass(isActive, showIconsOnly)}
                    title={item.label}
                  >
                    {showIconsOnly ? (
                      <span className="flex items-center justify-center" title={item.label}>
                        <Icon />
                      </span>
                    ) : (
                      <>
                        <span className="shrink-0"><Icon /></span>
                        <span className="ml-3 whitespace-nowrap truncate">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          );
        })}

      </nav>

      {game && (helpGuides.length > 0 || game.settingsPath) ? (
        <div className="shrink-0 pt-2 space-y-1 bg-slate-950">
            <div className="mb-2 border-t border-slate-900 w-full" />

            {helpGuides.length > 0 && (
            <button
              type="button"
              onClick={openHelp}
              className={`w-full flex items-center rounded-xl px-3 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all duration-150 text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 ${showIconsOnly ? 'justify-center' : ''}`}
              title="Help Guide"
            >
              {showIconsOnly ? (
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
            )}

            {game.settingsPath ? (
            <NavLink
              to={game.settingsPath}
              onClick={onMobileClose}
              className={({ isActive }) => navClass(isActive || pathname === '/settings-configuration', showIconsOnly)}
              title="Game Settings"
            >
              {showIconsOnly ? (
                <span className="flex items-center justify-center" title="Game Settings">
                  <IconSettings />
                </span>
              ) : (
                <>
                  <span className="shrink-0"><IconSettings /></span>
                  <span className="ml-3 whitespace-nowrap truncate">Game Settings</span>
                </>
              )}
            </NavLink>
            ) : null}
        </div>
      ) : null}
    </aside>
    {isHelpOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[100] p-4 font-sans animate-fadeIn">
          <div className="fixed inset-0 z-0" onClick={closeHelp} />
          <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-3xl shadow-2xl p-6 flex flex-col h-[80vh] justify-between text-white relative z-10 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3 gap-3">
              <div className="flex items-center gap-2 min-w-0">
                {activeGuide && (
                  <button
                    type="button"
                    onClick={() => setHelpView('list')}
                    className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
                    title="Back to Help Guide"
                  >
                    <IconBack />
                  </button>
                )}
                <h3 className="text-sm font-semibold tracking-wider uppercase text-slate-200 flex items-center gap-2 truncate">
                  <IconHelp /> {activeGuide ? activeGuide.title : 'Help Guide'}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeHelp}
                className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <IconX />
              </button>
            </div>
            <div className="flex-1 my-2 overflow-hidden bg-slate-950 rounded-2xl border border-slate-900 p-2 min-h-0">
              {!activeGuide ? (
                <div className="h-full flex flex-col justify-center gap-3 p-4">
                  {helpGuides.map((guide) => (
                    <button
                      key={guide.id}
                      type="button"
                      onClick={() => setHelpView(guide.id)}
                      className="w-full text-left rounded-2xl border border-slate-800 hover:border-indigo-500/50 bg-slate-900/40 px-4 py-4 transition"
                    >
                      <div className="text-sm font-semibold text-white">{guide.title}</div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        {guide.url ? 'Open this guide' : 'Not configured yet — set the URL in Game Settings'}
                      </div>
                    </button>
                  ))}
                </div>
              ) : activeGuide.url ? (
                <div className="h-full flex items-center justify-center">
                  <iframe src={activeGuide.url} className="hidden md:block w-full h-full rounded-xl" allowFullScreen title={activeGuide.title} />
                  <div className="block md:hidden text-center p-6 space-y-4 font-sans">
                    <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">Open the documentation in a new tab on small screens.</p>
                    <a href={activeGuide.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-white">
                      Open Slide Presentation ↗
                    </a>
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-500 font-mono italic text-center px-4">
                  No {activeGuide.title.replace(' Help Guide', '')} help URL configured yet. Set it under Game Settings.
                </div>
              )}
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={closeHelp}
                className="px-5 py-2 border border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-400 hover:text-white text-[10px] font-bold uppercase tracking-wider rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    {!mobileOpen && (
      <button
        type="button"
        onClick={onMobileOpen}
        title="Open menu"
        aria-label="Open menu"
        className="md:hidden absolute left-0 top-1/2 z-[70] -translate-y-1/2 bg-slate-900 border border-l-0 border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white rounded-r-lg w-7 h-11 flex items-center justify-center shadow-md cursor-pointer"
      >
        <IconChevron collapsed />
      </button>
    )}
    </>
  );
}

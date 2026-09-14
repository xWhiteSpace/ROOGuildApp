import { useCallback, useEffect, useRef, useState } from 'react';
import LeftNavBar from '../components/LeftNavBar';
import ValhallaToolbar from '../components/ValhallaToolbar';
import ValhallaLockup from '../components/ValhallaLockup';
import { useNavigate } from 'react-router-dom';
import { gamesForEnabled, getGame, firstEnabledGameId, resolvePostLoginPath } from '../games/catalog';
import { PRODUCT_MARK_SRC, PRODUCT_ON_DARK_CLASS } from '../brand';

const IconBack = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

export default function MainLayout({ children, user, onLogout, onSessionUser, activeGameId, setActiveGameId }) {
  const navigate = useNavigate();
  const mainRef = useRef(null);
  const lastScrollY = useRef(0);
  const enabledGames = gamesForEnabled(user?.enabledGames);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileHeaderHidden, setMobileHeaderHidden] = useState(false);
  const openMobileNav = useCallback(() => setMobileNavOpen(true), []);
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  const goHome = () => {
    const current = getGame(activeGameId);
    const enabled = user?.enabledGames || [];
    if (current && enabled.includes(current.id) && current.homePath) {
      navigate(current.homePath);
      return;
    }
    const first = getGame(firstEnabledGameId(enabled));
    if (first?.homePath) {
      setActiveGameId(first.id);
      navigate(first.homePath);
      return;
    }
    navigate(resolvePostLoginPath(user));
  };

  const selectGame = (gameId) => {
    setActiveGameId(gameId);
    const game = getGame(gameId);
    if (game?.homePath) navigate(game.homePath);
  };

  useEffect(() => {
    if (mobileNavOpen) setMobileHeaderHidden(false);
  }, [mobileNavOpen]);

  useEffect(() => {
    const scroller = mainRef.current;
    if (!scroller) return undefined;

    const onScroll = () => {
      if (mobileNavOpen) {
        setMobileHeaderHidden(false);
        lastScrollY.current = scroller.scrollTop;
        return;
      }
      const y = scroller.scrollTop;
      const delta = y - lastScrollY.current;
      lastScrollY.current = y;
      if (y < 12) {
        setMobileHeaderHidden(false);
        return;
      }
      if (delta > 16) setMobileHeaderHidden(true);
      else if (delta < -16) setMobileHeaderHidden(false);
    };

    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [mobileNavOpen]);

  const guildName = user?.tenantName || 'Guild';

  return (
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden">
      <div
        className={`w-full bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-3 sm:px-6 py-2.5 flex items-center justify-between gap-x-3 text-xs font-mono select-none z-[80] max-md:absolute max-md:top-0 max-md:inset-x-0 max-md:flex-nowrap max-md:transition-transform max-md:duration-300 md:relative md:shrink-0 ${
          mobileHeaderHidden ? 'max-md:-translate-y-full max-md:pointer-events-none' : ''
        }`}
      >
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <button
            type="button"
            onClick={openMobileNav}
            title="Open menu"
            aria-label="Open menu"
            className={`md:hidden shrink-0 rounded-lg p-1.5 text-slate-300 hover:text-white hover:bg-slate-800/80 cursor-pointer ${
              mobileNavOpen ? 'invisible pointer-events-none' : ''
            }`}
          >
            <IconBack />
          </button>
          <button
            type="button"
            onClick={goHome}
            title={guildName}
            className="md:hidden flex items-center gap-2 min-w-0 rounded-lg px-1 py-0.5 hover:bg-slate-800/80 cursor-pointer"
          >
            <img
              src={user?.tenantLogoUrl || PRODUCT_MARK_SRC}
              alt=""
              onError={(event) => {
                event.currentTarget.onerror = null;
                event.currentTarget.src = PRODUCT_MARK_SRC;
                event.currentTarget.classList.add('brightness-0', 'invert');
              }}
              className={`h-8 w-8 shrink-0 rounded-lg object-contain ${user?.tenantLogoUrl ? '' : PRODUCT_ON_DARK_CLASS}`}
            />
            <span className="truncate text-sm font-semibold text-white">{guildName}</span>
          </button>
          <button
            type="button"
            onClick={goHome}
            title="Home"
            className="hidden md:flex items-center shrink-0 rounded-lg px-1 py-0.5 hover:bg-slate-800/80 cursor-pointer"
          >
            <ValhallaLockup size="sm" />
          </button>
          {enabledGames.length === 0 && (
            <span className="hidden md:inline text-slate-500">[No game]</span>
          )}
          {enabledGames.map((game) => (
            <button
              key={game.id}
              type="button"
              onClick={() => selectGame(game.id)}
              className={`hidden md:inline hover:text-white transition-colors duration-100 cursor-pointer ${
                activeGameId === game.id ? 'text-indigo-400 font-bold' : 'text-slate-400'
              }`}
            >
              [{game.shortLabel}]
            </button>
          ))}
        </div>
        <div className="shrink-0">
        <ValhallaToolbar
          user={user}
          onLogout={onLogout}
          onSessionUser={onSessionUser}
          forceCloseMenu={mobileHeaderHidden}
        />
        </div>
      </div>
      <div className={`flex flex-1 min-h-0 relative ${mobileNavOpen ? 'max-md:overflow-hidden' : ''}`}>
        <LeftNavBar
          activeGameId={activeGameId}
          user={user}
          mobileOpen={mobileNavOpen}
          onMobileOpen={openMobileNav}
          onMobileClose={closeMobileNav}
        />
        <main ref={mainRef} className="flex-1 min-h-0 overflow-y-auto p-6 max-md:pt-16 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

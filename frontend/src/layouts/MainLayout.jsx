import LeftNavBar from '../components/LeftNavBar';
import UserPanel from '../components/UserPanel';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { gamesForEnabled, getGame } from '../games/catalog';

export default function MainLayout({ children, user, onLogout, onSessionUser, activeGameId, setActiveGameId }) {
  const [macroBarVisible, setMacroBarVisible] = useState(true);
  const lastScrollY = useRef(0);
  const navigate = useNavigate();
  const enabledGames = gamesForEnabled(user?.enabledGames);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || document.documentElement.scrollTop;
      const delta = y - lastScrollY.current;

      if (y < 24) {
        setMacroBarVisible(true);
      } else if (delta > 8) {
        setMacroBarVisible(false);
      } else if (delta < -8) {
        setMacroBarVisible(true);
      }

      lastScrollY.current = y;
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const selectGame = (gameId) => {
    setActiveGameId(gameId);
    const game = getGame(gameId);
    if (game?.homePath) navigate(game.homePath);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <div
        className={`w-full bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-6 py-2.5 flex gap-5 text-xs font-mono select-none sticky top-0 z-[80] transition-transform duration-300 ${
          macroBarVisible ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        {enabledGames.length === 0 && (
          <span className="text-slate-500">[No game]</span>
        )}
        {enabledGames.map((game) => (
          <button
            key={game.id}
            type="button"
            onClick={() => selectGame(game.id)}
            className={`hover:text-white transition-colors duration-100 cursor-pointer ${
              activeGameId === game.id ? 'text-indigo-400 font-bold' : 'text-slate-400'
            }`}
          >
            [{game.shortLabel}]
          </button>
        ))}
      </div>
      <div className="flex flex-1">
        <LeftNavBar activeGameId={activeGameId} user={user} />
        <main className="flex-1 p-6 lg:p-8">
          <div className="mb-6">
            <UserPanel user={user} onLogout={onLogout} onSessionUser={onSessionUser} />
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

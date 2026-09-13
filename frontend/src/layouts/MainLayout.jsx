import LeftNavBar from '../components/LeftNavBar';
import ValhallaToolbar from '../components/ValhallaToolbar';
import ValhallaLockup from '../components/ValhallaLockup';
import { useNavigate } from 'react-router-dom';
import { gamesForEnabled, getGame, firstEnabledGameId, resolvePostLoginPath } from '../games/catalog';

export default function MainLayout({ children, user, onLogout, onSessionUser, activeGameId, setActiveGameId }) {
  const navigate = useNavigate();
  const enabledGames = gamesForEnabled(user?.enabledGames);

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

  return (
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden">
      <div className="w-full shrink-0 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-x-5 gap-y-2 text-xs font-mono select-none z-[80]">
        <div className="flex items-center gap-4 min-w-0">
          <button
            type="button"
            onClick={goHome}
            title="Home"
            className="flex items-center shrink-0 rounded-lg px-1 py-0.5 hover:bg-slate-800/80 cursor-pointer"
          >
            <ValhallaLockup size="sm" />
          </button>
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
        <ValhallaToolbar user={user} onLogout={onLogout} onSessionUser={onSessionUser} />
      </div>
      <div className="flex flex-1 min-h-0">
        <LeftNavBar activeGameId={activeGameId} user={user} />
        <main className="flex-1 min-h-0 overflow-y-auto p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

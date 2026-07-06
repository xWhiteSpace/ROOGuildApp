import LeftNavBar from '../components/LeftNavBar';
import UserPanel from '../components/UserPanel';

export default function MainLayout({ children, user, onLogout, macroTab, setMacroTab }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Horizonal Top plain-text macro switcher links */}
      <div className="w-full bg-slate-900 border-b border-slate-800 px-6 py-2.5 flex gap-5 text-xs font-mono select-none">
        <button 
          onClick={() => setMacroTab('auction')} 
          className={`hover:text-white transition-colors duration-100 cursor-pointer ${macroTab === 'auction' ? 'text-indigo-400 font-bold' : 'text-slate-400'}`}
        >
          [Auction]
        </button>
        <button 
          onClick={() => setMacroTab('raid')} 
          className={`hover:text-white transition-colors duration-100 cursor-pointer ${macroTab === 'raid' ? 'text-indigo-400 font-bold' : 'text-slate-400'}`}
        >
          [Raid]
        </button>
      </div>
      <div className="flex flex-1">
        <LeftNavBar macroTab={macroTab} />
        <main className="flex-1 p-6 lg:p-8">
          <div className="mb-6">
            <UserPanel user={user} onLogout={onLogout} />
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

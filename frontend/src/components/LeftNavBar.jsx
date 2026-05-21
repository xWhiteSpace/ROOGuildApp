import { NavLink } from 'react-router-dom';

const navItems = [
  { label: 'Request', path: '/' },
  { label: 'Live Bidding', path: '/live-bidding' },
  { label: 'Request History', path: '/request-history' },
  { label: 'Past Auction', path: '/past-auction' },
  { label: 'Submit Evidence', path: '/submit-evidence' }
];

export default function LeftNavBar() {
  return (
    <aside className="w-72 min-h-screen border-r border-slate-800 bg-slate-950/90 p-4">
      <div className="mb-8 px-3 py-4 text-slate-100">
        <div className="text-2xl font-semibold">DynastyGuild</div>
        <div className="text-sm text-slate-400 mt-1">Loot Command Dashboard</div>
      </div>
      <nav className="space-y-2">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `block rounded-2xl px-4 py-3 text-sm font-medium transition ${
                isActive
                  ? 'bg-slate-800 text-white shadow-sm '
                  : 'text-slate-300 hover:bg-slate-900 hover:text-white'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

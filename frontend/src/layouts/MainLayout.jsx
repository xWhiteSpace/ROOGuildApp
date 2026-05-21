import LeftNavBar from '../components/LeftNavBar';
import UserPanel from '../components/UserPanel';

export default function MainLayout({ children, user, onLogout }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="flex">
        <LeftNavBar />
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

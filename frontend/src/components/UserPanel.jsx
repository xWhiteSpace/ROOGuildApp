export default function UserPanel({ user, onLogout }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-3xl bg-slate-900/90 px-4 py-3 text-slate-100 shadow-sm">
      {user ? (
        <>
          <div>
            <div className="text-sm text-slate-400">Signed in as</div>
            <div className="text-base font-semibold text-white">
              {user.username}#{user.discriminator}
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Logout
          </button>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="text-sm text-slate-400">Not signed in</div>
          <a
            href={`${import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001'}/auth/login`}
            className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Sign in with Discord
          </a>
        </div>
      )}
    </div>
  );
}

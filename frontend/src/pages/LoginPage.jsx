const backendUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';

export default function LoginPage() {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl">
      <h2 className="text-3xl font-semibold text-white">Discord Login</h2>
      <p className="mt-3 text-slate-400">Authenticate with Discord to access request and bidding features.</p>
      <a
        href={`${backendUrl}/auth/login`}
        className="mt-6 inline-flex w-max rounded-full bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-indigo-500"
      >
        Sign in with Discord
      </a>
    </div>
  );
}

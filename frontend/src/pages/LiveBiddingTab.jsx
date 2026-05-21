import ChatConsole from '../components/ChatConsole';

export default function LiveBiddingTab({ user }) {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl">
        <h2 className="text-2xl font-semibold text-white">Live Bidding</h2>
        <p className="mt-2 text-slate-400">Real-time queue, active bidder, and admin chat controls.</p>
      </section>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-lg">
          <h3 className="text-xl font-semibold">Queue Pipeline</h3>
          <div className="mt-4 space-y-3 text-slate-300">
            <div className="rounded-2xl bg-slate-950/80 p-4">NOW: <strong>Loading...</strong></div>
            <div className="rounded-2xl bg-slate-950/80 p-4">NEXT: <strong>Loading...</strong></div>
            <div className="rounded-2xl bg-slate-950/80 p-4">STANDBY: <strong>Loading...</strong></div>
          </div>
        </div>
        <ChatConsole user={user} />
      </div>
    </div>
  );
}

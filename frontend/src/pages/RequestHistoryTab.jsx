export default function RequestHistoryTab() {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl">
        <h2 className="text-2xl font-semibold text-white">Request History</h2>
        <p className="mt-2 text-slate-400">A chronological log of previous requests and audit trail events.</p>
      </div>
      <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-lg">
        <div className="text-slate-400">History entries will appear here once the backend sync is active.</div>
      </div>
    </div>
  );
}

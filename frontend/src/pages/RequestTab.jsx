export default function RequestTab() {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl">
        <h2 className="text-2xl font-semibold text-white">Request</h2>
        <p className="mt-2 text-slate-400">
          Select items, submit batch requests, and manage your live sheet requests.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {['Puppet', 'Illu', 'Light&Dark', 'Time&Space'].map((item) => (
          <article key={item} className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-lg">
            <h3 className="text-xl font-semibold">{item}</h3>
            <p className="mt-2 text-slate-400">Active item tab data will display here.</p>
            <button
              type="button"
              className="mt-4 inline-flex items-center justify-center rounded-full bg-slate-700 px-4 py-2 text-sm text-white hover:bg-slate-600"
            >
              Select {item}
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

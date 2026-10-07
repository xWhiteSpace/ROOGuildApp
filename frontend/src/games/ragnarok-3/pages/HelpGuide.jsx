import { useSettings } from '../query.js';

function HelpFrame({ title, url }) {
  if (!url) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/20 px-6 py-16 text-center">
        <p className="text-xs text-slate-400">
          No {title} URL yet. Officers set it under Game Settings.
        </p>
      </div>
    );
  }
  return (
    <iframe
      title={title}
      src={url}
      className="w-full min-h-[70vh] rounded-2xl border border-slate-800 bg-slate-950"
      allow="fullscreen"
    />
  );
}

export default function HelpGuide() {
  const helpQuery = useSettings('helpEmbedUrl,raidHelpEmbedUrl');
  const helpEmbedUrl = helpQuery.data?.helpEmbedUrl || '';
  const raidHelpEmbedUrl = helpQuery.data?.raidHelpEmbedUrl || '';
  const url = raidHelpEmbedUrl || helpEmbedUrl;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div>
        <h1 className="text-lg font-black text-slate-100 uppercase tracking-wide">Help Guide</h1>
        <p className="text-xs text-slate-500 mt-1">Ragnarok 3 officer-configured walkthroughs.</p>
      </div>
      {helpQuery.isLoading && !helpQuery.data ? (
        <p className="text-xs text-slate-500 font-mono">Loading help URLs…</p>
      ) : (
        <HelpFrame title="Ragnarok 3 Help Guide" url={url} />
      )}
    </div>
  );
}

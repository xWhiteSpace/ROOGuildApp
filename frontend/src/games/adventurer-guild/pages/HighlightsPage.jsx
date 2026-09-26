import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../../services/apiClient';

function isVideo(highlight) {
  return highlight?.kind === 'video' || String(highlight?.mime || '').startsWith('video/');
}

export default function HighlightsPage({ user }) {
  const fileRef = useRef(null);
  const [highlights, setHighlights] = useState([]);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    setError('');
    const res = await apiFetch('/api/adventurer-guild/highlights', { method: 'GET' });
    const data = await res.json();
    if (!data.success) {
      setError(data.error || 'Could not load highlights.');
      return;
    }
    setHighlights(data.highlights || []);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleUpload = async (event) => {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError('Choose an image or video first.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('caption', caption);
      const res = await apiFetch('/api/adventurer-guild/highlights', { method: 'POST', body });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'Could not upload.');
        return;
      }
      setCaption('');
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    setError('');
    try {
      const res = await apiFetch(`/api/adventurer-guild/highlights/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'Could not delete.');
        return;
      }
      setHighlights((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  const canDelete = (item) => user?.isOfficer || String(item.createdBy) === String(user?.id);

  return (
    <div className="space-y-6 max-w-5xl mx-auto font-sans">
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Adventurer Guild</div>
        <h1 className="text-2xl font-semibold text-white mt-1">Highlights</h1>
        <p className="text-sm text-slate-400 mt-1">Guild memory. Upload a clip or screenshot from the games you play.</p>
      </div>

      <form onSubmit={handleUpload} className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 space-y-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm"
          className="block w-full text-xs text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-3 file:py-1.5 file:text-[10px] file:font-bold file:uppercase file:tracking-wider file:text-white"
        />
        <input
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          maxLength={280}
          placeholder="Caption (optional)"
          className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={uploading}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-white disabled:opacity-40"
          >
            {uploading ? 'Uploading…' : 'Post highlight'}
          </button>
        </div>
      </form>

      {error && <p className="text-xs text-rose-300 font-mono">{error}</p>}
      {loading && <p className="text-xs uppercase tracking-widest text-slate-500">Loading hall…</p>}

      {!loading && highlights.length === 0 && (
        <p className="text-sm text-slate-500">No highlights yet. Be the first to pin a memory.</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {highlights.map((item) => (
          <article key={item.id} className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden">
            {isVideo(item) ? (
              <video src={item.url} controls preload="metadata" className="w-full aspect-video bg-black" />
            ) : (
              <img src={item.url} alt={item.caption || 'Highlight'} className="w-full aspect-video object-cover bg-slate-950" />
            )}
            <div className="p-3 space-y-2">
              {item.caption ? <p className="text-sm text-slate-200">{item.caption}</p> : null}
              <div className="flex items-center justify-between gap-2 text-[10px] font-mono uppercase tracking-widest text-slate-500">
                <span className="truncate">{item.createdByName || 'Adventurer'}</span>
                {canDelete(item) && (
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    className="text-rose-300 hover:text-rose-200"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

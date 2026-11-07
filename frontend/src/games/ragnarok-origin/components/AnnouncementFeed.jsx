import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { DEFAULT_TZ, getGuildNowParts } from '../../../utils/guildTime';

function announcementPostedLabel(createdAt, timezone) {
  const ms = Number(createdAt);
  if (!Number.isFinite(ms) || ms <= 0) return { label: '', title: '', iso: '' };
  const zone = timezone || DEFAULT_TZ;
  const date = new Date(ms);
  const posted = getGuildNowParts(zone, date);
  const today = getGuildNowParts(zone);
  const label = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(posted.year !== today.year ? { year: 'numeric' } : {}),
    timeZone: zone,
  });
  const title = date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: zone });
  return { label, title, iso: date.toISOString() };
}

function DriftingMessage({ text }) {
  const frameRef = useRef(null);
  const textRef = useRef(null);
  const [drift, setDrift] = useState(0);

  useEffect(() => {
    const frame = frameRef.current;
    const body = textRef.current;
    if (!frame || !body) return undefined;
    const measure = () => {
      const extra = body.scrollHeight - frame.clientHeight;
      setDrift(extra > 2 ? extra : 0);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(body);
    return () => observer.disconnect();
  }, [text]);

  const seconds = Math.max(8, (drift / 14) * 2);

  return (
    <div
      ref={frameRef}
      className={`group mt-1 max-h-16 overflow-x-hidden ${drift ? 'overflow-y-hidden motion-reduce:overflow-y-auto' : 'overflow-y-auto'}`}
    >
      <p
        ref={textRef}
        className="break-words text-xs leading-relaxed text-slate-300 whitespace-pre-wrap motion-reduce:animate-none group-hover:[animation-play-state:paused]"
        style={drift ? { '--drift': `${drift}px`, animation: `welcome-drift ${seconds}s ease-in-out infinite` } : undefined}
      >
        {text}
      </p>
    </div>
  );
}

function AnnouncementDate({ item, timezone, className }) {
  const posted = announcementPostedLabel(item.createdAt, timezone);
  if (!posted.label) return null;
  if (item.jumpUrl) {
    return (
      <a href={item.jumpUrl} target="_blank" rel="noreferrer" title={posted.title} className={className} onClick={(event) => event.stopPropagation()}>
        <time dateTime={posted.iso}>{posted.label}</time>
      </a>
    );
  }
  return <time dateTime={posted.iso} title={posted.title} className={className}>{posted.label}</time>;
}

function AnnouncementDialog({ item, timezone, onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="announcement-dialog-title"
        className="relative z-10 flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="announcement-dialog-title" className="min-w-0 text-base font-medium text-slate-100">{item.title || 'Announcement'}</h2>
          <button ref={closeRef} type="button" aria-label="Close" onClick={onClose} className="shrink-0 rounded-lg border border-slate-800 p-1.5 text-slate-400 hover:text-white cursor-pointer">
            <X size={14} />
          </button>
        </div>
        {item.body && (
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-200">{item.body}</p>
          </div>
        )}
        <div className="mt-4 flex min-w-0 items-baseline justify-between gap-3 border-t border-slate-800 pt-3">
          <AnnouncementDate item={item} timezone={timezone} className="shrink-0 text-[11px] font-normal text-slate-400 hover:text-slate-200" />
          <p className="ml-auto min-w-0 truncate text-right text-[11px] font-normal text-slate-400" title={item.authorName}>{item.authorName}</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function AnnouncementFeed({
  posts = [],
  unmapped = false,
  pending = false,
  error = '',
  timezone,
  unmappedMessage = 'An officer sets General announcements in Settings.',
  emptyMessage = 'No announcements yet.',
}) {
  const [openId, setOpenId] = useState(null);
  const open = posts.find((item) => item.id === openId) || null;
  const closeDialog = useCallback(() => setOpenId(null), []);

  return (
    <>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto">
        {unmapped && (
          <p className="px-1 py-4 text-[11px] text-slate-500">{unmappedMessage}</p>
        )}
        {!unmapped && !pending && posts.length === 0 && !error && (
          <p className="px-1 py-4 text-[11px] text-slate-500">{emptyMessage}</p>
        )}
        {posts.map((item) => (
          <article
            key={item.id}
            className="min-w-0 shrink-0 cursor-pointer rounded-xl border border-slate-800 bg-slate-950/50 px-2.5 py-2"
            onClick={() => setOpenId(item.id)}
          >
            {item.title && (
              <h3 className="min-w-0 truncate pt-0.5 text-sm font-medium text-slate-100">{item.title}</h3>
            )}
            {item.body && (
              <DriftingMessage text={item.body} />
            )}
            <div className="mt-1.5 flex min-w-0 items-baseline justify-between gap-3">
              <AnnouncementDate item={item} timezone={timezone} className="shrink-0 text-[10px] font-normal text-slate-500 hover:text-slate-300" />
              <p className="ml-auto min-w-0 truncate text-right text-[10px] font-normal text-slate-500" title={item.authorName}>{item.authorName}</p>
            </div>
          </article>
        ))}
        {error && (
          <p className="px-1 pb-1 text-[10px] text-rose-400">{error}</p>
        )}
      </div>
      {open && (
        <AnnouncementDialog item={open} timezone={timezone} onClose={closeDialog} />
      )}
    </>
  );
}

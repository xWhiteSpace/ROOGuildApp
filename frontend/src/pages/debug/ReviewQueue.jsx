import { useEffect, useMemo, useState } from 'react';
import {
  loadReviewMarks,
  queueFor,
  reviewFlags,
  reviewLineage,
  saveReviewMark,
} from './reviewModel';

const VERDICTS = [
  { id: 'keep', label: 'Keep' },
  { id: 'rewrite', label: 'Rewrite' },
  { id: 'reject', label: 'Reject' },
];

function IdPills({ caption, empty, ids, onPick }) {
  return (
    <div className="mt-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-cyan-200/80">{caption}</p>
      {ids.length === 0 && (
        <p className="mt-2 text-sm text-slate-500">{empty}</p>
      )}
      {ids.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {ids.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onPick?.(id)}
              className="rounded-full border border-slate-700 px-2 py-0.5 font-mono text-[10px] text-slate-300 hover:border-cyan-400 hover:text-white"
            >
              {id}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ReviewQueue({ items, artifacts, graph, kinds, onClose, onOpenFocus }) {
  const [marks, setMarks] = useState(() => loadReviewMarks());
  const [note, setNote] = useState('');
  const [cursor, setCursor] = useState(0);
  const lineage = useMemo(() => reviewLineage(graph), [graph]);
  const queue = useMemo(() => queueFor(items, artifacts), [items, artifacts]);
  const current = queue[cursor] || null;
  const meta = current ? (artifacts?.[current.id] || {}) : {};
  const review = current ? reviewFlags(current, meta, lineage) : null;
  const mark = current ? marks[current.id] : null;
  const reviewed = queue.filter((item) => marks[item.id]?.verdict).length;
  const kindLabel = kinds.length === 1 ? kinds[0] : 'published';

  useEffect(() => {
    setCursor(0);
  }, [queue]);

  useEffect(() => {
    setNote(mark?.note || '');
  }, [current?.id, mark?.note]);

  function go(delta) {
    if (!queue.length) return;
    setCursor((index) => (index + delta + queue.length) % queue.length);
  }

  function verdict(id) {
    if (!current) return;
    const next = saveReviewMark(current.id, { verdict: id, note });
    setMarks(next);
    if (cursor < queue.length - 1) setCursor(cursor + 1);
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-700 px-3 py-1 text-[11px] uppercase tracking-wider text-slate-300 hover:border-slate-500 hover:text-white"
            >
              Close review
            </button>
            <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-slate-500">Human review · not SSOT</p>
            <h1 className="text-lg font-semibold text-white">Review queue</h1>
            <p className="mt-1 font-mono text-xs text-slate-400">
              {reviewed} / {queue.length} {kindLabel}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => go(-1)}
              disabled={!queue.length}
              className="rounded-full border border-slate-700 px-3 py-1 text-[11px] uppercase tracking-wider text-slate-300 hover:border-slate-500 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              disabled={!queue.length}
              className="rounded-full border border-slate-700 px-3 py-1 text-[11px] uppercase tracking-wider text-slate-300 hover:border-slate-500 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {!current && (
        <p className="px-1 py-6 text-sm text-slate-400">No published items in this filter.</p>
      )}

      {current && review && (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-cyan-200/80">
            {meta.domain || '(none)'} · {current.kind}
            {mark?.verdict ? ` · ${mark.verdict}` : ''}
          </p>
          <h2 className="mt-2 text-xl font-semibold leading-snug text-white">
            {meta.title || current.id}
          </h2>
          <p className="mt-2 font-mono text-xs text-slate-400">{current.id}</p>
          {meta.statement && (
            <p className="mt-4 text-sm leading-relaxed text-slate-300">{meta.statement}</p>
          )}
          {meta.acceptance && (
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Acceptance: {meta.acceptance}
            </p>
          )}

          <IdPills
            caption="Stakeholder need"
            empty="No stakeholder need."
            ids={review.parents}
            onPick={onOpenFocus}
          />
          <IdPills
            caption="Satisfied by"
            empty="No function allocated to this need."
            ids={review.functions}
            onPick={onOpenFocus}
          />
          <IdPills
            caption="Verify plans"
            empty="No test plan verifies this node."
            ids={review.tests}
            onPick={onOpenFocus}
          />

          <div className="mt-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-cyan-200/80">Auto flags</p>
            {review.flags.length === 0 && (
              <p className="mt-2 text-sm text-slate-500">No automatic flags. Still needs your mark.</p>
            )}
            {review.flags.length > 0 && (
              <ul className="mt-2 space-y-1">
                {review.flags.map((flag) => (
                  <li key={flag} className="text-sm text-amber-200/90">{flag}</li>
                ))}
              </ul>
            )}
          </div>

          <label className="mt-6 block">
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-cyan-200/80">Note</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              className="mt-2 w-full resize-y rounded-2xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500/50"
            />
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            {VERDICTS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={mark?.verdict === item.id}
                onClick={() => verdict(item.id)}
                className={`rounded-full border px-4 py-2 text-[11px] uppercase tracking-[0.18em] ${mark?.verdict === item.id
                  ? 'border-cyan-100 bg-cyan-100 text-slate-900'
                  : 'border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white'}`}
              >
                {item.label}
              </button>
            ))}
            {onOpenFocus && (
              <button
                type="button"
                onClick={() => onOpenFocus(current.id)}
                className="rounded-full border border-cyan-500/40 px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-cyan-100 hover:border-cyan-200"
              >
                Neighborhood
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

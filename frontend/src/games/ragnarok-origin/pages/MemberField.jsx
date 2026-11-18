import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, User } from 'lucide-react';

const fieldClass = 'box-border h-8 w-full rounded-xl border border-slate-800 bg-slate-950 pl-8 text-xs text-slate-100 outline-none scheme-dark focus:border-slate-600 disabled:opacity-40';

function memberName(people, value) {
  const row = (people || []).find((item) => String(item.uid) === String(value || ''));
  return row?.displayName || '';
}

export default function MemberField({
  people,
  value,
  text,
  onText,
  onPick,
  onMine,
  mine,
  allowMine,
  placeholder,
  emptyLabel,
  disabled,
}) {
  const controlled = text != null;
  const selectedName = memberName(people, value);
  const [local, setLocal] = useState(selectedName);
  const [synced, setSynced] = useState(value);
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState(null);
  const boxRef = useRef(null);
  const menuRef = useRef(null);
  if (!controlled && synced !== value) {
    setSynced(value);
    setLocal(selectedName);
  }
  const shown = controlled ? text : local;
  const setShown = (next) => {
    if (!controlled) setLocal(next);
    if (onText) onText(next);
  };
  const needle = String(shown || '').trim().toLowerCase();
  const browsing = !needle || needle === selectedName.toLowerCase();
  const matches = (people || []).filter((row) => {
    if (browsing) return true;
    return `${row.displayName || ''} ${row.inGameName || ''}`.toLowerCase().includes(needle);
  });
  const mineId = mine ? String(mine.uid) : '';
  const mineOn = Boolean(mineId) && String(value || '') === mineId;

  useLayoutEffect(() => {
    if (!open || !boxRef.current) return undefined;
    const update = () => {
      const rect = boxRef.current.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom;
      const above = rect.top;
      const upward = below < 220 && above > below;
      setPlace({
        left: rect.left,
        width: rect.width,
        top: upward ? null : rect.bottom + 4,
        bottom: upward ? window.innerHeight - rect.top + 4 : null,
      });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, shown, matches.length]);

  const pick = (uid) => {
    const row = (people || []).find((item) => String(item.uid) === String(uid));
    const name = uid ? (row?.displayName || (mine && String(mine.uid) === String(uid) ? mine.displayName : '')) : '';
    setShown(name);
    setOpen(false);
    onPick(uid);
  };

  const menu = open && place ? (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: place.left,
        width: place.width,
        top: place.top ?? 'auto',
        bottom: place.bottom ?? 'auto',
      }}
      className="z-[80] max-h-56 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 shadow-xl"
    >
      {emptyLabel ? (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => pick('')}
          className="block w-full truncate px-3 py-2 text-left text-xs font-semibold text-slate-400 hover:bg-slate-900 hover:text-white"
        >
          {emptyLabel}
        </button>
      ) : null}
      {matches.length ? matches.map((row) => (
        <button
          key={row.uid}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => pick(row.uid)}
          className="block w-full truncate px-3 py-2 text-left text-xs font-semibold text-slate-300 hover:bg-slate-900 hover:text-white"
        >
          {row.displayName}
        </button>
      )) : (
        <p className="px-3 py-2 text-xs text-slate-500">No member matches.</p>
      )}
    </div>
  ) : null;

  return (
    <span ref={boxRef} className="relative block">
      <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 z-[1] -translate-y-1/2 text-slate-500" />
      <input
        value={shown}
        disabled={disabled}
        autoComplete="off"
        placeholder={placeholder}
        onChange={(event) => {
          setShown(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={(event) => {
          if (menuRef.current && menuRef.current.contains(event.relatedTarget)) return;
          setOpen(false);
          if (!controlled) setLocal(selectedName);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
        className={`${fieldClass} ${allowMine ? 'pr-8' : 'pr-2.5'}`}
      />
      {allowMine ? (
        <button
          type="button"
          aria-label="Mine"
          aria-pressed={mineOn}
          disabled={disabled || !mineId}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            const name = mine?.displayName || '';
            setShown(name);
            setOpen(false);
            if (onMine) onMine(mineId);
            else onPick(mineId);
          }}
          className={`absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-lg ${mineOn ? 'text-indigo-300' : 'text-slate-400'} hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent`}
        >
          <User size={14} />
        </button>
      ) : null}
      {menu ? createPortal(menu, document.body) : null}
    </span>
  );
}

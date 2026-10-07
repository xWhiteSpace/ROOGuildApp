import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import MemberTrendSparkline from './MemberTrendSparkline';

const TIP_W = 300;
const TIP_H = 200;
const GAP = 8;

/**
 * Hover-triggered attendance trend tip, portaled to document.body
 * so it never paints under grid/namecard stacking contexts.
 */
export default function MemberTrendHoverTip({
  enabled = true,
  displayName = 'Raider',
  timeline = [],
  children,
}) {
  const triggerRef = useRef(null);
  const tipRef = useRef(null);
  const closeTimer = useRef(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const clearClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const scheduleClose = () => {
    clearClose();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  const placeTip = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = rect.left + rect.width / 2 - TIP_W / 2;
    left = Math.max(GAP, Math.min(left, vw - TIP_W - GAP));

    const spaceBelow = vh - rect.bottom;
    const placeAbove = spaceBelow < TIP_H + GAP && rect.top > TIP_H + GAP;
    const top = placeAbove ? rect.top - TIP_H - GAP : rect.bottom + GAP;

    setCoords({
      top: Math.max(GAP, Math.min(top, vh - TIP_H - GAP)),
      left,
    });
  }, []);

  const openTip = () => {
    if (!enabled) return;
    clearClose();
    placeTip();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onScrollOrResize = () => placeTip();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, placeTip]);

  useEffect(() => () => clearClose(), []);

  return (
    <>
      <span
        ref={triggerRef}
        className="inline-flex"
        onMouseEnter={openTip}
        onMouseLeave={scheduleClose}
        onFocus={openTip}
        onBlur={scheduleClose}
      >
        {children}
      </span>
      {open && enabled && createPortal(
        <div
          ref={tipRef}
          role="tooltip"
          onMouseEnter={clearClose}
          onMouseLeave={scheduleClose}
          className="fixed z-[9999] w-[300px] rounded-2xl border border-slate-700 bg-slate-900 p-3 shadow-2xl animate-fadeIn pointer-events-auto"
          style={{ top: coords.top, left: coords.left }}
        >
          <div className="text-[9px] font-mono font-bold uppercase text-slate-400 tracking-wider select-none px-0.5 border-b border-slate-800 pb-1.5 mb-2 truncate">
            {displayName} · Reliability Trend
          </div>
          <MemberTrendSparkline timeline={timeline} displayName={displayName} compact />
        </div>,
        document.body
      )}
    </>
  );
}

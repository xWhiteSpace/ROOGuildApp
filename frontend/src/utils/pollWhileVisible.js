/**
 * Repeat `fn` on an interval only while the document is visible.
 * When the tab becomes visible again, `fn` runs immediately so the view is not stale.
 * Interval and callback stay the same as a normal setInterval while the tab is in front.
 */
export function pollWhileVisible(fn, intervalMs) {
  if (typeof document === 'undefined') {
    const id = setInterval(fn, intervalMs);
    return () => clearInterval(id);
  }

  const tick = () => {
    if (document.hidden) return;
    fn();
  };

  const onVisibility = () => {
    if (!document.hidden) fn();
  };

  const id = setInterval(tick, intervalMs);
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    clearInterval(id);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

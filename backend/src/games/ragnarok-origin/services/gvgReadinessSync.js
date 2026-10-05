/**
 * Pure gate for the war-room tick: whether to rematerialize the GVG Readiness
 * card, post only if missing, or skip (no roster dump, no Discord).
 */
export function gvgReadinessSyncMode({
  currentPhase,
  storedEventKey,
  cycleEventKey,
  messageId,
} = {}) {
  const phase = Number(currentPhase);
  if (phase === 1) {
    if (messageId && storedEventKey && cycleEventKey && storedEventKey === cycleEventKey) {
      return 'skip';
    }
    return 'rematerialize';
  }
  if (phase === 2 || phase === 3) return 'ifMissing';
  return 'skip';
}

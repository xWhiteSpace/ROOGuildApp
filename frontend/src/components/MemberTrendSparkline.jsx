/**
 * Pure SVG sparkline for a member's attendance reliability trend.
 * Same scoring model as AttendanceHistoryTab Member Trend Card.
 */
export function calculateAttendancePoints(commitment, presentTicks, totalPulses) {
  const calPt = (commitment === 'Confirmed' || commitment === 'Confirm' || commitment === 'Leave') ? 1.0 : 0.0;
  const discPt = presentTicks > 0 ? 1.0 : 0.0;
  const durationPt = totalPulses > 0 ? (presentTicks / totalPulses) * 1.0 : 0.0;
  const total = parseFloat((calPt + discPt + durationPt).toFixed(2));
  return {
    calPt,
    discPt,
    durationPt,
    total: total > 3.0 ? 3.0 : total,
  };
}

/**
 * Build chronological trend points (last N lockouts) for one member.
 */
export function buildMemberTrendTimeline(sessions, ledger, memberUid, limit = 8) {
  if (!memberUid || !sessions) return [];
  const chronological = Object.values(sessions).sort((a, b) => (a.endedAt || 0) - (b.endedAt || 0));
  const timeline = [];

  chronological.forEach((s) => {
    const userTicks = s.userTallies?.[memberUid] || s.userTallies?.[String(memberUid)] || 0;
    const totalPulses = s.totalPulses || 0;
    let commitment = 'None';
    const memberLedger = ledger?.[memberUid] || ledger?.[String(memberUid)];
    if (memberLedger) {
      const matchingLog = Object.values(memberLedger).find((l) => l.sessionId === s.id);
      if (matchingLog) commitment = matchingLog.commitmentStatus || 'None';
    }
    const points = calculateAttendancePoints(commitment, userTicks, totalPulses);
    timeline.push({
      sessionId: s.id,
      eventTitle: s.eventTitle || 'Raid run',
      eventDate: s.eventDate,
      points,
    });
  });

  return timeline.slice(-limit);
}

export function buildSparklinePath(timeline, width = 500, height = 120) {
  if (!timeline || timeline.length < 2) return '';
  const padX = 20;
  const padY = 20;
  const pointsCount = timeline.length;
  const stepX = (width - padX * 2) / (pointsCount - 1);

  return timeline
    .map((item, index) => {
      const x = padX + index * stepX;
      const y = height - padY - ((item.points.total / 3.0) * (height - padY * 2));
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');
}

export default function MemberTrendSparkline({
  timeline = [],
  displayName = 'Raider',
  compact = false,
}) {
  const path = buildSparklinePath(timeline);
  const h = compact ? 90 : 120;
  const w = 500;

  if (timeline.length < 2) {
    return (
      <div className="text-center py-6 text-[10px] text-slate-500 font-mono italic px-2">
        Insufficient raid history to plot reliability for {displayName}.
      </div>
    );
  }

  return (
    <div className="bg-slate-950 border border-slate-900 rounded-2xl p-3 shadow-inner flex flex-col items-center">
      <div className={`w-full ${compact ? 'h-[90px]' : 'h-[130px]'} relative`}>
        <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${w} ${h}`} fill="none">
          <line x1="20" y1="20" x2={w - 20} y2="20" stroke="#334155" strokeWidth="1" strokeDasharray="3 3" />
          <line x1="20" y1={h - 20} x2={w - 20} y2={h - 20} stroke="#334155" strokeWidth="1" strokeDasharray="3 3" />
          <path d={path} stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {timeline.map((item, index) => {
            const stepX = (w - 40) / (timeline.length - 1);
            const x = 20 + index * stepX;
            const y = h - 20 - ((item.points.total / 3.0) * (h - 40));
            return (
              <circle
                key={item.sessionId || index}
                cx={x}
                cy={y}
                r="4"
                className="fill-indigo-500 stroke-slate-950"
                strokeWidth="1.5"
              />
            );
          })}
        </svg>
      </div>
      <div className="w-full flex justify-between text-[8px] font-mono font-bold uppercase tracking-wide text-slate-500 px-2 mt-1 select-none">
        <span>Older</span>
        <span>Last {timeline.length} lockouts</span>
        <span>Latest</span>
      </div>
    </div>
  );
}

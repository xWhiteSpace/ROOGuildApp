/**
 * Pure SVG sparkline for a member's attendance reliability trend.
 * Uses the shared attendanceScore SSOT (max 4.0 including In-game Status).
 */
import { calculatePoints, MAX_RAID_SCORE } from '../utils/attendanceScore';

/**
 * Build chronological trend points (last N lockouts) for one member.
 */
export function buildMemberTrendTimeline(sessions, memberUid, limit = 8) {
  if (!memberUid || !sessions) return [];
  const chronological = Object.values(sessions).sort((a, b) => (a.endedAt || 0) - (b.endedAt || 0));
  const timeline = [];

  chronological.forEach((s) => {
    const uidKey = memberUid;
    const uidStr = String(memberUid);
    const userTicks = s.userTallies?.[uidKey] || s.userTallies?.[uidStr] || 0;
    const totalPulses = s.totalPulses || 0;
    const commitment = s.commitments?.[uidKey] || s.commitments?.[uidStr] || 'None';
    const inGameConfirmed = s.inGameStatus?.[uidKey] === true || s.inGameStatus?.[uidStr] === true;
    const points = calculatePoints(commitment, userTicks, totalPulses, inGameConfirmed);
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
  const padX = 36;
  const padY = 20;
  const pointsCount = timeline.length;
  const stepX = (width - padX * 2) / (pointsCount - 1);

  return timeline
    .map((item, index) => {
      const x = padX + index * stepX;
      const y = height - padY - ((item.points.total / MAX_RAID_SCORE) * (height - padY * 2));
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
  const padX = 36;
  const padY = 20;
  const plotTop = padY;
  const plotBottom = h - padY;
  const plotMid = (plotTop + plotBottom) / 2;

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
          {/* Y-axis guides: 100% / 50% / 0% */}
          <line x1={padX} y1={plotTop} x2={w - padX} y2={plotTop} stroke="#334155" strokeWidth="1" strokeDasharray="3 3" />
          <line x1={padX} y1={plotMid} x2={w - padX} y2={plotMid} stroke="#475569" strokeWidth="1" strokeDasharray="2 4" />
          <line x1={padX} y1={plotBottom} x2={w - padX} y2={plotBottom} stroke="#334155" strokeWidth="1" strokeDasharray="3 3" />
          <text x="4" y={plotTop + 3} fill="#64748b" fontSize="8" fontFamily="monospace">100%</text>
          <text x="4" y={plotMid + 3} fill="#64748b" fontSize="8" fontFamily="monospace">50%</text>
          <text x="4" y={plotBottom + 3} fill="#64748b" fontSize="8" fontFamily="monospace">0%</text>

          <path d={path} stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {timeline.map((item, index) => {
            const stepX = (w - padX * 2) / (timeline.length - 1);
            const x = padX + index * stepX;
            const y = plotBottom - ((item.points.total / MAX_RAID_SCORE) * (plotBottom - plotTop));
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
        <span>Earlier scores</span>
        <span>Last 8 consecutive</span>
        <span>Latest score</span>
      </div>
    </div>
  );
}

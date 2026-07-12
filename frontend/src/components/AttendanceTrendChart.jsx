/**
 * AttendanceTrendChart — pure-SVG line chart for the guild attendance trend.
 *
 * Y axis: 0-100% in 10% increments. X axis: raid session dates (ascending).
 * Lines: Guild Actual (indigo), Expected target (dashed amber, flat),
 *        optional selected member overlay (rose).
 */

const WIDTH = 720;
const HEIGHT = 300;
const PAD_LEFT = 42;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 48;

const PLOT_W = WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_H = HEIGHT - PAD_TOP - PAD_BOTTOM;

const COLOR_GUILD = '#6366f1';
const COLOR_EXPECTED = '#f59e0b';
const COLOR_MEMBER = '#f43f5e';

function pctToY(pct) {
  const clamped = Math.max(0, Math.min(100, pct));
  return PAD_TOP + PLOT_H - (clamped / 100) * PLOT_H;
}

function indexToX(index, count) {
  if (count <= 1) return PAD_LEFT + PLOT_W / 2;
  return PAD_LEFT + (index / (count - 1)) * PLOT_W;
}

function buildPath(points, accessor, count) {
  return points
    .map((p, i) => {
      const val = accessor(p);
      if (val == null || Number.isNaN(val)) return null;
      return `${indexToX(i, count)},${pctToY(val)}`;
    })
    .filter(Boolean)
    .map((coord, i) => `${i === 0 ? 'M' : 'L'} ${coord}`)
    .join(' ');
}

function LegendChip({ color, label, dashed }) {
  return (
    <div className="flex items-center gap-1.5">
      <svg width="20" height="8" className="shrink-0">
        <line
          x1="0"
          y1="4"
          x2="20"
          y2="4"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={dashed ? '4 3' : undefined}
        />
      </svg>
      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">{label}</span>
    </div>
  );
}

export default function AttendanceTrendChart({ points = [], expectedRate = 80, memberName = null }) {
  if (!points || points.length < 2) {
    return (
      <div className="text-center py-16 text-[11px] text-slate-500 font-mono italic">
        Need at least 2 archived raid sessions to plot an attendance trend.
      </div>
    );
  }

  const count = points.length;
  const gridLevels = Array.from({ length: 11 }, (_, i) => i * 10); // 0,10,...,100
  const expectedY = pctToY(expectedRate);
  const hasMember = points.some((p) => p.memberPct != null);

  const guildPath = buildPath(points, (p) => p.guildPct, count);
  const memberPath = hasMember ? buildPath(points, (p) => p.memberPct, count) : '';

  return (
    <div className="w-full">
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto min-w-[520px]" fill="none">
          {/* Horizontal grid + Y labels */}
          {gridLevels.map((level) => {
            const y = pctToY(level);
            return (
              <g key={level}>
                <line
                  x1={PAD_LEFT}
                  y1={y}
                  x2={WIDTH - PAD_RIGHT}
                  y2={y}
                  stroke="#1e293b"
                  strokeWidth="1"
                  strokeDasharray={level === 0 ? undefined : '3 3'}
                />
                <text
                  x={PAD_LEFT - 8}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-slate-500"
                  style={{ fontSize: '9px', fontFamily: 'monospace' }}
                >
                  {level}%
                </text>
              </g>
            );
          })}

          {/* Expected target flat line */}
          <line
            x1={PAD_LEFT}
            y1={expectedY}
            x2={WIDTH - PAD_RIGHT}
            y2={expectedY}
            stroke={COLOR_EXPECTED}
            strokeWidth="2"
            strokeDasharray="5 4"
          />
          <text
            x={WIDTH - PAD_RIGHT}
            y={expectedY - 5}
            textAnchor="end"
            className="fill-amber-400"
            style={{ fontSize: '9px', fontFamily: 'monospace', fontWeight: 700 }}
          >
            EXPECTED {expectedRate}%
          </text>

          {/* Guild Actual line */}
          <path d={guildPath} stroke={COLOR_GUILD} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Member overlay line */}
          {hasMember && memberPath && (
            <path d={memberPath} stroke={COLOR_MEMBER} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 0" />
          )}

          {/* Data point markers + X labels */}
          {points.map((p, i) => {
            const x = indexToX(i, count);
            const guildY = pctToY(p.guildPct);
            return (
              <g key={i}>
                <circle cx={x} cy={guildY} r="3.5" fill={COLOR_GUILD} stroke="#0f172a" strokeWidth="1.5">
                  <title>{`${p.date} — Guild ${Math.round(p.guildPct)}%`}</title>
                </circle>
                {p.memberPct != null && (
                  <circle cx={x} cy={pctToY(p.memberPct)} r="3.5" fill={COLOR_MEMBER} stroke="#0f172a" strokeWidth="1.5">
                    <title>{`${p.date} — ${memberName || 'Member'} ${Math.round(p.memberPct)}%`}</title>
                  </circle>
                )}
                <text
                  x={x}
                  y={HEIGHT - PAD_BOTTOM + 16}
                  textAnchor="middle"
                  className="fill-slate-500"
                  style={{ fontSize: '8px', fontFamily: 'monospace' }}
                  transform={count > 8 ? `rotate(-35 ${x} ${HEIGHT - PAD_BOTTOM + 16})` : undefined}
                >
                  {p.date}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mt-3 select-none">
        <LegendChip color={COLOR_GUILD} label="Guild Actual" />
        <LegendChip color={COLOR_EXPECTED} label={`Expected ${expectedRate}%`} dashed />
        {hasMember && <LegendChip color={COLOR_MEMBER} label={memberName || 'Member'} />}
      </div>
    </div>
  );
}

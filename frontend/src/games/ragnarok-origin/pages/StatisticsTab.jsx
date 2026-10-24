// frontend/src/pages/StatisticsTab.jsx
import { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../../../services/apiClient';
import { invalidateSettings, useGvgSheet, useSettings } from '../../../query/hooks';
import { MAX_RAID_SCORE } from '../../../utils/attendanceScore';
import AttendanceTrendChart from '../components/AttendanceTrendChart';

const IconTrend = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>;
const IconSearch = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="M21 21l-4.35-4.35"/></svg>;
const IconClose = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M18 6L6 18M6 6l12 12"/></svg>;

const DEFAULT_EXPECTED_RATE = 80;
const MAX_TREND_SESSIONS = 12;

export default function StatisticsTab({ user, embedded = false }) {
  const statsQuery = useGvgSheet({ view: 'stats', limit: MAX_TREND_SESSIONS });
  const settingsQuery = useSettings('expectedAttendanceRate');
  const loading = statsQuery.isLoading && !statsQuery.data;
  const rows = statsQuery.data?.rows || [];
  const dates = statsQuery.data?.dates || [];
  const scores = statsQuery.data?.scores || {};
  const [expectedRate, setExpectedRate] = useState(DEFAULT_EXPECTED_RATE);
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMemberUid, setSelectedMemberUid] = useState(null);

  useEffect(() => {
    if (settingsQuery.data?.expectedAttendanceRate != null) {
      setExpectedRate(parseInt(settingsQuery.data.expectedAttendanceRate, 10) || DEFAULT_EXPECTED_RATE);
    }
  }, [settingsQuery.data]);

  const handleUpdateExpectedRate = async (val) => {
    const clamped = Math.max(0, Math.min(100, parseInt(val, 10) || 0));
    setExpectedRate(clamped);
    try {
      await apiFetch('/api/attendance/update-expected-rate', {
        method: 'POST',
        body: JSON.stringify({ expectedAttendanceRate: clamped }),
      });
      await invalidateSettings();
    } catch (err) {
      console.error('Failed to commit expected attendance rate:', err);
    }
  };

  const trendPoints = useMemo(() => {
    const ordered = dates.slice().sort((a, b) => {
      const dateCmp = String(a.eventDate || '').localeCompare(String(b.eventDate || ''));
      if (dateCmp !== 0) return dateCmp;
      return (a.endedAt || 0) - (b.endedAt || 0);
    });

    return ordered.map((session) => {
      const point = { date: session.eventDate || '—', guildPct: Number(session.guildPct) || 0 };
      if (selectedMemberUid) {
        const map = scores[session.id] || {};
        if (Object.prototype.hasOwnProperty.call(map, selectedMemberUid)) {
          point.memberPct = (Number(map[selectedMemberUid]) / MAX_RAID_SCORE) * 100;
        }
      }
      return point;
    });
  }, [dates, scores, selectedMemberUid]);

  const memberSearchResults = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return [];
    return rows
      .map((row) => ({
        uid: row.uid,
        displayName: row.displayName || row.alias || row.snowflake || row.uid,
        alias: row.alias || '',
      }))
      .filter((row) => `${row.displayName} ${row.alias}`.toLowerCase().includes(q))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
      .slice(0, 8);
  }, [rows, memberSearch]);

  const selectedMember = rows.find((row) => row.uid === selectedMemberUid);
  const selectedMemberName = selectedMember
    ? (selectedMember.displayName || selectedMember.alias || selectedMember.snowflake || 'Member')
    : null;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400 font-medium animate-pulse text-xs font-mono uppercase tracking-widest">
        Compiling Attendance Trend Interfaces...
      </div>
    );
  }

  return (
    <div className={embedded ? 'space-y-4 font-sans' : 'space-y-6 max-w-[98vw] mx-auto p-2 font-sans animate-fadeIn'}>
      {!embedded && (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 shadow-md select-none">
        <h1 className="text-lg font-bold tracking-wider text-slate-200 uppercase">Attendance</h1>
        <p className="text-[11px] font-mono text-slate-500 mt-1">GUILD COMMITMENT TREND AND EXPECTED RATE</p>
      </div>
      )}

      {/* ================= ATTENDANCE TREND ================= */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-2 border-b border-slate-900">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2 select-none">
            <IconTrend /> Attendance Trend
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Member search overlay */}
            <div className="relative">
              {selectedMemberUid ? (
                <div className="flex items-center gap-2 bg-rose-950/30 border border-rose-800/60 rounded-xl pl-3 pr-2 py-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                  <span className="text-[11px] font-sans font-semibold text-slate-200 truncate max-w-[140px]">{selectedMemberName}</span>
                  <button
                    type="button"
                    onClick={() => { setSelectedMemberUid(null); setMemberSearch(''); }}
                    className="text-slate-400 hover:text-rose-300 transition"
                    title="Clear member overlay"
                  >
                    <IconClose />
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Overlay a member..."
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      className="w-52 bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs outline-none focus:border-slate-700 font-sans transition-all"
                    />
                    <div className="absolute left-2.5 top-2.5 text-slate-500"><IconSearch /></div>
                  </div>
                  {memberSearchResults.length > 0 && (
                    <div className="absolute z-20 mt-1 w-52 max-h-56 overflow-y-auto bg-slate-950 border border-slate-800 rounded-xl shadow-xl scrollbar-thin">
                      {memberSearchResults.map((m) => (
                        <button
                          key={m.uid}
                          type="button"
                          onClick={() => { setSelectedMemberUid(m.uid); setMemberSearch(''); }}
                          className="w-full text-left px-3 py-2 text-xs font-sans font-semibold text-slate-300 hover:bg-slate-900 hover:text-white transition truncate"
                        >
                          {m.displayName}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Expected rate control */}
            <div className="flex items-center gap-2 bg-slate-950/50 border border-slate-800 rounded-xl px-3 py-1.5">
              <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-amber-500/90">Expected</span>
              <input
                type="number"
                min="0"
                max="100"
                value={expectedRate}
                disabled={!user?.isOfficer}
                onChange={(e) => handleUpdateExpectedRate(e.target.value)}
                className="w-14 bg-slate-950 border border-slate-800 text-slate-200 rounded-lg px-2 py-1 font-mono font-bold text-center text-xs outline-none focus:border-slate-700 disabled:opacity-60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-[11px] font-mono font-bold text-slate-500">%</span>
            </div>
          </div>
        </div>

        {statsQuery.error ? (
          <div className="rounded-xl border border-rose-900/60 bg-rose-950/30 px-4 py-3 text-[11px] font-mono text-rose-300">
            {statsQuery.error.message || 'The attendance trend could not be loaded.'}
          </div>
        ) : (
          <AttendanceTrendChart points={trendPoints} expectedRate={expectedRate} memberName={selectedMemberName} />
        )}
      </div>
    </div>
  );
}

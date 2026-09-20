// frontend/src/pages/StatisticsTab.jsx
import { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../../../services/apiClient';
import { calculatePoints, MAX_RAID_SCORE } from '../../../utils/attendanceScore';
import AttendanceTrendChart from '../components/AttendanceTrendChart';

const IconTrend = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>;
const IconSearch = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="M21 21l-4.35-4.35"/></svg>;
const IconClose = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M18 6L6 18M6 6l12 12"/></svg>;

const DEFAULT_EXPECTED_RATE = 80;
const MAX_TREND_SESSIONS = 12;

export default function StatisticsTab({ user }) {
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState({});
  const [sessions, setSessions] = useState({});
  const [expectedRate, setExpectedRate] = useState(DEFAULT_EXPECTED_RATE);
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMemberUid, setSelectedMemberUid] = useState(null);

  const loadAnalyticsMetrics = async () => {
    try {
      setLoading(true);
      const initRes = await apiFetch('/api/requests/init', { method: 'GET' });
      const initData = await initRes.json();
      if (initData.success) {
        setMembers(initData.members || {});
        const configRes = await apiFetch('/api/requests/settings/get', { method: 'GET' });
        const configData = await configRes.json();
        if (configData.success && configData.config?.expectedAttendanceRate != null) {
          setExpectedRate(parseInt(configData.config.expectedAttendanceRate, 10) || DEFAULT_EXPECTED_RATE);
        }
      }

      const historyRes = await apiFetch('/api/live-raid/history/all', { method: 'GET' });
      const historyData = await historyRes.json();
      if (historyData.success) {
        setSessions(historyData.sessions || {});
      }
    } catch (err) {
      console.error('Error building dashboard graph metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalyticsMetrics();
  }, [user]);

  const handleUpdateExpectedRate = async (val) => {
    const clamped = Math.max(0, Math.min(100, parseInt(val, 10) || 0));
    setExpectedRate(clamped);
    try {
      await apiFetch('/api/attendance/update-expected-rate', {
        method: 'POST',
        body: JSON.stringify({ expectedAttendanceRate: clamped }),
      });
    } catch (err) {
      console.error('Failed to commit expected attendance rate:', err);
    }
  };

  // Raid-roster members for the guild-wide denominator (true attendance rate).
  const rosterUids = useMemo(
    () => Object.keys(members).filter((uid) => members[uid]?.isRaidRoster === true),
    [members]
  );

  // Last N sessions ascending by eventDate (YYYY-MM-DD), with guild-wide + optional member attendance %.
  const trendPoints = useMemo(() => {
    const ordered = Object.values(sessions)
      .sort((a, b) => {
        // Primary: chronological by eventDate (string compare is correct for YYYY-MM-DD)
        const dateCmp = String(a.eventDate || '').localeCompare(String(b.eventDate || ''));
        if (dateCmp !== 0) return dateCmp;
        // Tiebreak: same-day sessions ordered by when they were archived
        return (a.endedAt || 0) - (b.endedAt || 0);
      })
      .slice(-MAX_TREND_SESSIONS);

    return ordered.map((s) => {
      const totalPulses = s.totalPulses || 0;

      let guildScoreSum = 0;
      rosterUids.forEach((uid) => {
        const ticks = s.userTallies?.[uid] || 0;
        const commitment = s.commitments?.[uid] || 'None';
        const inGameConfirmed = s.inGameStatus?.[uid] === true;
        guildScoreSum += calculatePoints(commitment, ticks, totalPulses, inGameConfirmed).total / MAX_RAID_SCORE;
      });
      const guildPct = rosterUids.length > 0 ? (guildScoreSum / rosterUids.length) * 100 : 0;

      const point = { date: s.eventDate || '—', guildPct };

      if (selectedMemberUid) {
        const mTicks = s.userTallies?.[selectedMemberUid] || 0;
        const mCommitment = s.commitments?.[selectedMemberUid] || 'None';
        const mInGame = s.inGameStatus?.[selectedMemberUid] === true;
        point.memberPct = (calculatePoints(mCommitment, mTicks, totalPulses, mInGame).total / MAX_RAID_SCORE) * 100;
      }

      return point;
    });
  }, [sessions, rosterUids, selectedMemberUid]);

  const memberSearchResults = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return [];
    return Object.entries(members)
      .filter(([_, p]) => p.isRaidRoster === true)
      .map(([uid, p]) => ({ uid, displayName: p.displayName || p.username || uid }))
      .filter((m) => m.displayName.toLowerCase().includes(q))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
      .slice(0, 8);
  }, [members, memberSearch]);

  const selectedMemberName = selectedMemberUid
    ? (members[selectedMemberUid]?.displayName || members[selectedMemberUid]?.username || 'Member')
    : null;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400 font-medium animate-pulse text-xs font-mono uppercase tracking-widest">
        Compiling Attendance Trend Interfaces...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[98vw] mx-auto p-2 font-sans animate-fadeIn">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 shadow-md select-none">
        <h1 className="text-lg font-bold tracking-wider text-slate-200 uppercase">Attendance</h1>
        <p className="text-[11px] font-mono text-slate-500 mt-1">GUILD COMMITMENT TREND AND EXPECTED RATE</p>
      </div>

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

        <AttendanceTrendChart points={trendPoints} expectedRate={expectedRate} memberName={selectedMemberName} />
      </div>
    </div>
  );
}

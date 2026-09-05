// frontend/src/pages/Profile.jsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Minus, Plus, User } from 'lucide-react';
import { apiFetch } from '../services/apiClient';
import MemberTrendSparkline, { buildMemberTrendTimeline } from '../components/MemberTrendSparkline';

export default function Profile({ user }) {
  const { uid: routeUid } = useParams();
  const navigate = useNavigate();
  const isOfficer = user?.isOfficer === true;
  const targetUid = routeUid || user?.id;

  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState(null);
  const [jobsCatalog, setJobsCatalog] = useState({});
  const [rolesCatalog, setRolesCatalog] = useState({});
  const [sessions, setSessions] = useState({});
  const [error, setError] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  const canView = !!targetUid && (String(targetUid) === String(user?.id) || isOfficer);

  const loadProfile = async () => {
    if (!targetUid || !canView) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError('');
      const res = await apiFetch(`/api/attendance/members/${targetUid}/profile`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to load profile.');
        setMember(null);
        return;
      }
      setMember(data.member);
      setJobsCatalog(data.config?.jobs || {});
      setRolesCatalog(data.config?.roles || {});

      const histRes = await apiFetch('/api/live-raid/history/all', { method: 'GET' });
      const histData = await histRes.json();
      if (histData.success) setSessions(histData.sessions || {});
    } catch (err) {
      setError(err.message || 'Failed to load profile.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, [targetUid, user?.id]);

  const timeline = useMemo(
    () => buildMemberTrendTimeline(sessions, targetUid, 8),
    [sessions, targetUid]
  );

  const handleAdjustCredits = async (delta) => {
    if (!isOfficer || !targetUid || adjusting) return;
    setAdjusting(true);
    try {
      const res = await apiFetch(`/api/attendance/members/${targetUid}/leave-credits`, {
        method: 'POST',
        body: JSON.stringify({ delta }),
      });
      const data = await res.json();
      if (data.success) {
        setMember((prev) => ({ ...prev, leaveCreditsRemaining: data.leaveCreditsRemaining }));
      } else {
        alert(data.error || 'Failed to adjust leave credits.');
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setAdjusting(false);
    }
  };

  if (!canView) {
    return <div className="p-6 text-xs text-rose-400 font-mono">You can only view your own profile.</div>;
  }

  if (loading) {
    return <div className="p-6 text-xs font-mono uppercase text-slate-500 animate-pulse">Loading profile…</div>;
  }

  if (error || !member) {
    return <div className="p-6 text-xs text-rose-400 font-mono">{error || 'Member not found.'}</div>;
  }

  const job = jobsCatalog[member.jobCode];
  const role = rolesCatalog[member.roleCode];
  const credits = Number.isInteger(member.leaveCreditsRemaining) ? member.leaveCreditsRemaining : 0;
  const noConfirms = parseInt(member.noConfirmCount, 10) || 0;

  return (
    <div className="max-w-3xl mx-auto space-y-5 font-sans animate-fadeIn p-1">
      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 shadow-md flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center text-indigo-400 shrink-0">
          {job?.iconFile ? (
            <img
              src={`/assets/icons/classes/${job.iconFile}`}
              alt=""
              className="w-7 h-7 object-contain"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ) : (
            <User size={20} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-slate-100 truncate">{member.displayName || 'Raider'}</h1>
          <p className="text-[11px] text-slate-500 font-mono mt-0.5">{targetUid}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-300">
              Job: {job?.name || '—'}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-300">
              Class: {role?.name || '—'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-500">Leave Credits</div>
          <div className="flex items-center justify-between">
            <span className={`text-3xl font-black tabular-nums ${credits <= 0 ? 'text-rose-400' : 'text-slate-100'}`}>{credits}</span>
            {isOfficer && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={adjusting || credits <= 0}
                  onClick={() => handleAdjustCredits(-1)}
                  className="p-2 rounded-xl border border-slate-800 bg-slate-950 text-slate-400 hover:text-rose-400 disabled:opacity-30 cursor-pointer"
                  title="Take 1 credit"
                >
                  <Minus size={14} />
                </button>
                <button
                  type="button"
                  disabled={adjusting}
                  onClick={() => handleAdjustCredits(1)}
                  className="p-2 rounded-xl border border-slate-800 bg-slate-950 text-slate-400 hover:text-emerald-400 disabled:opacity-30 cursor-pointer"
                  title="Give 1 credit"
                >
                  <Plus size={14} />
                </button>
              </div>
            )}
          </div>
          {credits <= 0 && (
            <p className="text-[10px] text-rose-400/90">No credits remaining — Leave is locked until an officer grants more or the monthly reset.</p>
          )}
        </div>
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-500">No Confirm</div>
          <span className={`text-3xl font-black tabular-nums ${noConfirms > 0 ? 'text-amber-400' : 'text-slate-100'}`}>{noConfirms}</span>
          <p className="text-[10px] text-slate-500">Times this member missed Confirm/Leave before the deadline.</p>
        </div>
      </div>

      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5">
        <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-500 mb-3">Attendance graph</div>
        <MemberTrendSparkline timeline={timeline} displayName={member.displayName || 'Raider'} />
      </div>

      {routeUid && String(routeUid) !== String(user?.id) && (
        <button
          type="button"
          onClick={() => navigate('/attendance/profile')}
          className="text-[10px] font-mono uppercase tracking-wider text-slate-500 hover:text-slate-300 cursor-pointer"
        >
          ← Back to my profile
        </button>
      )}
    </div>
  );
}

// frontend/src/pages/StatisticsTab.jsx
import { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../services/apiClient';

const IconLayers = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polygon points="2 17 12 22 22 17"/><polygon points="2 12 12 17 22 12"/></svg>;
const IconSliders = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></svg>;
const IconUsers = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>;

export default function StatisticsTab({ user }) {
  const [loading, setLoading] = useState(true);
  const [jobsCatalog, setJobsCatalog] = useState({});
  const [members, setMembers] = useState({});

  const loadAnalyticsMetrics = async () => {
    try {
      setLoading(true);
      const initRes = await apiFetch('/api/requests/init', { method: 'GET' });
      const initData = await initRes.json();
      if (initData.success) {
        setMembers(initData.members || {});
        const configRes = await apiFetch('/api/requests/settings/get', { method: 'GET' });
        const configData = await configRes.json();
        if (configData.success && configData.config?.jobs) {
          setJobsCatalog(configData.config.jobs);
        }
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

  const handleUpdateDesiredTarget = async (jobCode, val) => {
    const parsedCount = Math.max(0, parseInt(val, 10) || 0);
    setJobsCatalog((prev) => ({
      ...prev,
      [jobCode]: { ...prev[jobCode], desiredCount: parsedCount },
    }));
    try {
      await apiFetch('/api/attendance/update-job-target', {
        method: 'POST',
        body: JSON.stringify({ jobCode, desiredCount: parsedCount }),
      });
    } catch (err) {
      console.error('Failed to commit recruitment goals:', err);
    }
  };

  const jobDistributionTally = {};
  Object.values(members).forEach((m) => {
    if (m.isRaidRoster === true && m.jobCode) {
      jobDistributionTally[m.jobCode] = (jobDistributionTally[m.jobCode] || 0) + 1;
    }
  });

  const membersByJob = useMemo(() => {
    const map = {};
    Object.keys(jobsCatalog).forEach((code) => {
      map[code] = [];
    });
    Object.entries(members).forEach(([uid, m]) => {
      if (m.isRaidRoster !== true || !m.jobCode) return;
      if (!map[m.jobCode]) map[m.jobCode] = [];
      map[m.jobCode].push({
        uid,
        displayName: m.displayName || m.username || uid,
      });
    });
    Object.values(map).forEach((list) => list.sort((a, b) => a.displayName.localeCompare(b.displayName)));
    return map;
  }, [members, jobsCatalog]);

  const totalRaiders = Object.values(jobDistributionTally).reduce((sum, val) => sum + val, 0);
  let accumulatedPercentage = 0;
  const gradientSegments = [];

  Object.entries(jobsCatalog).forEach(([code, jobObj]) => {
    const count = jobDistributionTally[code] || 0;
    if (count > 0 && totalRaiders > 0) {
      const percentage = (count / totalRaiders) * 100;
      const nextPercentage = accumulatedPercentage + percentage;
      const color = jobObj.colorTheme || '#64748b';
      gradientSegments.push(`${color} ${accumulatedPercentage}% ${nextPercentage}%`);
      accumulatedPercentage = nextPercentage;
    }
  });

  const conicGradientString =
    gradientSegments.length > 0
      ? `conic-gradient(${gradientSegments.join(', ')})`
      : 'conic-gradient(#1e293b 0% 100%)';

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400 font-medium animate-pulse text-xs font-mono uppercase tracking-widest">
        Compiling Class Balance and Calendar Interfaces...
      </div>
    );
  }

  const maxMemberRows = Math.max(0, ...Object.values(membersByJob).map((l) => l.length));

  return (
    <div className="space-y-6 max-w-[98vw] mx-auto p-2 font-sans animate-fadeIn">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 shadow-md select-none">
        <h1 className="text-lg font-bold tracking-wider text-slate-200 uppercase">Analytics & Commitment Scheduler</h1>
        <p className="text-[11px] font-mono text-slate-500 mt-1">CLASS DENSITY RATIOS AND ADVANCED LEAVE MANAGEMENT</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start w-full">
        <div className="xl:col-span-8 space-y-6">
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2 select-none pb-2 border-b border-slate-900">
              <IconSliders /> Roster Composition Balancing Workspace
            </div>

            <div className="border border-slate-800 bg-slate-950/40 rounded-xl overflow-hidden overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-mono min-w-[550px]">
                <thead>
                  <tr className="bg-slate-950 text-slate-500 uppercase tracking-wider text-[9px] border-b border-slate-800 select-none">
                    <th className="p-3 pl-4 w-[30%]">Job Class</th>
                    <th className="p-3 text-center w-[20%]">Desired Target</th>
                    <th className="p-3 text-center w-[15%]">Active</th>
                    <th className="p-3 pl-4 w-[35%]">Distribution Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/60 font-sans font-semibold">
                  {Object.keys(jobsCatalog).length > 0 ? (
                    Object.entries(jobsCatalog).map(([code, jobObj]) => {
                      const activeCount = jobDistributionTally[code] || 0;
                      const desiredTarget = jobObj.desiredCount || 0;
                      const isOverCapacity = activeCount > desiredTarget;
                      let fillPercentage = 0;
                      if (desiredTarget > 0) {
                        fillPercentage = Math.min(100, Math.round((activeCount / desiredTarget) * 100));
                      } else if (activeCount > 0) {
                        fillPercentage = 100;
                      }
                      const meterColorToken = isOverCapacity ? 'bg-rose-500' : 'bg-emerald-500';

                      return (
                        <tr key={code} className="hover:bg-slate-900/10 transition-colors">
                          <td className="p-3 pl-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <img
                                src={`/assets/icons/classes/${jobObj.iconFile || 'default.svg'}`}
                                alt=""
                                className="w-4 h-4 object-contain shrink-0"
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                }}
                              />
                              <span className="text-slate-200 font-bold text-xs">{jobObj.name}</span>
                            </div>
                          </td>
                          <td className="p-2 text-center">
                            <input
                              type="number"
                              min="0"
                              value={jobObj.desiredCount ?? 0}
                              disabled={!user?.isOfficer}
                              onChange={(e) => handleUpdateDesiredTarget(code, e.target.value)}
                              className="w-14 bg-slate-950 border border-slate-800 text-slate-200 rounded-lg px-2 py-1 font-mono font-bold text-center text-xs outline-none focus:border-slate-700 disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </td>
                          <td className="p-3 text-center font-mono text-slate-400 font-bold text-xs select-none">{activeCount}</td>
                          <td className="p-3 pr-4 select-none">
                            <div className="w-full bg-slate-800 rounded-lg h-4 relative overflow-hidden border border-slate-900/60 shadow-inner">
                              <div className={`h-full transition-all duration-500 ease-out ${meterColorToken}`} style={{ width: `${fillPercentage}%` }} />
                              <div className="absolute inset-0 flex pointer-events-none">
                                {Array.from({ length: 9 }).map((_, lineIdx) => (
                                  <div key={lineIdx} className="h-full border-r border-slate-950/25" style={{ width: '10%' }} />
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="4" className="text-center py-12 text-[11px] text-slate-500 font-mono italic">
                        No custom specializations defined inside SettingsTab catalogs.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2 select-none pb-2 border-b border-slate-900">
              <IconUsers /> Roster by Job Class
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[480px]">
                <thead>
                  <tr className="border-b border-slate-800">
                    {Object.entries(jobsCatalog).map(([code, jobObj]) => (
                      <th key={code} className="p-2 px-3 align-bottom">
                        <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                          <img
                            src={`/assets/icons/classes/${jobObj.iconFile || 'default.svg'}`}
                            alt=""
                            className="w-3.5 h-3.5 object-contain"
                            onError={(e) => {
                              e.target.style.display = 'none';
                            }}
                          />
                          <span className="truncate">{jobObj.name}</span>
                          <span className="text-slate-600 font-normal">({membersByJob[code]?.length || 0})</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {maxMemberRows === 0 ? (
                    <tr>
                      <td
                        colSpan={Math.max(1, Object.keys(jobsCatalog).length)}
                        className="text-center py-8 text-[11px] text-slate-600 font-mono italic"
                      >
                        No raid-roster members assigned to job classes yet.
                      </td>
                    </tr>
                  ) : (
                    Array.from({ length: maxMemberRows }).map((_, rowIdx) => (
                      <tr key={rowIdx} className="border-b border-slate-900/50">
                        {Object.keys(jobsCatalog).map((code) => {
                          const member = membersByJob[code]?.[rowIdx];
                          return (
                            <td key={code} className="p-1.5 px-3 align-top">
                              {member ? (
                                <span className="inline-block text-[11px] font-sans font-semibold text-slate-300 bg-slate-950/60 border border-slate-800/80 rounded-lg px-2 py-1 truncate max-w-full">
                                  {member.displayName}
                                </span>
                              ) : (
                                <span className="text-slate-800 text-[10px]">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="xl:col-span-4 bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-5 shadow-xl flex flex-col items-center">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2 select-none pb-2 border-b border-slate-900 w-full">
            <IconLayers /> Class Density Breakdown
          </div>
          <div
            className="w-40 h-40 rounded-full relative flex items-center justify-center shadow-lg transition-transform duration-300 hover:scale-[1.02]"
            style={{ background: conicGradientString }}
          >
            <div className="w-28 h-28 bg-slate-950 rounded-full flex flex-col items-center justify-center border border-slate-900 shadow-inner select-none">
              <span className="text-2xl font-black text-slate-100 tracking-tight">{totalRaiders}</span>
              <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest mt-0.5">Raiders</span>
            </div>
          </div>
          <div className="w-full grid grid-cols-2 gap-2 pt-2">
            {Object.entries(jobsCatalog).map(([code, jobObj]) => {
              const activeCount = jobDistributionTally[code] || 0;
              if (activeCount === 0) return null;
              const ratioPercent = totalRaiders > 0 ? Math.round((activeCount / totalRaiders) * 100) : 0;
              return (
                <div key={code} className="flex items-center justify-between bg-slate-950/40 border border-slate-900/50 p-2 rounded-xl text-[11px] font-mono shadow-sm">
                  <div className="flex items-center gap-2 truncate pr-1">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: jobObj.colorTheme }} />
                    <span className="text-slate-300 font-sans font-semibold truncate">{jobObj.name}</span>
                  </div>
                  <span className="text-slate-400 font-bold shrink-0">{ratioPercent}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

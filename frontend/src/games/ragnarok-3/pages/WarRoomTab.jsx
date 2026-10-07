import { Radio, Timer } from 'lucide-react';
import PublishedPartyGrid from '../components/PublishedPartyGrid';
import { apiFetch } from '../../../services/apiClient';
import { queryClient } from '../../../query/client';
import { queryKeys, useMembers, useWarRoomInit } from '../query.js';

function phaseDotClass(currentPhase, n) {
  if (currentPhase === n) {
    return 'bg-emerald-950 border-2 border-emerald-500 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.5)] animate-pulse';
  }
  if (currentPhase > n) return 'bg-slate-900 border-2 border-slate-700 text-slate-500';
  return 'bg-slate-950 border border-slate-800 text-slate-600';
}

export default function WarRoomTab({ user }) {
  const isOfficer = user?.isOfficer === true;
  const initQuery = useWarRoomInit();
  const membersQuery = useMembers('card');
  const data = initQuery.data;
  const loading = (initQuery.isLoading && !data) || (membersQuery.isLoading && !membersQuery.data);
  const error = initQuery.error?.message || '';
  const cycle = data?.cycle || null;
  const published = data?.published || null;
  const session = data?.session || null;
  const members = membersQuery.data || {};
  const jobs = data?.jobs || {};
  const commitments = data?.commitments || {};
  const liveVoiceUids = [];

  const persistLiveGrids = async (grids) => {
    const res = await apiFetch('/api/ragnarok-3/live-raid/update', {
      method: 'POST',
      body: JSON.stringify({ session: { grids } }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to save live party.');
    queryClient.setQueryData(queryKeys.warRoomInit(), (prev) => (
      prev ? { ...prev, session: prev.session ? { ...prev.session, grids } : prev.session } : prev
    ));
  };

  const gridSource = session?.grids
    ? {
      id: session.publishedId || published?.id || 'live',
      grids: session.grids,
      selectedGridIds: session.selectedConfigIds || Object.keys(session.grids),
      eventTitle: session.eventTitle || cycle?.activeEventTitle,
      eventDate: session.eventDate || cycle?.warDate,
      eventKey: session.eventKey || cycle?.activeEventId,
      configTitle: cycle?.configTitle,
      lastUpdated: session.startedAt,
    }
    : published;

  const canEdit = Boolean(cycle?.canEditGrid);
  const currentPhase = cycle?.currentPhase ?? 0;
  const PHASE_LABELS = {
    1: cycle?.phaseLabels?.[1] || 'GvG Preparation',
    2: cycle?.phaseLabels?.[2] || 'Party Adjustments',
    3: cycle?.phaseLabels?.[3] || 'War',
  };

  const eventCycleCard = (
    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 shadow-md space-y-3.5 h-[17.5rem] overflow-y-auto">
      <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Event Cycle</div>
      {cycle?.needsSetup ? (
        <p className="text-[11px] text-slate-500 font-mono italic">No raid-enabled event. Select a Raid Party config in Settings → Events.</p>
      ) : (
        <div className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-4 relative space-y-4">
          <div className="absolute left-[23px] top-6 bottom-6 w-0.5 bg-slate-800 z-0" />
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex items-center gap-4 relative z-10 font-mono text-[11px]">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center font-sans font-bold shrink-0 text-[10px] border ${phaseDotClass(currentPhase, n)}`}>
                {n}
              </div>
              <div className="flex flex-col truncate">
                <span className={`font-sans font-semibold text-xs ${currentPhase === n ? 'text-emerald-400' : 'text-slate-400'}`}>{PHASE_LABELS[n]}</span>
                <span className="text-[10px] text-slate-500 font-mono mt-0.5 tracking-tight truncate">
                  {cycle?.phaseIntervals?.[`phase${n}`] || 'Unconfigured'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const occurrenceCard = (
    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 space-y-3 h-[17.5rem] overflow-y-auto">
      <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Occurrence</div>
      <dl className="grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <dt className="text-slate-500 uppercase text-[9px] font-bold tracking-wider">Date</dt>
          <dd className="font-mono text-slate-200">{cycle?.warDate || '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500 uppercase text-[9px] font-bold tracking-wider">Raid config</dt>
          <dd className="font-mono text-amber-400 truncate">{cycle?.configTitle || cycle?.configId || '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500 uppercase text-[9px] font-bold tracking-wider">War start</dt>
          <dd className="font-mono text-emerald-400">{cycle?.warStartTime || '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500 uppercase text-[9px] font-bold tracking-wider">War end</dt>
          <dd className="font-mono text-emerald-400">{cycle?.warEndTime || '—'}</dd>
        </div>
      </dl>
    </div>
  );

  const emptyRosterPanel = (
    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 h-[17.5rem] overflow-hidden">
      <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Roster Registries</p>
      <p className="text-[11px] text-slate-600 italic mt-3">Roster appears when a raid composition is published.</p>
    </div>
  );

  const renderTopRow = (rosterPanel) => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
      {eventCycleCard}
      {occurrenceCard}
      {rosterPanel}
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-xs font-mono text-slate-500 uppercase tracking-widest">
        Loading War Room…
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-lg font-black text-slate-100 uppercase tracking-wide">War Room</h1>
          {cycle?.currentSessionLabel && (
            <p className="text-xs text-slate-400">{cycle.currentSessionLabel}</p>
          )}
          {cycle?.nextStatusChangeMessage && (
            <div className="flex items-center gap-2 bg-emerald-950/20 border border-emerald-500/20 text-emerald-400 text-xs px-3.5 py-2 rounded-xl font-semibold">
              {cycle.nextStatusChangeMessage}
            </div>
          )}
          {error && (
            <div className="text-xs text-rose-400">{error}</div>
          )}
        </div>
        {session && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 h-[42px] px-3 rounded-xl border border-slate-700/80 bg-slate-950/80 text-slate-200">
              <Radio size={12} className="text-emerald-400 animate-pulse shrink-0" />
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest">Live</span>
            </div>
            <div className="flex items-center gap-2 h-[42px] px-3 rounded-xl border border-slate-700/80 bg-slate-950/80 text-[11px] font-mono font-bold text-slate-300">
              <Timer size={12} />
              {session.pollIntervalMinutes || cycle?.pollIntervalMinutes || 20}m poll
            </div>
          </div>
        )}
      </div>

      {gridSource?.grids && Object.keys(gridSource.grids).length > 0 ? (
        <PublishedPartyGrid
          published={gridSource}
          members={members}
          jobsCatalog={jobs}
          commitments={commitments}
          isOfficer={isOfficer}
          readOnly={!canEdit}
          liveVoiceUids={session ? liveVoiceUids : []}
          persistFn={session ? persistLiveGrids : null}
          onPublishedChange={(next) => queryClient.setQueryData(queryKeys.warRoomInit(), (prev) => (prev ? { ...prev, published: next } : prev))}
          topRow={renderTopRow}
        />
      ) : (
        <div className="space-y-6">
          {renderTopRow(emptyRosterPanel)}
          <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/20 px-6 py-16 text-center">
            <p className="text-xs text-slate-400">
              {cycle?.needsSetup
                ? 'Assign a Raid Party config in Settings → Events to enable War Room.'
                : currentPhase === 0
                  ? 'Waiting for GvG Preparation. The party grid will appear automatically.'
                  : 'Publish a party grid from Raid Config to open this War Room.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

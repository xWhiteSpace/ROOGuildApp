// frontend/src/pages/MasterListTab.jsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../../services/apiClient';
import RosterInsightsPanels from '../components/RosterInsightsPanels';

const IconUser = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M12 7a4 4 0 100-8 4 4 0 000 8z" /></svg>;
const IconShield = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
const IconTrash = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" /></svg>;
const IconSync = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H17" /></svg>;
const IconX = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>;
const IconSave = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2v-9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>;
const IconPlus = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>;
const IconEdit = () => <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>;
const IconChevronLeft = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>;
const IconChevronRight = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>;

const ROSTER_CAP = 200;
const ROSTER_SLIDES = [
  { id: 'roster', title: 'True Guild Roster' },
  { id: 'balancing', title: 'Composition Balancing' },
  { id: 'density', title: 'Class Density' },
  { id: 'byJob', title: 'Roster by Job Class' },
];
const VANISH_REQUEST_CHUNK = 500;

function chunkUids(uids, size) {
  const chunks = [];
  for (let i = 0; i < uids.length; i += size) chunks.push(uids.slice(i, i + size));
  return chunks;
}

function PoolSelectCheckbox({ checked, onChange }) {
  return (
    <label
      data-pool-select
      className="relative z-10 shrink-0 mt-0.5 cursor-pointer before:absolute before:content-[''] before:-inset-3.5 before:z-[1]"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        draggable={false}
        className="relative z-[1] h-3.5 w-3.5 rounded border-slate-600 bg-slate-950 accent-indigo-500 cursor-pointer pointer-events-none"
      />
    </label>
  );
}

function handlePoolCardDragStart(e, uid) {
  if (e.target.closest('[data-pool-select]')) {
    e.preventDefault();
    return;
  }
  e.dataTransfer.setData('text/plain', uid);
}

export default function MasterListTab({ user }) {
  const [loading, setLoading] = useState(true);
  const [dbMembers, setDbMembers] = useState({});
  const [stagedMembers, setStagedMembers] = useState({});
  const [jobsCatalog, setJobsCatalog] = useState({});
  const [rolesCatalog, setRolesCatalog] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [sortKey, setSortKey] = useState('name'); 
  const [sortOrder, setSortOrder] = useState('asc'); 

  const [selectedUids, setSelectedUids] = useState(() => new Set());
  const [vanishTargets, setVanishTargets] = useState(null);
  const [confirmKeyword, setConfirmKeyword] = useState('');
  const [vanishing, setVanishing] = useState(false);

  const emptyDummyDraft = { displayName: '', jobCode: '', roleCode: '', groupTag: '', joinedAt: new Date().toISOString().slice(0, 10) };
  const [showCreateDummy, setShowCreateDummy] = useState(false);
  const [dummyDraft, setDummyDraft] = useState(emptyDummyDraft);
  const [creatingDummy, setCreatingDummy] = useState(false);
  const [editingNameUid, setEditingNameUid] = useState(null);
  const [slideIndex, setSlideIndex] = useState(0);

  const loadRosterDirectory = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);

      const res = await apiFetch('/api/requests/init', { method: 'GET' });
      const data = await res.json();
      if (data.success) {
        const members = data.members || {};
        setDbMembers(members);
        setStagedMembers(JSON.parse(JSON.stringify(members)));
        setSelectedUids((prev) => {
          const next = new Set();
          prev.forEach((uid) => {
            if (members[uid] && members[uid].isRaidRoster !== true) next.add(uid);
          });
          return next;
        });
        
        const configRes = await apiFetch('/api/requests/settings/get', { method: 'GET' });
        const configData = await configRes.json();
        if (configData.success) {
          setJobsCatalog(configData.config?.jobs || {});
          setRolesCatalog(configData.config?.roles || {});
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRosterDirectory();
  }, [user]);

  const goPrevSlide = () => setSlideIndex((i) => (i - 1 + ROSTER_SLIDES.length) % ROSTER_SLIDES.length);
  const goNextSlide = () => setSlideIndex((i) => (i + 1) % ROSTER_SLIDES.length);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      if (e.key === 'ArrowLeft') goPrevSlide();
      else goNextSlide();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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

  const handleSyncDiscordRoster = async () => {
    try {
      setSyncing(true);
      await apiFetch('/api/requests/sync-roster', { method: 'POST' });
      await loadRosterDirectory(true);
    } catch (err) {
      console.error(err);
    } finally {
      setSyncing(false);
    }
  };

  const handleStageLocalUpdate = (uid, field, value) => {
    setStagedMembers(prev => {
      const updated = { ...prev };
      if (updated[uid]) {
        updated[uid] = { ...updated[uid], [field]: value };
      }
      return updated;
    });
  };

  const handleSaveRosterProgress = async () => {
    try {
      setSaving(true);
      const res = await apiFetch('/api/attendance/roster/save-batch', {
        method: 'POST',
        body: JSON.stringify({ stagedMembers }),
      });
      const data = await res.json();
      if (data.success) {
        alert('💾 SUCCESS: Master list parameters synchronized completely.');
        await loadRosterDirectory(false);
      } else {
        alert(data.error || 'Failed to sync roster updates.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateDummy = async () => {
    if (!dummyDraft.displayName.trim()) return;
    try {
      setCreatingDummy(true);
      const res = await apiFetch('/api/attendance/dummy/create', {
        method: 'POST',
        body: JSON.stringify(dummyDraft),
      });
      const data = await res.json();
      if (data.success) {
        setShowCreateDummy(false);
        setDummyDraft(emptyDummyDraft);
        await loadRosterDirectory(false);
      } else {
        alert(data.error || 'Failed to create dummy member.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingDummy(false);
    }
  };

  const handleToggleSelect = (uid) => {
    setSelectedUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const handleToggleVisibleSelection = (list) => {
    const uids = list.map(([uid]) => uid);
    setSelectedUids((prev) => {
      const allSelected = uids.length > 0 && uids.every((uid) => prev.has(uid));
      const next = new Set(prev);
      if (allSelected) uids.forEach((uid) => next.delete(uid));
      else uids.forEach((uid) => next.add(uid));
      return next;
    });
  };

  const handleClearSelection = () => setSelectedUids(new Set());

  const stageMembersOntoRoster = (uids, { clamp = false } = {}) => {
    const remaining = ROSTER_CAP - Object.values(stagedMembers).filter((m) => m.isRaidRoster === true).length;
    let accepted = uids.filter((uid) => stagedMembers[uid] && stagedMembers[uid].isRaidRoster !== true);
    let skipped = 0;
    if (clamp) {
      skipped = Math.max(0, accepted.length - Math.max(0, remaining));
      accepted = accepted.slice(0, Math.max(0, remaining));
    }
    if (accepted.length === 0) {
      if (clamp && (skipped > 0 || remaining <= 0)) {
        alert(`Roster is at cap (${ROSTER_CAP}). No members were added.`);
      }
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    setStagedMembers((prev) => {
      const updated = { ...prev };
      accepted.forEach((uid) => {
        if (!updated[uid]) return;
        updated[uid] = {
          ...updated[uid],
          isRaidRoster: true,
          joinedAt: updated[uid].joinedAt || today,
        };
      });
      return updated;
    });
    setSelectedUids((prev) => {
      const next = new Set(prev);
      accepted.forEach((uid) => next.delete(uid));
      return next;
    });
    if (skipped > 0) {
      alert(`Roster cap is ${ROSTER_CAP}. Added ${accepted.length}; ${skipped} skipped.`);
    }
  };

  const handleBulkAddSelected = () => {
    stageMembersOntoRoster([...selectedUids], { clamp: true });
  };

  const handleOpenVanish = (uids) => {
    const unique = [...new Set(uids.filter(Boolean))];
    if (unique.length === 0) return;
    setConfirmKeyword('');
    setVanishTargets(unique);
  };

  const handleExecuteVanish = async () => {
    if (confirmKeyword !== 'YES' || !vanishTargets?.length || vanishing) return;
    try {
      setVanishing(true);
      const chunks = chunkUids(vanishTargets, VANISH_REQUEST_CHUNK);
      const allVanished = [];
      const allFailed = [];
      for (const chunk of chunks) {
        const res = await apiFetch('/api/attendance/vanish', {
          method: 'POST',
          body: JSON.stringify({
            targetUid: chunk[0],
            targetUids: chunk,
          }),
        });
        const data = await res.json();
        if (!data.success) {
          allFailed.push(...chunk.map((uid) => ({ uid, error: data.error || 'Vanish failed.' })));
          continue;
        }
        allVanished.push(...(Array.isArray(data.vanished) ? data.vanished : chunk));
        if (Array.isArray(data.failed)) allFailed.push(...data.failed);
      }
      if (allVanished.length === 0) {
        alert(allFailed[0]?.error || 'Vanish failed.');
        return;
      }
      if (allFailed.length > 0) {
        alert(`Vanished ${allVanished.length}. Failed: ${allFailed.map((entry) => entry.uid).join(', ')}`);
      }
      setVanishTargets(null);
      setConfirmKeyword('');
      await loadRosterDirectory();
    } catch (err) {
      console.error(err);
      alert('Vanish failed.');
    } finally {
      setVanishing(false);
    }
  };

  const activeRaidRosterList = Object.entries(stagedMembers).filter(([_, m]) => m.isRaidRoster === true);

  activeRaidRosterList.sort((a, b) => {
    const nameA = (a[1].displayName || '').toLowerCase();
    const nameB = (b[1].displayName || '').toLowerCase();
    if (sortKey === 'name') {
      return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
    }
    return 0;
  });

  const identityPoolList = Object.entries(stagedMembers).filter(([_, m]) => 
    !m.isRaidRoster && !m.isDummy && (
      (m.displayName || '').toLowerCase().includes(searchQuery.toLowerCase())
      || (m.inGameName || '').toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const dummyPoolList = Object.entries(stagedMembers).filter(([_, m]) => 
    m.isDummy && !m.isRaidRoster && (
      (m.displayName || '').toLowerCase().includes(searchQuery.toLowerCase())
      || (m.inGameName || '').toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const selectedCount = selectedUids.size;
  const remainingRosterSlots = Math.max(0, ROSTER_CAP - activeRaidRosterList.length);
  const feederAllSelected = identityPoolList.length > 0 && identityPoolList.every(([uid]) => selectedUids.has(uid));
  const dummyAllSelected = dummyPoolList.length > 0 && dummyPoolList.every(([uid]) => selectedUids.has(uid));
  const vanishCount = vanishTargets?.length || 0;
  const vanishAllDummy = vanishCount > 0 && vanishTargets.every((uid) => uid.startsWith('dummy_'));

  const isDirty = JSON.stringify(dbMembers) !== JSON.stringify(stagedMembers);
  const stagingRowsCount = Math.min(ROSTER_CAP, Math.max(100, activeRaidRosterList.length + 5));
  const activeSlide = ROSTER_SLIDES[slideIndex];
  const carouselTitle = activeSlide.id === 'roster'
    ? `True Guild Roster (${activeRaidRosterList.length} Active / Cap ${ROSTER_CAP})`
    : activeSlide.title;

  if (loading) {
    return <div className="p-6 text-xs font-mono uppercase text-slate-500 animate-pulse">Syncing Split-State Datasets...</div>;
  }

  return (
    <div className="max-w-[98vw] mx-auto p-1 font-sans animate-fadeIn pb-24 space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] items-center gap-3 select-none">
        <div className="hidden lg:block" />
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={goPrevSlide}
              className="shrink-0 p-1.5 rounded-xl border border-slate-800 bg-slate-950 text-slate-400 hover:text-white hover:border-slate-600 transition cursor-pointer"
              aria-label="Previous view"
            >
              <IconChevronLeft />
            </button>
            <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider text-center whitespace-nowrap px-2">
              {carouselTitle}
            </h2>
            <button
              type="button"
              onClick={goNextSlide}
              className="shrink-0 p-1.5 rounded-xl border border-slate-800 bg-slate-950 text-slate-400 hover:text-white hover:border-slate-600 transition cursor-pointer"
              aria-label="Next view"
            >
              <IconChevronRight />
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            {ROSTER_SLIDES.map((slide, idx) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => setSlideIndex(idx)}
                className={`h-1.5 rounded-full transition-all cursor-pointer ${
                  idx === slideIndex ? 'w-5 bg-indigo-500' : 'w-1.5 bg-slate-700 hover:bg-slate-500'
                }`}
                aria-label={slide.title}
              />
            ))}
          </div>
        </div>
        <div className="flex justify-center lg:justify-end">
          {activeSlide.id === 'roster' && (
            <input
              type="text"
              placeholder="Search members (roster + pool)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-64 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1 text-[11px] text-slate-200 outline-none focus:border-slate-700 font-sans transition"
            />
          )}
        </div>
      </div>

      {activeSlide.id === 'roster' ? (
      <div className="grid grid-cols-12 gap-5">
      
      {/* MASTER ACTIVE DIRECTORY PANEL */}
      <div className="col-span-12 lg:col-span-9 space-y-4">

        <div className="border border-slate-800 bg-slate-950/40 rounded-2xl overflow-x-auto h-[36rem] overflow-y-auto scrollbar-thin">
          <table className="w-full text-left border-collapse text-xs font-mono table-fixed min-w-[1100px]">
            <thead className="sticky top-0 z-20">
              <tr className="bg-slate-950 text-slate-500 uppercase tracking-wider text-[9px] border-b border-slate-800 select-none shadow-md">
                <th 
                  onClick={() => {
                    const nextOrder = sortKey === 'name' && sortOrder === 'asc' ? 'desc' : 'asc';
                    setSortOrder(nextOrder);
                    setSortKey('name');
                  }}
                  className="p-3 pl-5 w-[16%] cursor-pointer hover:text-white transition-colors bg-slate-950"
                >
                  Member Name <span className="text-indigo-400 ml-1 font-sans text-xs">{sortKey === 'name' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}</span>
                </th>
                <th className="p-3 w-[14%] bg-slate-950" title="Latin IGN / OCR leftover. Comma-separated, e.g. Akeno, Akeno愛">
                  In-game / alias
                </th>
                <th className="p-3 w-[14%] bg-slate-950">Job Class</th>
                <th className="p-3 w-[15%] bg-slate-950">Role Classification</th>
                <th className="p-3 w-[13%] bg-slate-950">Group Assignment</th>
                <th className="p-3 w-[16%] bg-slate-950">Date Joined</th>
                <th className="p-3 w-[14%] bg-slate-950">SnowflakeID</th>
                <th className="p-3 w-[8%] bg-slate-950 text-center">Credits</th>
                <th className="p-3 text-center w-[6%] bg-slate-950">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/60">
              {Array.from({ length: stagingRowsCount }).map((_, idx) => {
                const entry = activeRaidRosterList[idx];
                
                if (!entry) {
                  return (
                    <tr 
                      key={`vacant-${idx}`}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const droppedUid = e.dataTransfer.getData("text/plain");
                        const inheritedDate = stagedMembers[droppedUid]?.joinedAt || new Date().toISOString().slice(0, 10);
                        if (droppedUid) {
                          handleStageLocalUpdate(droppedUid, 'isRaidRoster', true);
                          handleStageLocalUpdate(droppedUid, 'joinedAt', inheritedDate);
                        }
                      }}
                      className="border-b border-slate-900/20 bg-slate-950/5 border-dashed transition-colors hover:bg-slate-900/5 select-none"
                    >
                      <td colSpan="9" className="p-3 text-center text-[10px] text-slate-700 italic font-sans font-medium border border-dashed border-slate-900/30 m-1 rounded-xl">
                        + Drop identity card here to allocate position slot #{idx + 1}
                      </td>
                    </tr>
                  );
                }

                const [uid, m] = entry;
                const isFoundMatch = searchQuery.trim() && (
                  (m.displayName || '').toLowerCase().includes(searchQuery.toLowerCase())
                  || (m.inGameName || '').toLowerCase().includes(searchQuery.toLowerCase())
                );
                const isGhost = m.status === 'Ghost';

                return (
                  <tr key={uid} className={`hover:bg-slate-900/10 transition-colors group ${isFoundMatch ? 'bg-amber-500/10' : ''} ${isGhost ? 'bg-rose-950/5 text-slate-400' : ''}`}>
                    <td className="p-3 pl-5 font-sans font-bold truncate">
                      <div className="flex items-center gap-2">
                        {m.isDummy && editingNameUid === uid ? (
                          <input
                            type="text"
                            autoFocus
                            value={m.displayName || ''}
                            disabled={!user?.isOfficer}
                            onChange={(e) => handleStageLocalUpdate(uid, 'displayName', e.target.value)}
                            onBlur={() => setEditingNameUid(null)}
                            onKeyDown={(e) => { if (e.key === 'Enter') setEditingNameUid(null); }}
                            className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-0.5 text-xs font-sans font-bold text-slate-100 outline-none focus:border-indigo-600 w-full"
                          />
                        ) : (
                          <Link
                            to={`/attendance/profile/${uid}`}
                            className={`${isFoundMatch ? 'bg-amber-400/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30 shadow-sm' : 'text-slate-200 hover:text-indigo-300'} transition`}
                          >
                            {m.displayName}
                          </Link>
                        )}
                        {m.isDummy && (
                          <>
                            {user?.isOfficer && editingNameUid !== uid && (
                              <button
                                type="button"
                                onClick={() => setEditingNameUid(uid)}
                                className="text-slate-600 hover:text-indigo-400 transition cursor-pointer shrink-0"
                                title="Edit name"
                              >
                                <IconEdit />
                              </button>
                            )}
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[8px] font-mono uppercase font-black tracking-wide shrink-0">
                              [Dummy]
                            </span>
                          </>
                        )}
                        {isGhost && (
                          <span className="px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[8px] font-mono uppercase font-black tracking-wide">
                            [Ghost]
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <input
                        type="text"
                        value={m.inGameName || ''}
                        disabled={!user?.isOfficer}
                        maxLength={100}
                        placeholder="Akeno, Akeno愛"
                        title="Latin IGN / OCR leftover. Comma-separated aliases."
                        onChange={(e) => handleStageLocalUpdate(uid, 'inGameName', e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-2.5 py-1 text-xs font-sans outline-none focus:border-slate-700 font-medium placeholder-slate-600/60"
                      />
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <img
                          src={`/assets/icons/classes/${jobsCatalog[m.jobCode]?.iconFile || 'default.svg'}`}
                          alt=""
                          className="w-5 h-5 object-contain shrink-0 opacity-90"
                          onError={(e) => { e.target.src = '/assets/icons/classes/default.svg'; }}
                        />
                        <select 
                          value={m.jobCode || ''} 
                          disabled={!user?.isOfficer}
                          onChange={(e) => handleStageLocalUpdate(uid, 'jobCode', e.target.value)}
                          className="bg-slate-950 border border-slate-800 rounded-xl px-2 py-1 text-xs font-sans outline-none w-full font-bold cursor-pointer transition-colors text-slate-200"
                        >
                          <option value="" className="bg-slate-950 text-slate-400 font-sans">Select Job...</option>
                          {Object.entries(jobsCatalog).map(([code, j]) => (
                            <option key={code} value={code} className="bg-slate-950 font-sans font-semibold text-slate-200">
                              {j.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>

                    <td className="p-3">
                      <select
                        value={m.roleCode || ''}
                        disabled={!user?.isOfficer}
                        onChange={(e) => handleStageLocalUpdate(uid, 'roleCode', e.target.value)}
                        className="bg-slate-950 border border-slate-800 rounded-xl px-2 py-1 text-xs font-sans outline-none w-full text-indigo-400 font-bold border-indigo-900/30 cursor-pointer"
                      >
                        <option value="" className="text-slate-500 bg-slate-950">Select Role...</option>
                        {Object.entries(rolesCatalog).map(([code, r]) => (
                          <option key={code} value={code} className="text-indigo-300 bg-slate-950 font-semibold">{r.name}</option>
                        ))}
                      </select>
                    </td>

                    <td className="p-3">
                      <input 
                        type="text"
                        value={m.groupTag || ''}
                        disabled={!user?.isOfficer}
                        placeholder="e.g. Team A"
                        onChange={(e) => handleStageLocalUpdate(uid, 'groupTag', e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-2.5 py-1 text-xs font-sans outline-none focus:border-slate-700 font-medium placeholder-slate-600/60"
                      />
                    </td>

                    <td className="p-3">
                      <input 
                        type="date" 
                        value={m.joinedAt || ''} 
                        disabled={!user?.isOfficer}
                        onChange={(e) => handleStageLocalUpdate(uid, 'joinedAt', e.target.value)}
                        className="bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-2 py-1 text-center font-sans text-xs outline-none focus:border-slate-700 w-full cursor-pointer"
                      />
                    </td>

                    <td className="p-3 text-slate-500 tracking-tight text-[10px] select-all">{uid}</td>
                    <td className={`p-3 text-center font-mono text-xs font-bold tabular-nums ${(m.leaveCreditsRemaining ?? 0) <= 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                      {Number.isInteger(m.leaveCreditsRemaining) ? m.leaveCreditsRemaining : '—'}
                    </td>
                    <td className="p-3 text-center">
                      {user?.isOfficer && (
                        <button 
                          onClick={() => handleStageLocalUpdate(uid, 'isRaidRoster', false)}
                          className="text-slate-600 hover:text-rose-400 transition cursor-pointer"
                        >
                          <IconTrash />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* DISCORD DISCOVERY POOL DRAWER + DUMMY ROSTER (RIGHT RAIL) */}
      <div className="col-span-12 lg:col-span-3 flex flex-col gap-4">
        {user?.isOfficer && selectedCount > 0 && (
          <div className="shrink-0 bg-indigo-950/20 border border-indigo-500/30 p-3 rounded-2xl shadow-md flex flex-col gap-2 select-none">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">{selectedCount} selected</span>
              <button
                type="button"
                onClick={handleClearSelection}
                className="px-2 py-0.5 text-[9px] uppercase font-bold tracking-wider border border-slate-700 bg-slate-950 text-slate-400 hover:text-white rounded-lg cursor-pointer transition"
              >
                Clear
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleBulkAddSelected}
                disabled={remainingRosterSlots <= 0}
                className="flex-1 px-2 py-1.5 bg-indigo-950/40 border border-indigo-500/30 hover:bg-indigo-600 disabled:opacity-20 disabled:hover:bg-indigo-950/40 text-[10px] font-bold uppercase tracking-wider text-indigo-300 hover:text-white rounded-lg cursor-pointer transition-colors"
              >
                Add {selectedCount}
              </button>
              <button
                type="button"
                onClick={() => handleOpenVanish([...selectedUids])}
                className="flex-1 px-2 py-1.5 bg-rose-950/40 border border-rose-500/30 hover:bg-rose-600 text-[10px] font-bold uppercase tracking-wider text-rose-300 hover:text-white rounded-lg cursor-pointer transition-colors"
              >
                Vanish {selectedCount}
              </button>
            </div>
          </div>
        )}

        <div className="shrink-0 bg-slate-900/40 border border-slate-800 p-4 rounded-2xl shadow-md space-y-2 select-none">
          <div className="flex justify-between items-center gap-2">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 min-w-0"><IconUser /> <span className="truncate">Discord Feeder Pool</span></h2>
            <button 
              onClick={handleSyncDiscordRoster}
              disabled={syncing || !user?.isOfficer}
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 text-[10px] uppercase font-bold tracking-wide border border-indigo-500/30 bg-indigo-950/20 text-indigo-400 hover:bg-indigo-600 hover:text-white transition rounded-xl shadow-sm cursor-pointer disabled:opacity-20"
            >
              <IconSync /> {syncing ? 'Syncing...' : 'Sync'}
            </button>
          </div>
          {user?.isOfficer && identityPoolList.length > 0 && (
            <button
              type="button"
              onClick={() => handleToggleVisibleSelection(identityPoolList)}
              className="px-2 py-1 text-[10px] uppercase font-bold tracking-wide border border-slate-700 bg-slate-950 text-slate-400 hover:text-white transition rounded-xl cursor-pointer"
            >
              {feederAllSelected ? 'Deselect visible' : 'Select all visible'}
            </button>
          )}
        </div>

        <div className="shrink-0 border border-slate-800 bg-slate-950/40 rounded-2xl p-3 h-[22rem] overflow-y-auto scrollbar-thin space-y-2">
          {identityPoolList.map(([uid, m]) => {
            const isSelected = selectedUids.has(uid);
            return (
            <div 
              key={uid}
              draggable={user?.isOfficer}
              onDragStart={(e) => handlePoolCardDragStart(e, uid)}
              className={`p-3 rounded-xl border text-xs font-mono shadow-sm flex flex-col space-y-1 relative group cursor-grab active:cursor-grabbing transition-colors ${
                isSelected
                  ? 'border-indigo-500/50 bg-indigo-950/30'
                  : 'border-slate-800/80 bg-slate-900/30 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start gap-2 pr-16 min-w-0">
                {user?.isOfficer && (
                  <PoolSelectCheckbox
                    checked={isSelected}
                    onChange={() => handleToggleSelect(uid)}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-sans font-bold text-slate-200 truncate">{m.displayName}</div>
                  <div className="text-[9px] text-slate-600 tracking-tighter">id: {uid}</div>
                </div>
              </div>
              <div className="absolute right-2.5 top-3.5 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  type="button"
                  onClick={() => stageMembersOntoRoster([uid])}
                  className="px-2 py-0.5 bg-indigo-950/30 border border-indigo-500/20 hover:bg-indigo-600 text-[9px] font-bold uppercase tracking-wider text-indigo-400 hover:text-white rounded-lg cursor-pointer transition-colors"
                >
                  Add
                </button>
                <button 
                  type="button"
                  onClick={() => handleOpenVanish([uid])}
                  className="px-2 py-0.5 bg-rose-950/30 border border-rose-500/20 hover:bg-rose-600 text-[9px] font-bold uppercase tracking-wider text-rose-400 hover:text-white rounded-lg cursor-pointer transition-colors"
                >
                  Vanish
                </button>
              </div>
            </div>
            );
          })}
        </div>

        {/* DUMMY PLACEHOLDER ROSTER BOX */}
        <div className="shrink-0 bg-slate-900/40 border border-slate-800 p-4 rounded-2xl shadow-md space-y-2 select-none">
          <div className="flex justify-between items-center gap-2">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 min-w-0">
              <IconUser /> <span className="truncate">Dummy Roster ({dummyPoolList.length})</span>
            </h2>
            {user?.isOfficer && (
              <button
                type="button"
                onClick={() => { setDummyDraft(emptyDummyDraft); setShowCreateDummy(true); }}
                className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 text-[10px] uppercase font-bold tracking-wide border border-emerald-500/30 bg-emerald-950/20 text-emerald-400 hover:bg-emerald-600 hover:text-white transition rounded-xl shadow-sm cursor-pointer"
              >
                <IconPlus /> Create
              </button>
            )}
          </div>
          {user?.isOfficer && dummyPoolList.length > 0 && (
            <button
              type="button"
              onClick={() => handleToggleVisibleSelection(dummyPoolList)}
              className="px-2 py-1 text-[10px] uppercase font-bold tracking-wide border border-slate-700 bg-slate-950 text-slate-400 hover:text-white transition rounded-xl cursor-pointer"
            >
              {dummyAllSelected ? 'Deselect visible' : 'Select all visible'}
            </button>
          )}
        </div>

        <div className="shrink-0 h-[9.5rem] border border-slate-800 bg-slate-950/40 rounded-2xl p-3 overflow-y-auto scrollbar-thin space-y-2">
          {dummyPoolList.length === 0 && (
            <div className="text-center text-[11px] text-slate-700 italic font-sans py-8 select-none">
              No dummy placeholders yet. Use “Create” to add one.
            </div>
          )}
          {dummyPoolList.map(([uid, m]) => {
            const isSelected = selectedUids.has(uid);
            return (
            <div
              key={uid}
              draggable={user?.isOfficer && editingNameUid !== uid}
              onDragStart={(e) => handlePoolCardDragStart(e, uid)}
              className={`p-3 rounded-xl border text-xs font-mono shadow-sm flex flex-col space-y-1 relative group cursor-grab active:cursor-grabbing transition-colors ${
                isSelected
                  ? 'border-indigo-500/50 bg-indigo-950/30'
                  : 'border-slate-800/80 bg-slate-900/30 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start gap-2 pr-16 min-w-0">
                {user?.isOfficer && (
                  <PoolSelectCheckbox
                    checked={isSelected}
                    onChange={() => handleToggleSelect(uid)}
                  />
                )}
                <div className="min-w-0 flex-1">
                  {editingNameUid === uid ? (
                    <input
                      type="text"
                      autoFocus
                      value={m.displayName || ''}
                      disabled={!user?.isOfficer}
                      onChange={(e) => handleStageLocalUpdate(uid, 'displayName', e.target.value)}
                      onBlur={() => setEditingNameUid(null)}
                      onKeyDown={(e) => { if (e.key === 'Enter') setEditingNameUid(null); }}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs font-sans font-bold text-slate-100 outline-none focus:border-indigo-600"
                    />
                  ) : (
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-sans font-bold text-slate-200 truncate">{m.displayName || 'Unnamed Dummy'}</span>
                      {user?.isOfficer && (
                        <button
                          type="button"
                          onClick={() => setEditingNameUid(uid)}
                          className="text-slate-600 hover:text-indigo-400 transition cursor-pointer shrink-0"
                          title="Edit name"
                        >
                          <IconEdit />
                        </button>
                      )}
                    </div>
                  )}
                  <div className="text-[9px] text-slate-600 tracking-tighter">id: {uid}</div>
                </div>
              </div>
              <div className="absolute right-2.5 top-3.5 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => stageMembersOntoRoster([uid])}
                  className="px-2 py-0.5 bg-indigo-950/30 border border-indigo-500/20 hover:bg-indigo-600 text-[9px] font-bold uppercase tracking-wider text-indigo-400 hover:text-white rounded-lg cursor-pointer transition-colors"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenVanish([uid])}
                  className="px-2 py-0.5 bg-rose-950/30 border border-rose-500/20 hover:bg-rose-600 text-[9px] font-bold uppercase tracking-wider text-rose-400 hover:text-white rounded-lg cursor-pointer transition-colors"
                >
                  Vanish
                </button>
              </div>
            </div>
            );
          })}
        </div>
      </div>
      </div>
      ) : (
        <RosterInsightsPanels
          panel={activeSlide.id}
          jobsCatalog={jobsCatalog}
          members={stagedMembers}
          isOfficer={!!user?.isOfficer}
          onUpdateDesiredTarget={handleUpdateDesiredTarget}
        />
      )}

      {/* PERSISTENT MANUAL SAVE STICKY DESK COMPONENT */}
      <div className="fixed bottom-0 right-0 left-[var(--valhalla-sidebar-width,16rem)] border-t border-slate-900 bg-slate-950/90 backdrop-blur-md p-4 z-50 shadow-[0_-8px_24px_rgba(0,0,0,0.5)]">
        <div className="mx-auto max-w-6xl flex items-center justify-end gap-4 select-none">
          <button
            type="button"
            onClick={handleSaveRosterProgress}
            disabled={!isDirty || saving || !user?.isOfficer}
            className={`flex items-center gap-1.5 rounded-xl px-6 py-2.5 text-xs font-black uppercase tracking-wider text-white transition-all shadow-xl cursor-pointer ${
              isDirty 
                ? 'bg-indigo-600 hover:bg-indigo-500' 
                : 'bg-slate-900 border border-slate-800 text-slate-600 cursor-not-allowed shadow-none'
            }`}
          >
            <IconSave /> {saving ? 'Committing Batch Data...' : 'Save Roster Progress'}
          </button>
        </div>
      </div>

      {/* CREATE DUMMY MODAL */}
      {showCreateDummy && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold tracking-wider uppercase text-emerald-400 flex items-center gap-1.5"><IconPlus /> Create Dummy Member</h2>
              <button type="button" onClick={() => setShowCreateDummy(false)} className="text-slate-500 hover:text-white transition cursor-pointer"><IconX /></button>
            </div>

            <div className="space-y-3 font-sans">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Member Name</label>
                <input
                  type="text"
                  autoFocus
                  value={dummyDraft.displayName}
                  onChange={(e) => setDummyDraft(prev => ({ ...prev, displayName: e.target.value }))}
                  placeholder="e.g. Placeholder Tank"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-slate-700 font-medium placeholder-slate-600/60"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Job Class</label>
                <div className="flex items-center gap-2">
                  <img
                    src={`/assets/icons/classes/${jobsCatalog[dummyDraft.jobCode]?.iconFile || 'default.svg'}`}
                    alt=""
                    className="w-5 h-5 object-contain shrink-0 opacity-90"
                    onError={(e) => { e.target.src = '/assets/icons/classes/default.svg'; }}
                  />
                  <select
                    value={dummyDraft.jobCode}
                    onChange={(e) => setDummyDraft(prev => ({ ...prev, jobCode: e.target.value }))}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-xs outline-none w-full font-bold cursor-pointer text-slate-200"
                  >
                    <option value="">Select Job...</option>
                    {Object.entries(jobsCatalog).map(([code, j]) => (
                      <option key={code} value={code} className="bg-slate-950">{j.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Role Classification</label>
                <select
                  value={dummyDraft.roleCode}
                  onChange={(e) => setDummyDraft(prev => ({ ...prev, roleCode: e.target.value }))}
                  className="bg-slate-950 border border-indigo-900/30 rounded-xl px-2 py-1.5 text-xs outline-none w-full text-indigo-400 font-bold cursor-pointer"
                >
                  <option value="" className="text-slate-500">Select Role...</option>
                  {Object.entries(rolesCatalog).map(([code, r]) => (
                    <option key={code} value={code} className="text-indigo-300 bg-slate-950">{r.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Group Assignment</label>
                <input
                  type="text"
                  value={dummyDraft.groupTag}
                  onChange={(e) => setDummyDraft(prev => ({ ...prev, groupTag: e.target.value }))}
                  placeholder="e.g. Team A"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-slate-700 font-medium placeholder-slate-600/60"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Date Joined</label>
                <input
                  type="date"
                  value={dummyDraft.joinedAt}
                  onChange={(e) => setDummyDraft(prev => ({ ...prev, joinedAt: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-slate-700 cursor-pointer"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-1 text-xs">
              <button type="button" onClick={() => setShowCreateDummy(false)} className="px-4 py-2 border border-slate-800 bg-slate-950 text-slate-400 hover:text-white rounded-xl transition cursor-pointer font-sans font-semibold">Cancel</button>
              <button
                type="button"
                disabled={!dummyDraft.displayName.trim() || creatingDummy}
                onClick={handleCreateDummy}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-20 text-white rounded-xl font-bold uppercase tracking-wider transition shadow-lg cursor-pointer font-sans flex items-center gap-1.5"
              >
                <IconPlus /> {creatingDummy ? 'Creating...' : 'Create Dummy'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VANISH EVICTION MODAL TARGET */}
      {vanishTargets?.length > 0 && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <h2 className="text-sm font-bold tracking-wider uppercase text-rose-500">
              {vanishCount === 1 && vanishTargets[0].startsWith('dummy_')
                ? 'Remove Dummy Placeholder'
                : vanishAllDummy
                  ? `Remove ${vanishCount} Dummy Placeholders`
                  : vanishCount === 1
                    ? 'Severe Guild Eviction'
                    : `Severe Guild Eviction (${vanishCount})`}
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed font-sans">
              {vanishAllDummy
                ? vanishCount === 1
                  ? 'This permanently purges the dummy placeholder record from your cloud database. No Discord server action is taken.'
                  : `This permanently purges ${vanishCount} dummy placeholder records from your cloud database. No Discord server action is taken.`
                : vanishCount === 1
                  ? 'This triggers a kick configuration command on the active Discord server and purges all related history rows completely out of your cloud database records.'
                  : `This kicks up to ${vanishTargets.filter((uid) => !uid.startsWith('dummy_')).length} Discord member(s) (best effort) and purges all ${vanishCount} selected records from the cloud database.`}
            </p>
            {vanishCount > 1 && (
              <div className="max-h-32 overflow-y-auto scrollbar-thin rounded-xl border border-slate-800 bg-slate-950/60 p-2 space-y-1">
                {vanishTargets.map((uid) => {
                  const member = stagedMembers[uid] || dbMembers[uid];
                  return (
                    <div key={uid} className="flex items-center justify-between gap-2 text-[11px] font-sans">
                      <span className="text-slate-200 truncate">{member?.displayName || uid}</span>
                      <span className="text-slate-600 font-mono text-[9px] shrink-0">{uid.startsWith('dummy_') ? 'dummy' : 'discord'}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="space-y-1 font-mono text-xs">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Type keyword <strong className="text-white">YES</strong> to execute:</label>
              <input 
                type="text" 
                value={confirmKeyword}
                onChange={(e) => setConfirmKeyword(e.target.value)}
                placeholder="YES"
                disabled={vanishing}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-center text-amber-500 font-bold font-mono tracking-widest outline-none disabled:opacity-50"
              />
            </div>
            <div className="flex justify-end gap-3 pt-1 font-mono text-xs">
              <button
                type="button"
                disabled={vanishing}
                onClick={() => { setVanishTargets(null); setConfirmKeyword(''); }}
                className="px-4 py-2 border border-slate-800 bg-slate-950 text-slate-400 hover:text-white rounded-xl transition cursor-pointer disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={confirmKeyword !== 'YES' || vanishing}
                onClick={handleExecuteVanish}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-10 text-white rounded-xl font-bold uppercase tracking-wider transition shadow-lg cursor-pointer"
              >
                {vanishing ? 'Executing...' : vanishCount > 1 ? `Execute ${vanishCount}` : 'Execute Eviction'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowDown01, ArrowDownAZ, ArrowLeft, ArrowUp10, ArrowUpZA, ChevronLeft, ChevronRight, Filter, Search, Trash2, Upload } from 'lucide-react';
import { apiFetch } from '../../../services/apiClient';
import {
  cacheReviewShots,
  clearCachedReviewShots,
  clearPendingUpload,
  getCachedReviewShots,
  getPendingUpload,
  readOcrUiSession,
  setPendingUpload,
  writeOcrUiSession,
} from '../ocrReviewSession';

const MAX_SHOTS = 8;
const BLANK_IMAGE = '';

function memberName(row) {
  return row.displayName || row.inGameName || row.uid;
}

function imageSourceKey(row) {
  return String(row.imageSource || BLANK_IMAGE);
}

function uniqueImageSources(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    const key = imageSourceKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out.sort((a, b) => {
    if (!a && b) return 1;
    if (a && !b) return -1;
    return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
  });
}

function formatOcrPosition(col, row, fallback = '') {
  if (fallback) return fallback;
  if (col && row) return `C${col} R${row}`;
  return '—';
}

function slotGapsFromReview(review) {
  if (Array.isArray(review?.slotGaps)) return review.slotGaps;
  return (review?.unmatched || []).map((row) => ({ ...row, category: 'unmatch' }));
}

function slotGapValue(row) {
  if (row.category === 'empty') return '+';
  if (row.category === 'missing') return '—';
  return row.text || '—';
}

function slotGapCategory(row) {
  if (row.category === 'empty') return 'Empty';
  if (row.category === 'missing') return 'Missing';
  return 'Unmatch';
}

function slotGapTone(row) {
  if (row.category === 'empty') return 'text-slate-500';
  if (row.category === 'missing') return 'text-rose-300';
  return 'text-amber-300';
}

function unmatchedMeta(row) {
  const bits = [slotGapValue(row), slotGapCategory(row)];
  if (row.imageSource) bits.push(row.imageSource);
  const pos = formatOcrPosition(row.ocrCol, row.ocrRow);
  if (pos !== '—') bits.push(pos);
  return bits.join(' · ');
}

function sortUnmatchedByGrid(rows) {
  return [...rows].sort((a, b) => {
    const colA = Number(a.ocrCol) || 0;
    const colB = Number(b.ocrCol) || 0;
    if (colA !== colB) {
      if (!colA) return 1;
      if (!colB) return -1;
      return colA - colB;
    }
    const rowA = Number(a.ocrRow) || 0;
    const rowB = Number(b.ocrRow) || 0;
    if (rowA !== rowB) {
      if (!rowA) return 1;
      if (!rowB) return -1;
      return rowA - rowB;
    }
    return String(a.text || '').localeCompare(String(b.text || ''), undefined, { sensitivity: 'base' });
  });
}

function compareGridPosition(a, b) {
  const colA = Number(a.ocrCol) || 0;
  const colB = Number(b.ocrCol) || 0;
  const rowA = Number(a.ocrRow) || 0;
  const rowB = Number(b.ocrRow) || 0;
  const missingA = !colA && !rowA;
  const missingB = !colB && !rowB;
  if (missingA && missingB) return 0;
  if (missingA) return 1;
  if (missingB) return -1;
  if (colA !== colB) return colA - colB;
  return rowA - rowB;
}

function sortRoster(rows, sortKey = 'name', sortDir = 'asc') {
  const sign = sortDir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    if (sortKey === 'image') {
      const left = String(a.imageSource || '');
      const right = String(b.imageSource || '');
      if (!left && !right) {
        return memberName(a).localeCompare(memberName(b), undefined, { sensitivity: 'base', numeric: true });
      }
      if (!left) return 1;
      if (!right) return -1;
      const byName = sign * left.localeCompare(right, undefined, { sensitivity: 'base', numeric: true });
      if (byName) return byName;
      const idxA = Number.isInteger(a.imageIndex) ? a.imageIndex : 999;
      const idxB = Number.isInteger(b.imageIndex) ? b.imageIndex : 999;
      if (idxA !== idxB) return sign * (idxA - idxB);
      return memberName(a).localeCompare(memberName(b), undefined, { sensitivity: 'base', numeric: true });
    }
    if (sortKey === 'position') {
      const cmp = compareGridPosition(a, b);
      if (!cmp) {
        return memberName(a).localeCompare(memberName(b), undefined, { sensitivity: 'base', numeric: true });
      }
      const missingA = !Number(a.ocrCol) && !Number(a.ocrRow);
      const missingB = !Number(b.ocrCol) && !Number(b.ocrRow);
      if (missingA || missingB) return cmp;
      return sign * cmp;
    }
    return sign * memberName(a).localeCompare(memberName(b), undefined, { sensitivity: 'base', numeric: true });
  });
}

export default function OcrReviewTab({ user }) {
  const isOfficer = user?.isOfficer === true;
  const { reviewId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const fileRef = useRef(null);
  const savedSession = readOcrUiSession();
  const pendingUpload = getPendingUpload();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reviews, setReviews] = useState([]);
  const [events, setEvents] = useState([]);
  const [eventKey, setEventKey] = useState(pendingUpload.eventKey || '');
  const [review, setReview] = useState(null);
  const [roster, setRoster] = useState([]);
  const [search, setSearch] = useState(() => (savedSession.reviewId === reviewId ? savedSession.search : '') || '');
  const [sortKey, setSortKey] = useState(() => {
    const key = savedSession.reviewId === reviewId ? savedSession.sortKey : '';
    return key && key !== 'image' ? key : 'name';
  });
  const [sortDir, setSortDir] = useState(() => (
    savedSession.reviewId === reviewId && (savedSession.sortDir || savedSession.nameSort)
  ) || 'asc');
  const [imageFilter, setImageFilter] = useState(() => (
    savedSession.reviewId === reviewId && savedSession.imageFilter != null ? savedSession.imageFilter : 'all'
  ));
  const [imageMenuOpen, setImageMenuOpen] = useState(false);
  const [imageMenuPos, setImageMenuPos] = useState({ top: 0, left: 0 });
  const [stateFilter, setStateFilter] = useState(() => (savedSession.reviewId === reviewId && savedSession.stateFilter) || 'all');
  const [markFilter, setMarkFilter] = useState(() => (savedSession.reviewId === reviewId && savedSession.markFilter) || 'all');
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [selectedFiles, setSelectedFiles] = useState(pendingUpload.files || []);
  const [localPreviews, setLocalPreviews] = useState(
    () => location.state?.screenshotPreviews || getCachedReviewShots(reviewId)
  );
  const [shotIndex, setShotIndex] = useState(() => (
    savedSession.reviewId === reviewId && Number.isFinite(savedSession.shotIndex) ? savedSession.shotIndex : 0
  ));
  const rosterRef = useRef([]);
  const persistTimer = useRef(null);
  const persistPresentRef = useRef(async () => {});
  const imageMenuRef = useRef(null);
  const imageButtonRef = useRef(null);

  useEffect(() => {
    rosterRef.current = roster;
  }, [roster]);

  const loadList = useCallback(async () => {
    const [reviewRes, eventRes] = await Promise.all([
      apiFetch('/api/ocr-reviews'),
      apiFetch('/api/ocr-reviews/events'),
    ]);
    const reviewData = await reviewRes.json();
    const eventData = await eventRes.json();
    if (!reviewData.success) throw new Error(reviewData.error || 'Failed to load OCR reviews.');
    if (!eventData.success) throw new Error(eventData.error || 'Failed to load events.');
    setReviews(reviewData.reviews || []);
    const nextEvents = eventData.events || [];
    setEvents(nextEvents);
    setEventKey((current) => current || nextEvents[0]?.key || '');
    setReview(null);
    setRoster([]);
  }, []);

  const loadOne = useCallback(async (id) => {
    const res = await apiFetch(`/api/ocr-reviews/${encodeURIComponent(id)}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to load review.');
    setReview(data.review || null);
    const nextRoster = data.roster || [];
    rosterRef.current = nextRoster;
    setRoster(nextRoster);
  }, []);

  useEffect(() => {
    if (!isOfficer) {
      setLoading(false);
      setError('Officer access required.');
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        setNotice('');
        if (reviewId) {
          await loadOne(reviewId);
        } else {
          const saved = readOcrUiSession();
          if (!saved.stayOnList && saved.reviewId) return;
          await loadList();
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load.');
          setReview(null);
          setRoster([]);
          if (reviewId) writeOcrUiSession({ stayOnList: true, reviewId: null });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(persistTimer.current);
      if (reviewId) persistPresentRef.current().catch(() => {});
    };
  }, [isOfficer, reviewId, loadList, loadOne]);

  useEffect(() => {
    if (!isOfficer || reviewId) return undefined;
    const saved = readOcrUiSession();
    if (saved.stayOnList || !saved.reviewId) return undefined;
    navigate(`/attendance/ocr-review/${encodeURIComponent(saved.reviewId)}`, { replace: true });
    return undefined;
  }, [isOfficer, reviewId, navigate]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir('asc');
  };

  const imageSourceOptions = useMemo(() => uniqueImageSources(roster), [roster]);

  useEffect(() => {
    if (!imageMenuOpen) return undefined;
    const onDown = (event) => {
      if (imageMenuRef.current?.contains(event.target)) return;
      if (imageButtonRef.current?.contains(event.target)) return;
      setImageMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [imageMenuOpen]);

  const imageFilterActive = imageFilter !== 'all';
  const selectedImageSources = imageFilter === 'all' ? imageSourceOptions : imageFilter;
  const allImagesSelected = imageFilter === 'all'
    || (Array.isArray(imageFilter) && imageSourceOptions.length > 0 && imageFilter.length === imageSourceOptions.length);

  const toggleImageSelectAll = () => {
    setImageFilter(allImagesSelected ? [] : 'all');
  };

  const toggleImageSource = (key) => {
    setImageFilter((current) => {
      const selected = current === 'all' ? [...imageSourceOptions] : [...(current || [])];
      const next = selected.includes(key)
        ? selected.filter((item) => item !== key)
        : [...selected, key];
      if (next.length === imageSourceOptions.length) return 'all';
      return next;
    });
  };

  const filteredRoster = useMemo(() => {
    const q = search.trim().toLowerCase();
    const allowImages = imageFilter === 'all' ? null : new Set(imageFilter || []);
    return sortRoster(roster, sortKey === 'image' ? 'name' : sortKey, sortDir).filter((row) => {
      if (allowImages && !allowImages.has(imageSourceKey(row))) return false;
      if (stateFilter !== 'all' && row.ocrState !== stateFilter) return false;
      if (markFilter === 'O' && !row.present) return false;
      if (markFilter === 'X' && row.present) return false;
      if (!q) return true;
      const blob = `${memberName(row)} ${row.inGameName || ''} ${row.ocrText || ''} ${row.ocrState || ''} ${row.imageSource || ''} ${row.ocrPosition || ''}`.toLowerCase();
      return blob.includes(q);
    });
  }, [roster, search, sortKey, sortDir, imageFilter, stateFilter, markFilter]);

  const presentCount = roster.filter((row) => row.present).length;
  const screenshotUrls = (review?.screenshotUrls || []).filter(Boolean);
  const shots = screenshotUrls.length
    ? screenshotUrls
    : (review?.screenshotUrl ? [review.screenshotUrl] : localPreviews);
  const safeShotIndex = shots.length ? Math.min(shotIndex, shots.length - 1) : 0;

  useEffect(() => {
    if (!reviewId) return undefined;
    writeOcrUiSession({
      reviewId,
      stayOnList: false,
      search,
      sortKey,
      sortDir,
      nameSort: sortKey === 'name' ? sortDir : 'asc',
      imageFilter,
      stateFilter,
      markFilter,
      shotIndex,
    });
    return undefined;
  }, [reviewId, search, sortKey, sortDir, imageFilter, stateFilter, markFilter, shotIndex]);

  useEffect(() => {
    if (reviewId) return undefined;
    setPendingUpload(eventKey, selectedFiles);
    return undefined;
  }, [reviewId, eventKey, selectedFiles]);

  useEffect(() => {
    const fromNav = location.state?.screenshotPreviews;
    if (fromNav?.length) {
      cacheReviewShots(reviewId, fromNav);
      setLocalPreviews(fromNav);
      return;
    }
    setLocalPreviews(getCachedReviewShots(reviewId));
  }, [location.state, reviewId]);

  useEffect(() => {
    if (!reviewId || shots.length < 2) return undefined;
    const onKey = (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setShotIndex((i) => (i - 1 + shots.length) % shots.length);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setShotIndex((i) => (i + 1) % shots.length);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reviewId, shots.length]);

  const persistPresent = async (nextRoster) => {
    if (!reviewId || review?.status !== 'draft') return;
    const presentUids = nextRoster.filter((row) => row.present).map((row) => row.uid);
    const res = await apiFetch(`/api/ocr-reviews/${encodeURIComponent(reviewId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ presentUids }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to save.');
  };
  persistPresentRef.current = () => persistPresent(rosterRef.current);

  const flushPersist = () => {
    clearTimeout(persistTimer.current);
    persistTimer.current = null;
    return persistPresent(rosterRef.current);
  };

  const setPresent = (uid, present) => {
    if (review?.status !== 'draft' || busy) return;
    const prev = rosterRef.current;
    if (prev.find((row) => row.uid === uid)?.present === present) return;
    const next = prev.map((row) => (row.uid === uid ? { ...row, present } : row));
    rosterRef.current = next;
    setRoster(next);
    clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      persistPresent(rosterRef.current).catch((err) => {
        rosterRef.current = prev;
        setRoster(prev);
        setError(err.message);
      });
    }, 280);
  };

  const commit = async () => {
    if (review?.status !== 'draft') return;
    setBusy(true);
    setNotice('');
    try {
      await flushPersist().catch(() => {});
      const presentUids = rosterRef.current.filter((row) => row.present).map((row) => row.uid);
      const res = await apiFetch(`/api/ocr-reviews/${encodeURIComponent(reviewId)}/commit`, {
        method: 'POST',
        body: JSON.stringify({ presentUids }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Commit failed.');
      clearCachedReviewShots(reviewId);
      writeOcrUiSession({ stayOnList: true, reviewId: null });
      navigate('/attendance/ocr-review', {
        replace: true,
        state: { commitNotice: `Committed ${data.presentCount} in-game present. ${data.message || ''}` },
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const cancelReview = async () => {
    if (review?.status !== 'draft') return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/ocr-reviews/${encodeURIComponent(reviewId)}/cancel`, { method: 'POST' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Cancel failed.');
      clearCachedReviewShots(reviewId);
      writeOcrUiSession({ stayOnList: true, reviewId: null });
      navigate('/attendance/ocr-review');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const removeReview = async (id, { fromList = false } = {}) => {
    if (!id || deletingId || busy) return;
    setDeletingId(id);
    setError('');
    try {
      const res = await apiFetch(`/api/ocr-reviews/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Delete failed.');
      clearCachedReviewShots(id);
      setReviews((prev) => prev.filter((row) => row.id !== id));
      if (!fromList || id === reviewId) {
        writeOcrUiSession({ stayOnList: true, reviewId: null });
        navigate('/attendance/ocr-review');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId('');
    }
  };

  const goToList = () => {
    writeOcrUiSession({ stayOnList: true });
  };

  const onPickFiles = (event) => {
    const incoming = [...(event.target.files || [])];
    const merged = [];
    const seen = new Set();
    for (const file of [...selectedFiles, ...incoming]) {
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(file);
      if (merged.length >= MAX_SHOTS) break;
    }
    setSelectedFiles(merged);
    if ([...selectedFiles, ...incoming].length > MAX_SHOTS) {
      setError(`Using the first ${MAX_SHOTS} screenshots.`);
    } else {
      setError('');
    }
    event.target.value = '';
  };

  const clearPickedFiles = () => {
    setSelectedFiles([]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const uploadScan = async (event) => {
    event.preventDefault();
    const files = selectedFiles.length ? selectedFiles : [...(fileRef.current?.files || [])];
    if (!files.length) {
      setError('Choose Team Party screenshots first.');
      return;
    }
    if (!eventKey) {
      setError('Pick the raid event these screenshots belong to.');
      return;
    }
    setScanning(true);
    setError('');
    const picked = files.slice(0, MAX_SHOTS);
    const previews = picked.map((file) => URL.createObjectURL(file));
    try {
      const body = new FormData();
      body.append('eventKey', eventKey);
      picked.forEach((file) => body.append('files', file));
      const res = await apiFetch('/api/ocr-reviews/scan', { method: 'POST', body });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Scan failed.');
      if (fileRef.current) fileRef.current.value = '';
      setSelectedFiles([]);
      clearPendingUpload();
      cacheReviewShots(data.id, previews);
      writeOcrUiSession({ reviewId: data.id, stayOnList: false, shotIndex: 0 });
      navigate(`/attendance/ocr-review/${data.id}`, { state: { screenshotPreviews: previews } });
    } catch (err) {
      previews.forEach((url) => URL.revokeObjectURL(url));
      setError(err.message);
    } finally {
      setScanning(false);
    }
  };

  if (!isOfficer) {
    return <div className="text-xs text-slate-400">Officer access required for GVG Attendance review.</div>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-xs font-mono text-slate-500 uppercase tracking-widest">
        Loading GVG Attendance…
      </div>
    );
  }

  if (!reviewId) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <div>
          <h1 className="text-lg font-black text-slate-100 uppercase tracking-wide">GVG Attendance</h1>
          <p className="text-xs text-slate-400 mt-1">Upload every Team Party screenshot for the raid, mark O/X, then Commit swords.</p>
        </div>
        {error && <div className="text-xs text-rose-400">{error}</div>}
        {location.state?.commitNotice && (
          <div className="text-xs text-emerald-400">{location.state.commitNotice}</div>
        )}
        <form onSubmit={uploadScan} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Upload screenshots</div>
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
            <select
              value={eventKey}
              onChange={(e) => setEventKey(e.target.value)}
              className="h-[42px] px-3 rounded-xl border border-slate-800 bg-slate-950 text-sm text-slate-100"
            >
              {events.length === 0 && <option value="">No calendar events</option>}
              {events.map((ev) => (
                <option key={ev.key} value={ev.key}>{ev.date} {ev.title}</option>
              ))}
            </select>
            <label className="h-[42px] px-4 rounded-xl border border-slate-700 bg-slate-950 text-[11px] font-bold uppercase tracking-wider text-slate-200 inline-flex items-center justify-center cursor-pointer hover:border-slate-500">
              Select screenshots
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple
                onChange={onPickFiles}
                className="sr-only"
              />
            </label>
            <button
              type="submit"
              disabled={scanning || !eventKey || selectedFiles.length === 0}
              className="h-[42px] px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold uppercase tracking-wider disabled:opacity-40 inline-flex items-center justify-center gap-2"
            >
              <Upload size={14} />
              {scanning ? 'Scanning…' : 'Upload'}
            </button>
          </div>
          {selectedFiles.length > 0 && (
            <div className="flex items-start justify-between gap-3">
              <ul className="text-[11px] text-slate-300 space-y-0.5">
                {selectedFiles.map((file) => (
                  <li key={`${file.name}-${file.size}-${file.lastModified}`}>{file.name}</li>
                ))}
              </ul>
              <button type="button" onClick={clearPickedFiles} className="text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-300">
                Clear
              </button>
            </div>
          )}
          <p className="text-[10px] text-slate-500">
            {selectedFiles.length ? `${selectedFiles.length} of ${MAX_SHOTS} selected.` : `Select several at once, or add more after. Up to ${MAX_SHOTS} images.`}
            {' '}Images are scanned in memory and not stored. After Commit they may post to Raid Screenshot.
          </p>
        </form>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
          {reviews.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-slate-500">No OCR reviews yet. Upload a screenshot or scan from Discord.</div>
          ) : reviews.map((row) => (
            <div
              key={row.id}
              className="w-full px-4 py-3 border-b border-slate-800 last:border-b-0 hover:bg-slate-900/50 flex items-center justify-between gap-3"
            >
              <button
                type="button"
                onClick={() => {
                  writeOcrUiSession({ reviewId: row.id, stayOnList: false });
                  navigate(`/attendance/ocr-review/${row.id}`);
                }}
                className="min-w-0 flex-1 text-left"
              >
                <div className="text-sm font-semibold text-slate-100">{row.eventTitle || row.eventKey}</div>
                <div className="text-[11px] text-slate-500">{row.eventDate} · match {row.matchCount ?? '—'} · unmatch {row.unmatchedCount} · O {row.presentCount}</div>
              </button>
              <span className={`text-[10px] font-bold uppercase tracking-wider shrink-0 ${row.status === 'draft' ? 'text-cyan-400' : row.status === 'committed' ? 'text-emerald-400' : 'text-slate-500'}`}>
                {row.status}
              </span>
              <button
                type="button"
                title="Delete review"
                disabled={Boolean(deletingId)}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  removeReview(row.id, { fromList: true });
                }}
                className="w-9 h-9 rounded-lg border border-slate-800 text-slate-500 hover:text-rose-300 hover:border-rose-800 inline-flex items-center justify-center disabled:opacity-40"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!review) {
    return (
      <div className="space-y-4 animate-fadeIn">
        <Link to="/attendance/ocr-review" onClick={goToList} className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300">
          <ArrowLeft size={12} /> All reviews
        </Link>
        <div className="text-xs text-rose-400">{error || 'Review not found.'}</div>
      </div>
    );
  }

  const draft = review.status === 'draft';
  const slotGaps = slotGapsFromReview(review);
  const gapsHere = sortUnmatchedByGrid(slotGaps.filter((row) => (
    Number.isInteger(row.imageIndex) ? row.imageIndex === safeShotIndex : safeShotIndex === 0
  )));
  const unmatchedHere = gapsHere.filter((row) => row.category === 'unmatch' || !row.category);
  const missingHere = gapsHere.filter((row) => row.category === 'missing');
  const emptyHere = gapsHere.filter((row) => row.category === 'empty');
  const matchedHere = roster.filter((row) => {
    if (row.ocrState !== 'match') return false;
    return Number.isInteger(row.imageIndex) ? row.imageIndex === safeShotIndex : safeShotIndex === 0;
  });
  const occupiedHere = matchedHere.length + unmatchedHere.length + missingHere.length;
  const matchRate = occupiedHere ? Math.round((matchedHere.length / occupiedHere) * 100) : 0;
  const shotFileName = (review.fileNames || [])[safeShotIndex]
    || gapsHere.find((row) => row.imageSource)?.imageSource
    || matchedHere.find((row) => row.imageSource)?.imageSource
    || `Screenshot ${safeShotIndex + 1}`;

  return (
    <div className="flex flex-col gap-4 h-[calc(100dvh-10rem)] md:h-[calc(100dvh-8.5rem)] min-h-0 animate-fadeIn">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3 shrink-0">
        <div className="space-y-2">
          <Link to="/attendance/ocr-review" onClick={goToList} className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300">
            <ArrowLeft size={12} /> All reviews
          </Link>
          <h1 className="text-lg font-black text-slate-100 uppercase tracking-wide">{review.eventTitle || 'GVG Attendance'}</h1>
          <p className="text-xs text-slate-400">{review.eventDate} · {presentCount} present · {roster.length - presentCount} absent</p>
        </div>
        {draft && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={commit} disabled={busy} className="h-[42px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold uppercase tracking-wider disabled:opacity-40">
              Commit swords
            </button>
            <button type="button" onClick={cancelReview} disabled={busy} className="h-[42px] px-4 rounded-xl border border-slate-700 text-slate-300 text-[11px] font-bold uppercase tracking-wider disabled:opacity-40">
              Cancel
            </button>
          </div>
        )}
        {!draft && (
          <button
            type="button"
            onClick={() => removeReview(reviewId)}
            disabled={Boolean(deletingId)}
            className="h-[42px] px-4 rounded-xl border border-slate-700 text-slate-300 text-[11px] font-bold uppercase tracking-wider disabled:opacity-40 inline-flex items-center gap-2"
          >
            <Trash2 size={14} />
            Delete
          </button>
        )}
      </div>
      {error && <div className="text-xs text-rose-400">{error}</div>}
      {notice && <div className="text-xs text-emerald-400">{notice}</div>}
      {!draft && (
        <div className="text-xs text-slate-500">This review is {review.status}. Upload a new screenshot to start another.</div>
      )}

      <div className="flex flex-col gap-4 flex-1 min-h-0">
        <div className="grid grid-cols-1 gap-4 items-stretch shrink-0 lg:grid-cols-[7fr_3fr]">
          {shots.length > 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden flex flex-col h-[min(32rem,42vh)]">
              <div className="relative flex-1 min-h-0 bg-slate-950">
                <img
                  src={shots[safeShotIndex]}
                  alt={`Team Party screenshot ${safeShotIndex + 1}`}
                  className="w-full h-full object-contain"
                />
                {shots.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShotIndex((i) => (i - 1 + shots.length) % shots.length)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg bg-slate-950/80 border border-slate-700 text-slate-200 hover:text-white"
                      aria-label="Previous screenshot"
                    >
                      <ChevronLeft size={18} className="mx-auto" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShotIndex((i) => (i + 1) % shots.length)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg bg-slate-950/80 border border-slate-700 text-slate-200 hover:text-white"
                      aria-label="Next screenshot"
                    >
                      <ChevronRight size={18} className="mx-auto" />
                    </button>
                  </>
                )}
              </div>
              {shots.length > 1 && (
                <div className="flex items-center justify-center gap-2 px-3 h-8 border-t border-slate-800 shrink-0">
                  <span className="text-[10px] font-mono text-slate-500">
                    {safeShotIndex + 1}/{shots.length}
                  </span>
                  {shots.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setShotIndex(idx)}
                      className={`h-1.5 rounded-full ${idx === safeShotIndex ? 'w-5 bg-cyan-400' : 'w-1.5 bg-slate-600'}`}
                      aria-label={`Screenshot ${idx + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3 flex flex-col h-[min(32rem,42vh)] overflow-hidden">
              <div className="relative shrink-0">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search names"
                  className="w-full h-[42px] pl-9 pr-3 rounded-xl border border-slate-800 bg-slate-950 text-sm text-slate-100 placeholder:text-slate-600"
                />
              </div>
              <div className="shrink-0 mt-3 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-[11px] uppercase tracking-wider text-slate-400">OCR Stats</div>
                  <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                    {matchedHere.length}/{occupiedHere}
                    <span className="ml-1.5">{occupiedHere ? `${matchRate}%` : '—'}</span>
                  </div>
                </div>
                <div className="mt-1 text-[11px] font-mono text-cyan-400/90 truncate" title={shotFileName}>{shotFileName}</div>
                <table className="mt-2 w-full table-fixed border-collapse">
                  <thead>
                    <tr className="text-[10px] text-slate-500">
                      <th className="py-0.5 font-normal text-center">Match</th>
                      <th className="py-0.5 font-normal text-center">Unmatch</th>
                      <th className="py-0.5 font-normal text-center">Missing</th>
                      <th className="py-0.5 font-normal text-center">Empty</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="font-mono text-sm text-slate-200">
                      <td className="py-0.5 text-center tabular-nums">{matchedHere.length}</td>
                      <td className="py-0.5 text-center tabular-nums">{unmatchedHere.length}</td>
                      <td className="py-0.5 text-center tabular-nums">{missingHere.length}</td>
                      <td className="py-0.5 text-center tabular-nums">{emptyHere.length}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="shrink-0 mt-3 text-[11px] uppercase tracking-wider text-slate-400">
                Slot gaps
              </div>
              <div className="mt-1 flex-1 min-h-0 overflow-y-auto scrollbar-thin overscroll-contain">
                {gapsHere.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-[11px] text-slate-500">
                    No slot gaps on this screenshot.
                  </div>
                ) : (
                  <table className="w-full table-fixed border-collapse">
                    <colgroup>
                      <col className="w-8" />
                      <col />
                      <col className="w-[4.75rem]" />
                      <col className="w-8" />
                      <col className="w-8" />
                    </colgroup>
                    <thead className="sticky top-0 z-10 bg-slate-900">
                      <tr className="text-[10px] text-slate-500">
                        <th className="pl-1 pr-2 py-1 font-normal text-right">#</th>
                        <th className="px-1.5 py-1 font-normal text-left">OCR</th>
                        <th className="px-1.5 py-1 font-normal text-left">Category</th>
                        <th className="px-1 py-1 font-normal text-right">Col</th>
                        <th className="pl-1 pr-1 py-1 font-normal text-right">Row</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {gapsHere.map((row, idx) => (
                        <tr
                          key={row.id || `${row.category}-${row.ocrCol}-${row.ocrRow}-${row.text}`}
                          title={unmatchedMeta(row)}
                          className="h-8"
                        >
                          <td className="pl-1 pr-2 text-[10px] font-mono text-slate-500 text-right tabular-nums">
                            {idx + 1}
                          </td>
                          <td className={`px-1.5 text-xs font-mono truncate max-w-0 ${row.category === 'empty' ? 'text-slate-500' : 'text-slate-100'}`}>
                            {slotGapValue(row)}
                          </td>
                          <td className={`px-1.5 text-[10px] truncate ${slotGapTone(row)}`}>
                            {slotGapCategory(row)}
                          </td>
                          <td className="px-1 text-[10px] font-mono text-slate-400 text-right tabular-nums">
                            {row.ocrCol || '—'}
                          </td>
                          <td className="pl-1 pr-1 text-[10px] font-mono text-slate-400 text-right tabular-nums">
                            {row.ocrRow || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-auto scrollbar-thin overscroll-contain">
              <table className="w-full table-fixed text-left border-collapse text-xs min-w-[980px]">
                <colgroup>
                  <col className="w-[18%]" />
                  <col className="w-[16%]" />
                  <col className="w-[9rem]" />
                  <col className="w-[16%]" />
                  <col className="w-[8rem]" />
                  <col className="w-[8rem]" />
                  <col className="w-[4.5rem]" />
                  <col className="w-[4.5rem]" />
                </colgroup>
                <thead className="sticky top-0 z-10">
                  <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="p-3 bg-slate-950">
                      <button
                        type="button"
                        onClick={() => toggleSort('name')}
                        className={`inline-flex items-center gap-1.5 hover:text-slate-200 ${sortKey === 'name' ? 'text-slate-200' : 'text-slate-400'}`}
                        title={sortKey === 'name' && sortDir === 'desc' ? 'Sort A to Z' : 'Sort Z to A'}
                      >
                        Masterlist
                        {sortKey === 'name' && sortDir === 'desc' ? <ArrowUpZA size={13} /> : <ArrowDownAZ size={13} />}
                      </button>
                    </th>
                    <th className="p-3 bg-slate-950">
                      <button
                        ref={imageButtonRef}
                        type="button"
                        onClick={(event) => {
                          if (imageMenuOpen) {
                            setImageMenuOpen(false);
                            return;
                          }
                          const rect = event.currentTarget.getBoundingClientRect();
                          setImageMenuPos({ top: rect.bottom + 4, left: rect.left });
                          setImageMenuOpen(true);
                        }}
                        className={`inline-flex items-center gap-1.5 hover:text-slate-200 ${imageFilterActive ? 'text-cyan-400' : 'text-slate-400'}`}
                        title="Filter by screenshot file"
                      >
                        Image source
                        <Filter size={12} />
                      </button>
                      {imageMenuOpen && createPortal(
                        <div
                          ref={imageMenuRef}
                          style={{ top: imageMenuPos.top, left: imageMenuPos.left }}
                          className="fixed z-[80] w-56 rounded-xl border border-slate-800 bg-slate-950 shadow-xl p-2"
                        >
                          <label className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-900 cursor-pointer text-[11px] text-slate-200">
                            <input
                              type="checkbox"
                              checked={allImagesSelected}
                              onChange={toggleImageSelectAll}
                              className="accent-cyan-500"
                            />
                            Select all
                          </label>
                          <div className="mt-1 max-h-48 overflow-y-auto scrollbar-thin overscroll-contain border-t border-slate-800 pt-1">
                            {imageSourceOptions.length === 0 ? (
                              <div className="px-2 py-3 text-[11px] text-slate-500">No screenshots.</div>
                            ) : imageSourceOptions.map((key) => (
                              <label
                                key={key || '__blank__'}
                                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-900 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedImageSources.includes(key)}
                                  onChange={() => toggleImageSource(key)}
                                  className="accent-cyan-500"
                                />
                                <span className="font-mono text-[11px] text-slate-200 truncate">
                                  {key || '(Blank)'}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>,
                        document.body,
                      )}
                    </th>
                    <th className="p-3 bg-slate-950">
                      <button
                        type="button"
                        onClick={() => toggleSort('position')}
                        className={`inline-flex items-center gap-1.5 hover:text-slate-200 ${sortKey === 'position' ? 'text-slate-200' : 'text-slate-400'}`}
                        title={sortKey === 'position' && sortDir === 'desc' ? 'Sort C1 R1 first' : 'Sort C8 R5 first'}
                      >
                        OCR position
                        {sortKey === 'position' && sortDir === 'desc' ? <ArrowUp10 size={13} /> : <ArrowDown01 size={13} />}
                      </button>
                    </th>
                    <th className="p-3 bg-slate-950">OCR value</th>
                    <th className="p-3 bg-slate-950">
                      <button
                        type="button"
                        onClick={() => setStateFilter((current) => (
                          current === 'all' ? 'match' : current === 'match' ? 'unmatch' : 'all'
                        ))}
                        className={`inline-flex items-center gap-1.5 hover:text-slate-200 ${stateFilter === 'all' ? 'text-slate-400' : stateFilter === 'match' ? 'text-cyan-400' : 'text-amber-400'}`}
                        title={stateFilter === 'all' ? 'Filter match' : stateFilter === 'match' ? 'Filter unmatch' : 'Show all OCR states'}
                      >
                        {stateFilter === 'all' ? 'OCR state' : stateFilter}
                        <Filter size={12} />
                      </button>
                    </th>
                    <th className="p-3 bg-slate-950">OCR confidence</th>
                    <th className="p-3 bg-slate-950 text-center">
                      <button
                        type="button"
                        onClick={() => setMarkFilter((current) => (current === 'O' ? 'all' : 'O'))}
                        className={`inline-flex items-center justify-center gap-1 hover:text-slate-200 ${markFilter === 'O' ? 'text-emerald-400' : 'text-slate-400'}`}
                        title={markFilter === 'O' ? 'Show all marks' : 'Filter O present'}
                      >
                        O
                        <Filter size={12} />
                      </button>
                    </th>
                    <th className="p-3 bg-slate-950 text-center">
                      <button
                        type="button"
                        onClick={() => setMarkFilter((current) => (current === 'X' ? 'all' : 'X'))}
                        className={`inline-flex items-center justify-center gap-1 hover:text-slate-200 ${markFilter === 'X' ? 'text-rose-400' : 'text-slate-400'}`}
                        title={markFilter === 'X' ? 'Show all marks' : 'Filter X absent'}
                      >
                        X
                        <Filter size={12} />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRoster.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-500">No members match this filter.</td>
                    </tr>
                  ) : filteredRoster.map((row) => (
                    <tr key={row.uid} className={`border-t border-slate-800 ${row.present ? 'bg-emerald-950/15' : ''}`}>
                      <td className="p-3 overflow-hidden">
                        <div className="text-sm font-semibold text-slate-100 truncate">{memberName(row)}</div>
                        {row.inGameName && row.inGameName !== memberName(row) && (
                          <div className="text-[11px] text-slate-500 truncate">IGN {row.inGameName}</div>
                        )}
                      </td>
                      <td className="p-3 overflow-hidden">
                        {row.imageSource && Number.isInteger(row.imageIndex) ? (
                          <button
                            type="button"
                            onClick={() => setShotIndex(row.imageIndex)}
                            className="font-mono text-cyan-400/90 hover:text-cyan-300 truncate block w-full text-left"
                            title="Show this screenshot"
                          >
                            {row.imageSource}
                          </button>
                        ) : (
                          <span className="font-mono text-slate-500 truncate block">{row.imageSource || '—'}</span>
                        )}
                      </td>
                      <td className="p-3 font-mono text-slate-300 truncate">
                        {row.ocrPosition || formatOcrPosition(row.ocrCol, row.ocrRow)}
                      </td>
                      <td className="p-3 font-mono text-slate-300 truncate">{row.ocrText || '—'}</td>
                      <td className="p-3 overflow-hidden">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${row.ocrState === 'match' ? 'text-cyan-400' : 'text-amber-400'}`}>
                          {row.ocrState}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-slate-300 truncate">
                        {row.ocrState === 'match' ? `${row.ocrConfidence}%` : '0%'}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          disabled={!draft || busy}
                          onClick={() => setPresent(row.uid, true)}
                          className={`w-9 h-9 rounded-lg text-xs font-black disabled:opacity-40 ${row.present ? 'bg-emerald-600 text-white' : 'border border-slate-700 text-slate-500 hover:text-slate-200'}`}
                        >
                          O
                        </button>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          disabled={!draft || busy}
                          onClick={() => setPresent(row.uid, false)}
                          className={`w-9 h-9 rounded-lg text-xs font-black disabled:opacity-40 ${!row.present ? 'bg-rose-600 text-white' : 'border border-slate-700 text-slate-500 hover:text-slate-200'}`}
                        >
                          X
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
      </div>
    </div>
  );
}

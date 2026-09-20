const STORAGE_KEY = 'valhalla_ocr_review_session';
const shotCache = new Map();
let pendingFiles = [];
let pendingEventKey = '';

export function readOcrUiSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function writeOcrUiSession(patch) {
  const next = { ...readOcrUiSession(), ...patch };
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function clearOcrUiSession() {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function cacheReviewShots(reviewId, urls) {
  if (!reviewId || !urls?.length) return;
  shotCache.set(String(reviewId), urls.filter(Boolean));
}

export function getCachedReviewShots(reviewId) {
  return shotCache.get(String(reviewId || '')) || [];
}

export function clearCachedReviewShots(reviewId) {
  if (reviewId) shotCache.delete(String(reviewId));
}

export function setPendingUpload(eventKey, files) {
  pendingEventKey = eventKey || '';
  pendingFiles = Array.isArray(files) ? files : [];
}

export function getPendingUpload() {
  return { eventKey: pendingEventKey, files: pendingFiles };
}

export function clearPendingUpload() {
  pendingEventKey = '';
  pendingFiles = [];
}

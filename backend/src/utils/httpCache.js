export function normalizeEtag(value) {
  return String(value || '').replace(/^W\//, '').replaceAll('"', '').trim();
}

export function setEtag(res, etag) {
  if (!etag) return;
  res.set('ETag', `"${etag}"`);
  res.set('Cache-Control', 'private, no-cache');
}

/** Empty body. The browser already has this payload. */
export function sendNotModified(res, etag) {
  setEtag(res, etag);
  return res.status(304).end();
}

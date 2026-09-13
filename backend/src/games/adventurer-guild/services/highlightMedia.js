import { getSupabaseAdmin, LOGO_BUCKET } from '../../../services/guildLogo.js';

export const HIGHLIGHT_MAX_BYTES = 25 * 1024 * 1024;

export function detectHighlightType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { mime: 'image/png', ext: 'png', kind: 'image' };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg', kind: 'image' };
  }
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return { mime: 'image/gif', ext: 'gif', kind: 'image' };
  }
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46
    && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return { mime: 'image/webp', ext: 'webp', kind: 'image' };
  }
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return { mime: 'video/webm', ext: 'webm', kind: 'video' };
  }
  const box = buffer.slice(4, 8).toString('ascii');
  if (box === 'ftyp') {
    return { mime: 'video/mp4', ext: 'mp4', kind: 'video' };
  }
  return null;
}

export async function uploadHighlightMedia(tenantId, highlightId, buffer) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { ok: false, status: 503, error: 'Highlight storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' };
  }
  if (!buffer || buffer.length > HIGHLIGHT_MAX_BYTES) {
    return { ok: false, status: 400, error: 'File must be 25 MB or smaller.' };
  }
  const kind = detectHighlightType(buffer);
  if (!kind) {
    return { ok: false, status: 400, error: 'Use png, jpg, gif, webp, mp4, or webm.' };
  }
  const objectPath = `${tenantId}/highlights/${highlightId}.${kind.ext}`;
  const { error } = await supabase.storage.from(LOGO_BUCKET).upload(objectPath, buffer, {
    contentType: kind.mime,
    upsert: true,
  });
  if (error) {
    return { ok: false, status: 502, error: error.message || 'Could not store the highlight.' };
  }
  const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(objectPath);
  const publicUrl = String(data?.publicUrl || '').trim();
  if (!publicUrl) {
    return { ok: false, status: 502, error: 'Could not read the stored highlight URL.' };
  }
  return {
    ok: true,
    url: `${publicUrl}?v=${Date.now()}`,
    mime: kind.mime,
    ext: kind.ext,
    kind: kind.kind,
    objectPath,
    size: buffer.length,
  };
}

export async function deleteHighlightMedia(objectPath) {
  const supabase = getSupabaseAdmin();
  if (!supabase || !objectPath) return { ok: true };
  const { error } = await supabase.storage.from(LOGO_BUCKET).remove([objectPath]);
  if (error) {
    return { ok: false, status: 502, error: error.message || 'Could not remove the highlight file.' };
  }
  return { ok: true };
}

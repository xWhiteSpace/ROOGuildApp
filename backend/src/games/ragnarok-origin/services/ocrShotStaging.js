/**
 * Private Supabase staging for Party OCR screenshots.
 * Paths only are saved on the review. Bytes are never written to the tenant store.
 * Signed URLs are minted on read. Files are removed on Commit/Cancel.
 */
import { getSupabaseAdmin } from '../../../services/guildLogo.js';
import { getCurrentTenantId } from '../../../db/tenantContext.js';

export const OCR_STAGING_BUCKET = 'ocr-staging';
export const OCR_STAGING_TTL_MS = 24 * 60 * 60 * 1000;
const SIGNED_TTL_SEC = 24 * 60 * 60;

let bucketReady = null;

function safeId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'x';
}

function detectShotType(buffer, fileName = '') {
  if (buffer?.length >= 12) {
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      return { mime: 'image/png', ext: 'png' };
    }
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return { mime: 'image/jpeg', ext: 'jpg' };
    }
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
      return { mime: 'image/gif', ext: 'gif' };
    }
    if (
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46
      && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
    ) {
      return { mime: 'image/webp', ext: 'webp' };
    }
  }
  const name = String(fileName || '').toLowerCase();
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return { mime: 'image/jpeg', ext: 'jpg' };
  if (name.endsWith('.webp')) return { mime: 'image/webp', ext: 'webp' };
  if (name.endsWith('.gif')) return { mime: 'image/gif', ext: 'gif' };
  return { mime: 'image/png', ext: 'png' };
}

async function ensureBucket(supabase) {
  if (bucketReady) return bucketReady;
  bucketReady = (async () => {
    const { data } = await supabase.storage.getBucket(OCR_STAGING_BUCKET);
    if (data) return;
    const { error } = await supabase.storage.createBucket(OCR_STAGING_BUCKET, {
      public: false,
      fileSizeLimit: '8MB',
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    });
    if (error && !/already exists/i.test(String(error.message || ''))) {
      bucketReady = null;
      throw error;
    }
  })();
  return bucketReady;
}

function stagingPrefix(tenantId, reviewId) {
  return `${safeId(tenantId)}/${safeId(reviewId)}`;
}

export async function stageOcrShots(reviewId, inputs) {
  const tenantId = getCurrentTenantId();
  const supabase = getSupabaseAdmin();
  if (!tenantId || !supabase || !reviewId || !inputs?.length) return [];
  await ensureBucket(supabase);
  const prefix = stagingPrefix(tenantId, reviewId);
  const paths = [];
  for (let i = 0; i < inputs.length; i += 1) {
    const buffer = inputs[i]?.buffer;
    if (!Buffer.isBuffer(buffer) || !buffer.length) continue;
    const kind = detectShotType(buffer, inputs[i]?.name);
    const objectPath = `${prefix}/${i}.${kind.ext}`;
    const { error } = await supabase.storage.from(OCR_STAGING_BUCKET).upload(objectPath, buffer, {
      contentType: kind.mime,
      upsert: true,
    });
    if (error) throw error;
    paths.push(objectPath);
  }
  return paths;
}

export async function signStagedOcrShots(paths) {
  const supabase = getSupabaseAdmin();
  const list = (paths || []).map(String).filter(Boolean);
  if (!supabase || !list.length) return [];
  await ensureBucket(supabase).catch(() => {});
  const { data, error } = await supabase.storage.from(OCR_STAGING_BUCKET).createSignedUrls(list, SIGNED_TTL_SEC);
  if (error) {
    console.warn('OCR staging sign failed:', error.message);
    return [];
  }
  return (data || []).map((row) => String(row?.signedUrl || '')).filter(Boolean);
}

export async function downloadStagedOcrShots(paths) {
  const supabase = getSupabaseAdmin();
  const list = (paths || []).map(String).filter(Boolean);
  if (!supabase || !list.length) return [];
  await ensureBucket(supabase).catch(() => {});
  const out = [];
  for (const objectPath of list) {
    const { data, error } = await supabase.storage.from(OCR_STAGING_BUCKET).download(objectPath);
    if (error || !data) continue;
    const buf = Buffer.from(await data.arrayBuffer());
    if (buf.length) out.push(buf);
  }
  return out;
}

export async function deleteStagedOcrShots(paths) {
  const supabase = getSupabaseAdmin();
  const list = (paths || []).map(String).filter(Boolean);
  if (!supabase || !list.length) return { ok: true };
  const { error } = await supabase.storage.from(OCR_STAGING_BUCKET).remove(list);
  if (error) {
    console.warn('OCR staging delete failed:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function resolveReviewShotUrls(review) {
  const discord = (review?.source?.attachmentUrls || []).filter(Boolean);
  if (discord.length) return discord;
  return signStagedOcrShots(review?.source?.stagingPaths);
}

export async function purgeReviewStaging(review) {
  const paths = review?.source?.stagingPaths;
  if (!paths?.length) return;
  await deleteStagedOcrShots(paths);
  if (review.source) review.source.stagingPaths = [];
}

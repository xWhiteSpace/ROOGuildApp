/**
 * GVG Attendance drafts: website upload, O/X, and Commit. Discord scans keep CDN URLs.
 * Website uploads stage on private Supabase until Commit/Cancel.
 */
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import { getTenantStore } from '../../../db/database.js';
import { discordChannel } from '../../../db/channels.js';
import { getTenant } from '../../../db/tenants.js';
import { getCachedConfig } from '../../../db/tenantContext.js';
import { isTenantOfficer, roleTokensFromMember } from '../../../auth/officer.js';
import { parseCompositeKey } from '../../../utils/guildTime.js';
import { enqueueDiscordCall, isDiscordCircuitOpen } from '../../../utils/discordRateLimit.js';
import { annotateShotBuffer, enqueueOcrJob, ocrPartyImages } from './partyOcr.js';
import { claimOcrCorrection, releaseOcrCorrection } from '@guildname/shared/inGameAlias';
import { downloadStagedOcrShots, purgeReviewStaging, stageOcrShots } from './ocrShotStaging.js';
import {
  commitInGameForEvent,
  inGameStatusMapFromPresent,
  raidRosterUids,
} from './inGameStatus.js';
import { valhallaEnv } from '../../../config/valhallaEnv.js';

const EMBED_COLOR = '#0891b2';
const MAX_ATTACHMENTS = 8;
/** Website-upload screenshots held until Commit/Cancel. Never written to the store. */
const websiteShots = new Map();
const WEBSITE_SHOT_TTL_MS = 2 * 60 * 60 * 1000;

function newReviewId() {
  return `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

async function requireReadyClient() {
  const { discordClient } = await import('../../../discord-bot/client.js');
  const { getDiscordRateLimitStatus } = await import('../../../utils/discordRateLimit.js');
  if (!discordClient || !discordClient.isReady()) {
    throw new Error('Discord bot gateway is not connected on this backend.');
  }
  if (isDiscordCircuitOpen()) {
    const status = getDiscordRateLimitStatus();
    const when = status.circuitUntilHuman || status.remainingHuman || 'later';
    throw new Error(`Discord is temporarily blocking this server IP. Try again after ${when}.`);
  }
  return discordClient;
}

export async function isDiscordOfficerInteraction(interaction) {
  const tenantId = interaction.guildId;
  let member = interaction.member;
  if (interaction.guild) {
    member = await interaction.guild.members.fetch(interaction.user.id).catch(() => interaction.member);
  }
  const tenant = tenantId ? await getTenant(tenantId).catch(() => null) : null;
  const config = getCachedConfig(tenantId) || {};
  return isTenantOfficer(
    { id: interaction.user.id, roles: roleTokensFromMember(member) },
    {
      ownerDiscordId: tenant?.owner_discord_id,
      adminRoles: config.adminRoles,
      tenantId,
    }
  );
}

async function denyIfNotOfficer(interaction) {
  if (await isDiscordOfficerInteraction(interaction)) return false;
  const payload = { content: 'Officer access required for Party OCR.', embeds: [], components: [] };
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ ...payload, ephemeral: true });
    } else {
      await interaction.reply({ ...payload, ephemeral: true });
    }
  } catch {
    /* token already dead */
  }
  return true;
}

function ocrCardEmbed({ description, fields, footer, authorName, image }) {
  const embed = new EmbedBuilder()
    .setTitle('Party OCR')
    .setColor(EMBED_COLOR)
    .setDescription(description)
    .setTimestamp();
  if (authorName) embed.setAuthor({ name: authorName });
  if (Array.isArray(fields) && fields.length) embed.addFields(fields);
  if (footer) embed.setFooter({ text: footer });
  if (image) embed.setImage(image);
  return embed;
}

async function editOcrCard(interaction, payload, session) {
  const messageId = session?.activityMessageId || interaction?.message?.id;
  if (interaction?.deferred && interaction.message?.id && interaction.message.id === messageId) {
    await interaction.editReply(payload);
    return;
  }
  const channelId = session?.activityChannelId || interaction?.channelId;
  if (!channelId || !messageId) return;
  const discordClient = await requireReadyClient();
  const channel = await enqueueDiscordCall(() => discordClient.channels.fetch(channelId));
  const msg = await enqueueDiscordCall(() => channel.messages.fetch(messageId));
  await enqueueDiscordCall(() => msg.edit(payload));
}

export async function loadReview(reviewId) {
  const db = getTenantStore();
  const snap = await db.ref(`attendance/ocr_reviews/${reviewId}`).once('value');
  return snap.exists() ? snap.val() : null;
}

export async function saveReview(review) {
  const db = getTenantStore();
  await db.ref(`attendance/ocr_reviews/${review.id}`).set(review);
}

export async function saveReviewFields(review, fields) {
  const db = getTenantStore();
  const updates = {};
  for (const field of fields) {
    updates[`attendance/ocr_reviews/${review.id}/${field}`] = review[field];
  }
  if (Object.keys(updates).length) await db.ref().update(updates);
}

export async function deleteReview(review, members = {}) {
  if (!review?.id) return false;
  clearWebsiteShots(review.id);
  await purgeReviewStaging(review).catch(() => {});
  const db = getTenantStore();
  await db.ref(`attendance/ocr_reviews/${review.id}`).remove();
  await refreshReviewMessage({ ...review, status: 'cancelled' }, members, null).catch(() => {});
  return true;
}

export function stashWebsiteShots(reviewId, buffers) {
  if (!reviewId || !buffers?.length) return;
  const copies = buffers.map((buf) => Buffer.from(buf));
  websiteShots.set(reviewId, { buffers: copies, storedAt: Date.now() });
}

export function peekWebsiteShots(reviewId) {
  const row = websiteShots.get(reviewId);
  if (!row?.buffers?.length) return [];
  if (Date.now() - Number(row.storedAt || 0) > WEBSITE_SHOT_TTL_MS) return [];
  return row.buffers;
}

export function takeWebsiteShots(reviewId) {
  const buffers = peekWebsiteShots(reviewId);
  websiteShots.delete(reviewId);
  return buffers;
}

export function clearWebsiteShots(reviewId) {
  websiteShots.delete(reviewId);
}

function presentSet(review) {
  return new Set(Object.keys(review.present || {}));
}

export function ocrMatchForUid(review, uid) {
  const fromMatches = review?.ocrMatches?.[uid];
  if (fromMatches) return fromMatches;
  const hit = review?.present?.[uid];
  if (hit && (hit.ocrText || (Number(hit.score) > 0 && hit.source !== 'officer'))) return hit;
  return null;
}

export function ocrConfidencePct(hit) {
  const score = Number(hit?.score);
  if (!Number.isFinite(score) || score <= 0) return 0;
  return Math.round(Math.min(1, score) * 100);
}

function reviewCounts(review) {
  const matches = Object.keys(review.ocrMatches || {}).length || Object.keys(review.present || {}).length;
  const unmatched = Array.isArray(review.unmatched) ? review.unmatched.length : 0;
  const present = Object.keys(review.present || {}).length;
  const absent = Array.isArray(review.absent) ? review.absent.length : 0;
  return { matches, unmatched, present, absent };
}

function buildReviewEmbed(review) {
  const shot = (review.source?.attachmentUrls || []).find(Boolean);
  const counts = reviewCounts(review);
  const url = reviewFixUrl(review.id);
  const statusLine = review.status === 'committed'
    ? 'Committed on VALHALLA. In-game swords only.'
    : review.status === 'cancelled'
      ? 'Cancelled. No swords were changed.'
      : url
        ? 'Open VALHALLA to mark O/X and Commit swords.'
        : 'Open Raid → GVG Attendance on VALHALLA to mark O/X and Commit.';
  return ocrCardEmbed({
    authorName: review.createdByName,
    description:
      `**${review.eventTitle || review.eventKey}** · ${review.eventDate || '—'}\n` +
      `OCR match ${counts.matches} · unmatch leftover ${counts.unmatched} · currently O ${counts.present} / X ${counts.absent}.\n` +
      statusLine,
    footer: review.status === 'draft' ? 'Review is on VALHALLA — this card is only a pointer.' : statusLine,
    image: shot,
  });
}

export function reviewRosterUids(review, members) {
  const present = new Set(Object.keys(review.present || {}));
  const absent = Array.isArray(review.absent) ? review.absent.map(String) : [];
  const inReview = new Set([...present, ...absent]);
  const seen = new Set();
  const out = [];
  for (const uid of raidRosterUids(members)) {
    if (!inReview.has(String(uid)) || seen.has(uid)) continue;
    seen.add(uid);
    out.push(uid);
  }
  for (const uid of inReview) {
    if (seen.has(uid)) continue;
    seen.add(uid);
    out.push(uid);
  }
  return out;
}

export function reviewFixUrl(reviewId) {
  const { frontendUrl } = valhallaEnv();
  if (!reviewId || !frontendUrl) return '';
  return `${frontendUrl}/attendance/ocr-review/${encodeURIComponent(reviewId)}`;
}

export function buildDraftReview({ members, event, ocrResult, createdBy, createdByName, source = {} }) {
  const roster = raidRosterUids(members);
  const ocrMatches = {};
  const present = {};
  for (const hit of ocrResult?.matched || []) {
    const row = {
      ocrText: hit.ocrText,
      score: hit.score,
      source: hit.via === 'dictionary' ? 'dictionary' : 'ocr',
      imageSource: hit.imageSource || '',
      imageIndex: Number.isInteger(hit.imageIndex) ? hit.imageIndex : null,
      ocrCol: hit.col ?? null,
      ocrRow: hit.row ?? null,
    };
    ocrMatches[hit.uid] = row;
    present[hit.uid] = row;
  }
  const parsed = parseCompositeKey(event.key);
  const slotGaps = (ocrResult?.slotGaps || []).map((gap, idx) => ({
    id: `g${idx}`,
    text: gap.text || '',
    category: gap.category || 'unmatch',
    imageSource: gap.imageSource || '',
    imageIndex: Number.isInteger(gap.imageIndex) ? gap.imageIndex : null,
    ocrCol: gap.col ?? null,
    ocrRow: gap.row ?? null,
  }));
  return {
    id: newReviewId(),
    status: 'draft',
    eventDate: event.date || parsed?.dateStr,
    eventKey: event.eventId || parsed?.eventId || event.key,
    eventTitle: event.title || event.eventId || event.key,
    createdBy,
    createdByName,
    createdAt: Date.now(),
    ocrMatches,
    present,
    absent: roster.filter((uid) => !present[uid]),
    unmatched: slotGaps.filter((gap) => gap.category === 'unmatch'),
    slotGaps,
    occupied: Number.isFinite(ocrResult?.occupied) ? ocrResult.occupied : null,
    overlays: Array.isArray(ocrResult?.overlays) ? ocrResult.overlays : [],
    source,
  };
}

function eventFromInstance(key, inst) {
  const parsed = parseCompositeKey(key);
  return {
    key,
    ...(inst && typeof inst === 'object' ? inst : {}),
    date: inst?.date || parsed?.dateStr || '',
    eventId: inst?.eventId || parsed?.eventId || '',
    title: inst?.title || inst?.eventId || parsed?.eventId || key,
    timeStart: inst?.timeStart || '',
  };
}

export async function listOcrEvents() {
  const db = getTenantStore();
  const snap = await db.ref('scheduler/instances').once('value');
  const map = snap.exists() ? snap.val() || {} : {};
  return Object.entries(map)
    .map(([key, inst]) => eventFromInstance(key, inst))
    .filter((ev) => ev.key && ev.isCancelled !== true)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(a.title || '').localeCompare(String(b.title || '')))
    .map((ev) => ({
      key: ev.key,
      date: ev.date || '',
      title: ev.title || ev.key,
      timeStart: ev.timeStart || '',
    }));
}

export async function resolveOcrEvent(eventKey) {
  const key = String(eventKey || '').trim();
  if (!key) return null;
  const db = getTenantStore();
  const snap = await db.ref(`scheduler/instances/${key}`).once('value');
  if (!snap.exists()) return null;
  const event = eventFromInstance(key, snap.val());
  if (event.isCancelled === true) return null;
  return event;
}

export async function createReviewFromBuffers({ buffers, fileNames = [], event, createdBy, createdByName, source = {} }) {
  const db = getTenantStore();
  const membersSnap = await db.ref('auction/members').once('value');
  const members = membersSnap.exists() ? membersSnap.val() : {};
  const inputs = (buffers || []).map((item, i) => {
    if (Buffer.isBuffer(item)) {
      return { buffer: item, name: (fileNames || [])[i] || `screenshot-${i + 1}.png` };
    }
    if (item && Buffer.isBuffer(item.buffer)) {
      return { buffer: item.buffer, name: item.name || (fileNames || [])[i] || `screenshot-${i + 1}.png` };
    }
    return { buffer: item, name: (fileNames || [])[i] || `screenshot-${i + 1}.png` };
  });
  const result = await enqueueOcrJob(() => ocrPartyImages(inputs, members));
  const review = buildDraftReview({
    members,
    event,
    ocrResult: result,
    createdBy,
    createdByName,
    source: {
      ...source,
      fileNames: inputs.map((row) => row.name),
    },
  });
  await saveReview(review);
  if (source.kind === 'website') {
    stashWebsiteShots(review.id, inputs.map((row) => row.buffer));
    try {
      const stagingPaths = await stageOcrShots(review.id, inputs);
      if (stagingPaths.length) {
        review.source = { ...review.source, stagingPaths, stagedAt: Date.now() };
        await saveReview(review);
      }
    } catch (err) {
      console.warn('OCR staging upload failed:', err.message);
    }
  }
  return { review, members };
}

export function applyPresentUids(review, presentUids, members) {
  const want = new Set((Array.isArray(presentUids) ? presentUids : []).map(String));
  const roster = reviewRosterUids(review, members);
  const nextPresent = {};
  const nextAbsent = [];
  for (const uid of roster) {
    const key = String(uid);
    if (want.has(key)) {
      const hit = review.ocrMatches?.[key] || review.present?.[key] || review.present?.[uid];
      nextPresent[key] = hit || { ocrText: '', score: 0, source: 'officer' };
    } else {
      nextAbsent.push(key);
    }
  }
  review.present = nextPresent;
  review.absent = nextAbsent;
}

export function assignUnmatched(review, unmatchedId, uid) {
  const unmatched = (review.unmatched || []).find((u) => u.id === unmatchedId);
  if (!uid) return false;
  const hit = {
    ocrText: unmatched?.text || '',
    score: 1,
    source: 'dictionary',
    imageSource: unmatched?.imageSource || '',
    imageIndex: Number.isInteger(unmatched?.imageIndex) ? unmatched.imageIndex : null,
    ocrCol: unmatched?.ocrCol ?? unmatched?.col ?? null,
    ocrRow: unmatched?.ocrRow ?? unmatched?.row ?? null,
  };
  review.ocrMatches = review.ocrMatches || {};
  review.ocrMatches[uid] = hit;
  review.present = review.present || {};
  review.present[uid] = hit;
  review.absent = (review.absent || []).filter((id) => id !== uid);
  review.unmatched = (review.unmatched || []).filter((u) => u.id !== unmatchedId);
  review.slotGaps = (review.slotGaps || []).filter((gap) => gap.id !== unmatchedId);
  review.pendingUnmatchedId = null;
  return true;
}

export function linkOcrReading(review, { unmatchedId, fromUid, toUid, text, remember }) {
  if (!toUid) return false;
  const unmatched = unmatchedId
    ? (review.unmatched || []).find((row) => row.id === unmatchedId)
      || (review.slotGaps || []).find((row) => row.id === unmatchedId)
    : null;
  const previous = fromUid ? (review.ocrMatches?.[fromUid] || null) : null;
  const hit = {
    ocrText: text || unmatched?.text || previous?.ocrText || '',
    score: 1,
    source: remember === false ? 'officer' : 'dictionary',
    imageSource: unmatched?.imageSource || previous?.imageSource || '',
    imageIndex: Number.isInteger(unmatched?.imageIndex)
      ? unmatched.imageIndex
      : (Number.isInteger(previous?.imageIndex) ? previous.imageIndex : null),
    ocrCol: unmatched?.ocrCol ?? unmatched?.col ?? previous?.ocrCol ?? null,
    ocrRow: unmatched?.ocrRow ?? unmatched?.row ?? previous?.ocrRow ?? null,
  };
  review.ocrMatches = review.ocrMatches || {};
  review.present = review.present || {};
  if (fromUid && fromUid !== toUid) {
    delete review.ocrMatches[fromUid];
    delete review.present[fromUid];
    const absent = (review.absent || []).filter((id) => id !== fromUid);
    absent.push(fromUid);
    review.absent = absent;
  }
  review.ocrMatches[toUid] = hit;
  review.present[toUid] = hit;
  review.absent = (review.absent || []).filter((id) => id !== toUid);
  if (unmatchedId) {
    review.unmatched = (review.unmatched || []).filter((row) => row.id !== unmatchedId);
    review.slotGaps = (review.slotGaps || []).filter((gap) => gap.id !== unmatchedId);
    review.pendingUnmatchedId = null;
  }
  return true;
}

export function unlinkOcrReading(review, uid) {
  const id = String(uid || '');
  const hit = id ? review.ocrMatches?.[id] : null;
  const text = String(hit?.ocrText || '').trim();
  const col = hit?.ocrCol ?? null;
  const ocrRow = hit?.ocrRow ?? null;
  if (!hit || (!text && col == null && ocrRow == null)) return null;
  delete review.ocrMatches[id];
  if (review.present?.[id]) {
    review.present[id] = { ocrText: '', score: 0, source: 'officer' };
  }
  const gap = {
    id: `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    text,
    category: text ? 'unmatch' : 'missing',
    imageSource: hit.imageSource || '',
    imageIndex: Number.isInteger(hit.imageIndex) ? hit.imageIndex : null,
    ocrCol: col,
    ocrRow,
  };
  review.slotGaps = [...(review.slotGaps || []), gap];
  if (text) review.unmatched = [...(review.unmatched || []), gap];
  return gap;
}

export async function persistOcrRelease(db, members, uid, text) {
  const next = releaseOcrCorrection(members, uid, text);
  if (!next) return false;
  if (members[uid]) members[uid] = { ...members[uid], ocrCorrections: next };
  await db.ref(`auction/members/${uid}/ocrCorrections`).set(next.length ? next : null);
  return true;
}

export async function persistOcrClaim(db, members, uid, text) {
  const changed = claimOcrCorrection(members, uid, text);
  if (!changed) return false;
  const updates = {};
  for (const [id, list] of Object.entries(changed)) {
    updates[`auction/members/${id}/ocrCorrections`] = list;
    if (members[id]) members[id] = { ...members[id], ocrCorrections: list };
  }
  if (Object.keys(updates).length) await db.ref().update(updates);
  return true;
}

export async function persistReviewDictionary(db, review, members) {
  const seen = new Set();
  const rows = [
    ...Object.entries(review?.ocrMatches || {}),
    ...Object.entries(review?.present || {}),
  ];
  for (const [uid, hit] of rows) {
    if (hit?.source !== 'dictionary') continue;
    const text = String(hit?.ocrText || '').trim();
    if (!text) continue;
    const key = `${uid}:${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await persistOcrClaim(db, members, uid, text);
  }
}

export async function finalizeOcrCommit(review, members, committedBy) {
  const db = getTenantStore();
  await persistReviewDictionary(db, review, members);
  const roster = raidRosterUids(members);
  const statusMap = inGameStatusMapFromPresent([...presentSet(review)], roster);
  const result = await commitInGameForEvent(db, {
    eventDate: review.eventDate,
    eventKey: review.eventKey,
    statusMap,
    reviewId: review.id,
    committedBy,
    gvgResult: review.gvgResult,
  });
  review.status = 'committed';
  review.committedAt = Date.now();
  review.commitMode = result.mode;
  const gallery = await postGallery(review, committedBy).catch((err) => ({ posted: false, reason: err.message }));
  await purgeReviewStaging(review).catch(() => {});
  clearWebsiteShots(review.id);
  await db.ref(`attendance/ocr_reviews/${review.id}`).remove();
  const swordNote = result.mode === 'archive'
    ? 'In-game swords updated on the archived raid.'
    : 'End Raid has not happened yet — swords are pending and will light when this event is archived.';
  const galleryNote = gallery.posted
    ? ' Screenshot posted to Raid Screenshot.'
    : gallery.reason === 'unmapped'
      ? ' Raid Screenshot channel is not mapped (Settings).'
      : gallery.reason === 'download-failed' || gallery.reason === 'no-urls'
        ? ' Could not re-post the screenshot (original message missing?).'
        : '';
  return { statusMap, result, gallery, swordNote, galleryNote };
}

export function buildReviewComponents(review) {
  if (review.status !== 'draft') return [];
  const url = reviewFixUrl(review.id);
  if (!/^https?:\/\//i.test(url)) return [];
  try {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Open VALHALLA').setURL(url)
      ),
    ];
  } catch {
    return [];
  }
}

export async function refreshReviewMessage(review, members, interaction) {
  const payload = {
    content: null,
    embeds: [buildReviewEmbed(review, members)],
    components: buildReviewComponents(review),
  };
  const session = {
    activityChannelId: review.reviewChannelId,
    activityMessageId: review.reviewMessageId,
  };
  await editOcrCard(interaction, payload, session);
}


async function fetchAttachmentBuffer(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Failed to download screenshot (${res.status}).`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf;
}

async function postGallery(review, committedBy) {
  const channelId = discordChannel('DISCORD_RAID_SCREENSHOT_CHANNEL_ID');
  if (!channelId) return { posted: false, reason: 'unmapped' };
  const urls = (review.source?.attachmentUrls || []).filter(Boolean).slice(0, MAX_ATTACHMENTS);
  const discordClient = await requireReadyClient();
  const channel = await enqueueDiscordCall(() => discordClient.channels.fetch(channelId)).catch(() => null);
  if (!channel) return { posted: false, reason: 'missing-channel' };

  const embed = new EmbedBuilder()
    .setTitle('Raid screenshot')
    .setColor(EMBED_COLOR)
    .setDescription(`**${review.eventTitle || review.eventKey}** · ${review.eventDate || '—'}`)
    .setFooter({ text: `Committed by ${committedBy || 'Officer'}` })
    .setTimestamp();

  const files = [];
  try {
    for (let i = 0; i < urls.length; i += 1) {
      try {
        const raw = await fetchAttachmentBuffer(urls[i]);
        const overlay = (review.overlays || []).find((row) => row.imageIndex === i) || (review.overlays || [])[i];
        const buf = overlay ? await annotateShotBuffer(raw, overlay) : raw;
        files.push({ attachment: buf, name: `raid-${review.eventDate || 'shot'}-${i + 1}.png` });
      } catch {
        /* skip a dead CDN url */
      }
    }
    if (!files.length) {
      const stashed = peekWebsiteShots(review.id);
      for (let i = 0; i < stashed.length; i += 1) {
        const overlay = (review.overlays || []).find((row) => row.imageIndex === i) || (review.overlays || [])[i];
        const buf = overlay ? await annotateShotBuffer(stashed[i], overlay) : stashed[i];
        files.push({ attachment: buf, name: `raid-${review.eventDate || 'shot'}-${i + 1}.png` });
      }
    }
    if (!files.length) {
      const staged = await downloadStagedOcrShots(review.source?.stagingPaths);
      for (let i = 0; i < staged.length; i += 1) {
        const overlay = (review.overlays || []).find((row) => row.imageIndex === i) || (review.overlays || [])[i];
        const buf = overlay ? await annotateShotBuffer(staged[i], overlay) : staged[i];
        files.push({ attachment: buf, name: `raid-${review.eventDate || 'shot'}-${i + 1}.png` });
      }
    }
    if (!files.length) return { posted: false, reason: 'download-failed' };
    await enqueueDiscordCall(() => channel.send({ embeds: [embed], files }));
    return { posted: true };
  } finally {
    files.length = 0;
  }
}

export async function handlePartyOcrInteraction(interaction) {
  const customId = interaction.customId || '';
  if (await denyIfNotOfficer(interaction)) return;

  const { partyOcrInteractionKind, RETIRED_OCR_CARD_TEXT, runCreateDraftFromThread } = await import('./partyOcrPrompt.js');
  const kind = partyOcrInteractionKind(customId);
  if (kind === 'retired') {
    await interaction.followUp({ content: RETIRED_OCR_CARD_TEXT, ephemeral: true }).catch(() => {});
    return;
  }
  if (kind === 'create-draft') {
    await runCreateDraftFromThread(interaction);
    return;
  }

  const parts = customId.split(':');
  const action = parts[1];
  const reviewId = parts[2];
  if (!reviewId) return;
  const review = await loadReview(reviewId);
  if (!review) {
    await editOcrCard(interaction, {
      content: null,
      embeds: [ocrCardEmbed({
        description: 'This OCR review is no longer active.',
      })],
      components: [],
    }, null);
    return;
  }
  const db = getTenantStore();
  const membersSnap = await db.ref('auction/members').once('value');
  const members = membersSnap.exists() ? membersSnap.val() : {};
  if (action === 'commit' || action === 'cancel' || action === 'assign') {
    await refreshReviewMessage(review, members, interaction);
  }
}

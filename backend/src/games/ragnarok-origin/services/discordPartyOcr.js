/**
 * Officer Party OCR activity card: Scan → event → screenshot, then hand off to
 * VALHALLA. Review, O/X, and Commit live on the website. Image bytes are not
 * written to the tenant store. Website uploads stage on private Supabase until
 * Commit/Cancel (RAM stash remains a fallback). Discord scans keep CDN URLs.
 */
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import { getTenantStore } from '../../../db/database.js';
import { discordChannel } from '../../../db/channels.js';
import { getTenant, loadTenantSettings, mergeChannelFallback } from '../../../db/tenants.js';
import { getCachedConfig, runWithTenant, setCachedConfig, setCachedChannels } from '../../../db/tenantContext.js';
import { isTenantOfficer, roleTokensFromMember } from '../../../auth/officer.js';
import { listUpcomingInstances } from './attendanceDecision.js';
import { parseCompositeKey } from '../../../utils/guildTime.js';
import { enqueueDiscordCall, isDiscordCircuitOpen } from '../../../utils/discordRateLimit.js';
import { enqueueOcrJob, ocrPartyImages } from './partyOcr.js';
import { downloadStagedOcrShots, purgeReviewStaging, stageOcrShots } from './ocrShotStaging.js';
import {
  commitInGameForEvent,
  inGameStatusMapFromPresent,
  raidRosterUids,
} from './inGameStatus.js';
import { valhallaEnv } from '../../../config/valhallaEnv.js';

const EMBED_COLOR = '#0891b2';
const CARD_PATH = 'attendance/ocr_card';
const IMAGE_WAIT_MS = 90_000;
const SELECT_LIMIT = 25;
const MAX_ATTACHMENTS = 8;
const LOOKBACK_MESSAGES = 30;
/** Public activity-card sessions, keyed by the card message id. */
const activitySessions = new Map();
/** Website-upload screenshots held until Commit/Cancel. Never written to the store. */
const websiteShots = new Map();
const WEBSITE_SHOT_TTL_MS = 2 * 60 * 60 * 1000;

function sessionFor(interaction) {
  const id = interaction?.message?.id;
  return id ? activitySessions.get(id) : null;
}

async function withInteractionTenant(interaction, fn) {
  const guildId = interaction.guildId;
  if (!guildId) return fn();
  const tenant = await getTenant(guildId).catch(() => null);
  if (tenant) {
    const settings = await loadTenantSettings(guildId);
    setCachedConfig(guildId, settings.configuration);
    setCachedChannels(guildId, mergeChannelFallback(settings.discordChannels));
  }
  return runWithTenant(guildId, fn);
}

async function resolveScanChannel(interaction) {
  const channelId = interaction.channelId;
  if (interaction.channel?.createMessageCollector) return interaction.channel;
  if (!channelId) return null;
  const discordClient = await requireReadyClient();
  return enqueueDiscordCall(() => discordClient.channels.fetch(channelId)).catch(() => null);
}

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
      source: 'ocr',
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
    source,
  };
}

export async function listOcrEvents() {
  const upcoming = await listUpcomingInstances({ includePreviousWeek: true });
  return upcoming
    .slice()
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(a.title || '').localeCompare(String(b.title || '')))
    .map((ev) => ({
      key: ev.key,
      date: ev.date || '',
      title: ev.title || ev.eventId || ev.key,
      timeStart: ev.timeStart || '',
    }))
    .filter((ev) => ev.key);
}

export async function resolveOcrEvent(eventKey) {
  const upcoming = await listUpcomingInstances({ includePreviousWeek: true });
  return parseEventFromKey(upcoming, eventKey);
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
    source: 'officer',
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

export async function finalizeOcrCommit(review, members, committedBy) {
  const db = getTenantStore();
  const roster = raidRosterUids(members);
  const statusMap = inGameStatusMapFromPresent([...presentSet(review)], roster);
  const result = await commitInGameForEvent(db, {
    eventDate: review.eventDate,
    eventKey: review.eventKey,
    statusMap,
    reviewId: review.id,
    committedBy,
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

function isImageAttachment(att) {
  if (!att) return false;
  const name = String(att.name || '').toLowerCase();
  const type = String(att.contentType || '').toLowerCase();
  if (type.startsWith('image/')) return true;
  if (/\.(png|jpe?g|webp|gif|heic|heif|bmp)$/.test(name)) return true;
  if (Number(att.width) > 0 && Number(att.height) > 0) return true;
  return false;
}

function messageHasImage(message) {
  try {
    const atts = message?.attachments;
    if (!atts || typeof atts.values !== 'function') return false;
    return [...atts.values()].some(isImageAttachment);
  } catch {
    return false;
  }
}

async function findLatestOfficerImage(channel, userId) {
  if (!channel?.messages?.fetch) return null;
  const fetched = await enqueueDiscordCall(() => channel.messages.fetch({ limit: LOOKBACK_MESSAGES }));
  const messages = [...fetched.values()]
    .filter((m) => String(m.author?.id) === String(userId) && messageHasImage(m))
    .sort((a, b) => Number(b.createdTimestamp || 0) - Number(a.createdTimestamp || 0));
  return messages[0] || null;
}

async function fetchAttachmentBuffer(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Failed to download screenshot (${res.status}).`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf;
}

async function buildEventSelect(officerName) {
  const upcoming = await listUpcomingInstances({ includePreviousWeek: true });
  const options = upcoming
    .slice()
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(a.title || '').localeCompare(String(b.title || '')))
    .slice(0, SELECT_LIMIT)
    .map((ev) => ({
      label: `${ev.date || ''} ${ev.title || ev.eventId || ev.key}`.trim().slice(0, 100),
      value: String(ev.key).slice(0, 100),
      description: `${ev.timeStart || ''}`.slice(0, 100) || undefined,
    }))
    .filter((opt) => opt.value);
  if (!options.length) {
    return {
      content: null,
      embeds: [ocrCardEmbed({
        authorName: officerName,
        description: 'No calendar events found for last / this / next week.',
        footer: 'Add a raid on the calendar, then Scan again.',
      })],
      components: [],
    };
  }
  return {
    content: null,
    embeds: [ocrCardEmbed({
      authorName: officerName,
      description: 'Pick the raid event this Team Party screenshot belongs to.',
      footer: 'This card stays in the channel. Next: drop the screenshot.',
    })],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ocr:event')
          .setPlaceholder('Event date from calendar')
          .addOptions(options)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ocr:cancelscan').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

function publicOcrCard() {
  const embed = new EmbedBuilder()
    .setTitle('Party OCR')
    .setColor(EMBED_COLOR)
    .setDescription(
      'Officers: **Scan Party Screenshot** picks the event and drops the Team Party image here.\n' +
      'Review, O/X, and Commit swords happen on **VALHALLA** (Raid → GVG Attendance). You can also upload there.\n' +
      'Images are not saved in VALHALLA. After Commit they may be posted to the Raid Screenshot channel.'
    );
  return {
    content: null,
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ocr:open')
          .setLabel('Scan Party Screenshot')
          .setStyle(ButtonStyle.Primary)
      ),
    ],
  };
}

async function persistCardPointer(channelId, messageId) {
  const db = getTenantStore();
  await db.ref(CARD_PATH).set({ channelId, messageId, updatedAt: Date.now() });
}

export async function deployPublicOcrCardToWarAnnounce() {
  const channelId = discordChannel('DISCORD_WARANNOUNCE_CHANNEL_ID');
  if (!channelId) throw new Error('DISCORD_WARANNOUNCE_CHANNEL_ID is not configured.');
  const discordClient = await requireReadyClient();
  const targetChannel = await enqueueDiscordCall(() => discordClient.channels.fetch(channelId));
  if (!targetChannel) throw new Error('Discord gateway client failed to locate the war-announce channel.');
  const payload = publicOcrCard();
  const db = getTenantStore();
  const storedSnap = await db.ref(CARD_PATH).once('value');
  const stored = storedSnap.exists() ? storedSnap.val() : null;
  if (stored?.messageId && stored.channelId === channelId) {
    try {
      const existing = await enqueueDiscordCall(() => targetChannel.messages.fetch(stored.messageId));
      await enqueueDiscordCall(() => existing.edit(payload));
      await persistCardPointer(channelId, stored.messageId);
      return { posted: false, edited: true, messageId: stored.messageId };
    } catch {
      /* replace */
    }
  }
  const sent = await enqueueDiscordCall(() => targetChannel.send(payload));
  await persistCardPointer(channelId, sent.id);
  return { posted: true, edited: false, messageId: sent.id };
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
        const buf = await fetchAttachmentBuffer(urls[i]);
        files.push({ attachment: buf, name: `raid-${review.eventDate || 'shot'}-${i + 1}.png` });
      } catch {
        /* skip a dead CDN url */
      }
    }
    if (!files.length) {
      const stashed = peekWebsiteShots(review.id);
      stashed.forEach((buf, i) => {
        files.push({ attachment: buf, name: `raid-${review.eventDate || 'shot'}-${i + 1}.png` });
      });
    }
    if (!files.length) {
      const staged = await downloadStagedOcrShots(review.source?.stagingPaths);
      staged.forEach((buf, i) => {
        files.push({ attachment: buf, name: `raid-${review.eventDate || 'shot'}-${i + 1}.png` });
      });
    }
    if (!files.length) return { posted: false, reason: 'download-failed' };
    await enqueueDiscordCall(() => channel.send({ embeds: [embed], files }));
    return { posted: true };
  } finally {
    files.length = 0;
  }
}

async function runOcrAndPostReview({ interaction, event, sourceMessage, session }) {
  const buffers = [];
  try {
    const db = getTenantStore();
    const membersSnap = await db.ref('auction/members').once('value');
    const members = membersSnap.exists() ? membersSnap.val() : {};
    const attachments = [...sourceMessage.attachments.values()].filter(isImageAttachment).slice(0, MAX_ATTACHMENTS);
    if (!attachments.length) {
      await editOcrCard(interaction, waitingPayload(event, session, 'That message has no image attachments.'), session);
      return;
    }

    const officerName = session?.officerName || interaction.user.displayName || interaction.user.username;
    await editOcrCard(interaction, {
      content: null,
      embeds: [ocrCardEmbed({
        authorName: officerName,
        description: `Scanning ${attachments.length} screenshot(s) for **${event.title || event.eventId}** (${event.date})…`,
        footer: 'Names are matched to the Masterlist. Review opens on VALHALLA.',
      })],
      components: [],
    }, session);

    for (const att of attachments) {
      buffers.push({
        buffer: await fetchAttachmentBuffer(att.url),
        name: att.name || `screenshot-${buffers.length + 1}.png`,
      });
    }
    const result = await enqueueOcrJob(() => ocrPartyImages(buffers, members));
    const review = buildDraftReview({
      members,
      event,
      ocrResult: result,
      createdBy: interaction.user.id,
      createdByName: officerName,
      source: {
        kind: 'discord',
        channelId: sourceMessage.channelId,
        messageId: sourceMessage.id,
        attachmentUrls: attachments.map((a) => a.url),
        fileNames: buffers.map((row) => row.name),
      },
    });
    review.reviewChannelId = session?.activityChannelId || interaction.channelId;
    review.reviewMessageId = session?.activityMessageId || interaction.message?.id;
    await saveReview(review);
    if (session) {
      session.reviewId = review.id;
      session.scanning = false;
      activitySessions.set(review.reviewMessageId, session);
    }
    await editOcrCard(interaction, {
      content: null,
      embeds: [buildReviewEmbed(review, members)],
      components: buildReviewComponents(review),
    }, session);
  } catch (err) {
    console.error('[party-ocr] scan failed:', err.message);
    await editOcrCard(interaction, {
      content: null,
      embeds: [ocrCardEmbed({
        authorName: session?.officerName,
        description: `OCR failed: ${err.message || 'unknown error'}`,
        footer: 'Click Scan Party Screenshot on the launcher to try again.',
      })],
      components: [],
    }, session).catch(() => {});
  } finally {
    buffers.length = 0;
    if (session) session.scanning = false;
  }
}

function parseEventFromKey(instances, key) {
  return (instances || []).find((ev) => ev.key === key) || null;
}

async function startScanFromMessage(interaction, event, sourceMessage, session) {
  if (!session || session.scanning) return;
  session.scanning = true;
  try {
    await withInteractionTenant(interaction, () => runOcrAndPostReview({
      interaction,
      event,
      sourceMessage,
      session,
    }));
  } catch (err) {
    session.scanning = false;
    console.error('[party-ocr] scan failed:', err.message);
    await editOcrCard(interaction, {
      content: null,
      embeds: [ocrCardEmbed({
        authorName: session.officerName,
        description: `OCR failed: ${err.message || 'unknown error'}`,
        footer: 'Click Scan Party Screenshot on the launcher to try again.',
      })],
      components: [],
    }, session).catch(() => {});
  }
}

function waitingPayload(event, session, extra) {
    const dropTarget = session?.threadId
    ? `<#${session.threadId}>`
    : (session?.activityChannelId ? `<#${session.activityChannelId}>` : 'this channel');
  const description = [
    `Event **${event.title || event.eventId}** (${event.date}).`,
    `Post the Team Party screenshot in ${dropTarget}, then click **Use latest screenshot**.`,
    extra,
  ].filter(Boolean).join('\n');
  return {
    content: null,
    embeds: [ocrCardEmbed({
      authorName: session?.officerName,
      description,
      footer: 'This card stays in the channel — you can scroll back to it after posting the image.',
    })],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ocr:grab').setLabel('Use latest screenshot').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ocr:cancelscan').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function resolveDropChannel(interaction, session) {
  if (session?.threadId) {
    const discordClient = await requireReadyClient();
    const thread = await enqueueDiscordCall(() => discordClient.channels.fetch(session.threadId)).catch(() => null);
    if (thread?.messages?.fetch) return thread;
  }
  return resolveScanChannel(interaction);
}

async function maybeStartScreenshotThread(activityMessage, event) {
  if (!activityMessage || typeof activityMessage.startThread !== 'function') return null;
  try {
    return await enqueueDiscordCall(() => activityMessage.startThread({
      name: `OCR ${event.date || ''} ${event.title || 'Party'}`.trim().slice(0, 100),
      autoArchiveDuration: 1440,
      reason: 'Party OCR screenshot drop',
    }));
  } catch {
    return null;
  }
}

async function listenForScreenshot(interaction, event, session) {
  const channel = await resolveDropChannel(interaction, session);
  if (!channel?.createMessageCollector) return;
  const collector = channel.createMessageCollector({
    filter: (m) => String(m.author?.id) === String(session.officerId || interaction.user.id) && messageHasImage(m),
    max: 1,
    time: IMAGE_WAIT_MS,
  });
  collector.on('collect', (msg) => {
    startScanFromMessage(interaction, event, msg, session);
  });
}

export async function handlePartyOcrInteraction(interaction) {
  const customId = interaction.customId || '';
  if (await denyIfNotOfficer(interaction)) return;

  if (customId === 'ocr:open') {
    const officerName = interaction.user.displayName || interaction.user.username;
    const payload = await buildEventSelect(officerName);
    const channel = await resolveScanChannel(interaction);
    if (!channel?.send) {
      await interaction.followUp({
        content: 'Could not post the Party OCR card in this channel.',
        ephemeral: true,
      }).catch(() => {});
      return;
    }
    const sent = await enqueueDiscordCall(() => channel.send(payload));
    activitySessions.set(sent.id, {
      officerId: interaction.user.id,
      officerName,
      activityChannelId: sent.channelId,
      activityMessageId: sent.id,
      guildId: interaction.guildId,
    });
    return;
  }

  if (customId === 'ocr:cancelscan') {
    const session = sessionFor(interaction);
    if (session) activitySessions.delete(session.activityMessageId);
    await editOcrCard(interaction, {
      content: null,
      embeds: [ocrCardEmbed({
        authorName: session?.officerName,
        description: 'Scan cancelled. No swords were changed.',
        footer: 'Click Scan Party Screenshot on the launcher to start again.',
      })],
      components: [],
    }, session);
    return;
  }

  if (customId === 'ocr:event') {
    const key = interaction.values?.[0];
    const upcoming = await listUpcomingInstances({ includePreviousWeek: true });
    const event = parseEventFromKey(upcoming, key);
    const session = sessionFor(interaction) || {
      officerId: interaction.user.id,
      officerName: interaction.user.displayName || interaction.user.username,
      activityChannelId: interaction.channelId,
      activityMessageId: interaction.message?.id,
      guildId: interaction.guildId,
    };
    if (!session.activityMessageId) return;
    activitySessions.set(session.activityMessageId, session);
    if (!event) {
      await editOcrCard(interaction, {
        content: null,
        embeds: [ocrCardEmbed({
          authorName: session.officerName,
          description: 'That event is no longer on the calendar.',
          footer: 'Click Scan Party Screenshot on the launcher to pick another event.',
        })],
        components: [],
      }, session);
      return;
    }
    session.event = event;
    if (interaction.message?.thread?.id) {
      session.threadId = interaction.message.thread.id;
    } else if (!session.threadId && interaction.message) {
      const thread = await maybeStartScreenshotThread(interaction.message, event);
      if (thread?.id) session.threadId = thread.id;
    }
    await editOcrCard(interaction, waitingPayload(event, session), session);
    await listenForScreenshot(interaction, event, session);
    return;
  }

  if (customId === 'ocr:grab') {
    const session = sessionFor(interaction);
    if (!session?.event) {
      await editOcrCard(interaction, {
        content: null,
        embeds: [ocrCardEmbed({
          description: 'This card is not waiting for a screenshot. Click **Scan Party Screenshot** on the launcher.',
        })],
        components: [],
      }, session);
      return;
    }
    const channel = await resolveDropChannel(interaction, session);
    let msg = await findLatestOfficerImage(channel, session.officerId || interaction.user.id);
    if (!msg && session.threadId) {
      const parent = await resolveScanChannel(interaction);
      msg = await findLatestOfficerImage(parent, session.officerId || interaction.user.id);
    }
    if (!msg) {
      await editOcrCard(interaction, waitingPayload(
        session.event,
        session,
        `No screenshot from you found yet. Post the image, then click **Use latest screenshot** again.`,
      ), session);
      return;
    }
    await startScanFromMessage(interaction, session.event, msg, session);
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
        footer: 'Click Scan Party Screenshot on the launcher to start a new scan.',
      })],
      components: [],
    }, sessionFor(interaction));
    return;
  }
  const db = getTenantStore();
  const membersSnap = await db.ref('auction/members').once('value');
  const members = membersSnap.exists() ? membersSnap.val() : {};
  if (action === 'commit' || action === 'cancel' || action === 'assign') {
    await refreshReviewMessage(review, members, interaction);
  }
}

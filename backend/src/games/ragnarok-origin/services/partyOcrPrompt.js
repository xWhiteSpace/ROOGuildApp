import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} from 'discord.js';
import { getTenantStore } from '../../../db/database.js';
import { discordChannel } from '../../../db/channels.js';
import { getCachedConfig, getCurrentTenantId } from '../../../db/tenantContext.js';
import { buildCompositeKey, parseCompositeKey } from '../../../utils/guildTime.js';
import { enqueueDiscordCall, isDiscordCircuitOpen } from '../../../utils/discordRateLimit.js';
import { getRaidCycleStatus } from '../raidTimeWindow.js';

export const PROMPT_PATH = 'attendance/ocr_auto_prompt';
export const CREATE_DRAFT_ID = 'ocr:create-draft';
export const MAX_PROMPT_SHOTS = 8;
export const RETIRED_OCR_CARD_TEXT = 'Party OCR card is retired. Screenshots for a War go in the Raid Screenshot thread.';

const RETIRED_IDS = new Set(['ocr:open', 'ocr:cancelscan', 'ocr:event', 'ocr:grab']);
const ARCHIVE_MINUTES = [10080, 4320, 1440, 60];
const openFailures = new Map();

export function partyOcrInteractionKind(customId) {
  if (RETIRED_IDS.has(customId)) return 'retired';
  if (customId === CREATE_DRAFT_ID) return 'create-draft';
  return 'review';
}

export function threadNameFromWarDate(warDate) {
  const match = String(warDate || '').match(/^\d{4}-(\d{2})-(\d{2})$/);
  return match ? `GVG ${match[1]}${match[2]}` : 'GVG';
}

export function draftShotName(warDate, index) {
  const match = String(warDate || '').match(/^\d{4}-(\d{2})-(\d{2})$/);
  const mmdd = match ? `${match[1]}${match[2]}` : '0000';
  return `${mmdd}-${String(index).padStart(2, '0')}`;
}

export function promptSentence(warDate) {
  return [
    `GVG Event ${warDate}`,
    '1. Party leaders post Team Party screenshots in this thread.',
    '2. Press Create draft only after the pictures are here.',
  ].join('\n');
}

export function shouldOpenPartyOcrThread({ enabled, phase, channelId, pointer, warDate, eventId }) {
  if (enabled !== true) return false;
  if (Number(phase) !== 3) return false;
  if (!String(channelId || '').trim()) return false;
  if (!String(warDate || '').trim() || !String(eventId || '').trim()) return false;
  if (pointer?.threadId) return false;
  return true;
}

export function createDraftPress(review) {
  if (review && review.status === 'draft' && review.id) return 'repeat';
  return 'scan';
}

export function isPromptImage(att) {
  if (!att) return false;
  const name = String(att.name || '').toLowerCase();
  const type = String(att.contentType || '').toLowerCase();
  if (type.startsWith('image/')) return true;
  if (/\.(png|jpe?g|webp|gif|heic|heif|bmp)$/.test(name)) return true;
  if (Number(att.width) > 0 && Number(att.height) > 0) return true;
  return false;
}

export function findPromptPointer(map, threadId) {
  const id = String(threadId || '');
  for (const [key, value] of Object.entries(map || {})) {
    if (value && value.threadId === id) return { key, ...value };
  }
  return null;
}

function attachmentList(message) {
  const atts = message?.attachments;
  if (!atts) return [];
  if (Array.isArray(atts)) return atts;
  if (typeof atts.values === 'function') return [...atts.values()];
  return [];
}

function isBotMessage(message, botId) {
  if (message?.authorBot === true || message?.author?.bot === true) return true;
  const id = String(message?.authorId || message?.author?.id || '');
  return Boolean(botId) && id === String(botId);
}

export function selectThreadShots(messages, {
  botId = '',
  promptMessageId = '',
  warDate = '',
  limit = MAX_PROMPT_SHOTS,
} = {}) {
  const promptId = String(promptMessageId || '');
  const ordered = [...(messages || [])].sort(
    (a, b) => Number(a.createdTimestamp || 0) - Number(b.createdTimestamp || 0),
  );
  const shots = [];
  for (const message of ordered) {
    if (promptId && String(message.id) === promptId) continue;
    if (isBotMessage(message, botId)) continue;
    for (const att of attachmentList(message)) {
      if (!isPromptImage(att) || !att.url) continue;
      shots.push({ url: att.url, messageId: message.id });
    }
  }
  if (shots.length > limit) return { shots: [], overLimit: true, count: shots.length };
  return {
    shots: shots.map((shot, i) => ({ ...shot, name: draftShotName(warDate, i + 1) })),
    overLimit: false,
    count: shots.length,
  };
}

function createDraftRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CREATE_DRAFT_ID)
      .setLabel('Create draft')
      .setStyle(ButtonStyle.Primary),
  );
}

async function requireReadyClient() {
  const { discordClient } = await import('../../../discord-bot/client.js');
  if (!discordClient || !discordClient.isReady()) {
    throw new Error('Discord bot gateway is not connected on this backend.');
  }
  if (isDiscordCircuitOpen()) {
    throw new Error('Discord is temporarily blocking this server IP.');
  }
  return discordClient;
}

async function createPublicThread(channel, name) {
  let lastErr;
  for (const minutes of ARCHIVE_MINUTES) {
    try {
      return await enqueueDiscordCall(() => channel.threads.create({
        name,
        autoArchiveDuration: minutes,
        type: ChannelType.PublicThread,
        reason: 'GvG party screenshots',
      }));
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Could not open the War thread.');
}

function logOpenFailure(eventKey, err) {
  const text = err?.message || 'unknown error';
  if (openFailures.get(eventKey) === text) return;
  openFailures.set(eventKey, text);
  console.error('[party-ocr] thread open failed:', text);
}

export async function maybeOpenPartyOcrThread() {
  if (isDiscordCircuitOpen()) return;
  let eventKey = '';
  try {
    const cycle = getRaidCycleStatus();
    const config = getCachedConfig(getCurrentTenantId()) || {};
    const channelId = discordChannel('DISCORD_RAID_SCREENSHOT_CHANNEL_ID');
    const warDate = cycle.warDate || '';
    const eventId = cycle.activeEventId || '';
    eventKey = warDate && eventId ? buildCompositeKey(warDate, eventId) : '';
    if (!shouldOpenPartyOcrThread({
      enabled: config.partyOcrAutoDraft === true,
      phase: cycle.currentPhase,
      channelId,
      pointer: null,
      warDate,
      eventId,
    })) return;

    const db = getTenantStore();
    const snap = await db.ref(`${PROMPT_PATH}/${eventKey}`).once('value');
    const pointer = snap.exists() ? snap.val() : null;
    if (pointer?.threadId) return;

    let thread = null;
    try {
      const discordClient = await requireReadyClient();
      const channel = await enqueueDiscordCall(() => discordClient.channels.fetch(channelId));
      if (!channel?.threads?.create) throw new Error('Raid Screenshot channel cannot open a thread.');
      thread = await createPublicThread(channel, threadNameFromWarDate(warDate));
      const sent = await enqueueDiscordCall(() => thread.send({
        content: promptSentence(warDate),
        components: [createDraftRow()],
      }));
      await db.ref(`${PROMPT_PATH}/${eventKey}`).set({
        channelId,
        threadId: thread.id,
        messageId: sent.id,
        eventDate: warDate,
        eventKey,
        eventTitle: cycle.activeEventTitle || '',
      });
      openFailures.delete(eventKey);
    } catch (err) {
      if (thread?.delete) await thread.delete().catch(() => {});
      logOpenFailure(eventKey || 'open', err);
    }
  } catch (err) {
    logOpenFailure(eventKey || 'open', err);
  }
}

async function listThreadMessages(thread) {
  const all = [];
  let before;
  for (let page = 0; page < 20; page += 1) {
    const batch = await enqueueDiscordCall(() => thread.messages.fetch({
      limit: 100,
      ...(before ? { before } : {}),
    }));
    if (!batch?.size) break;
    all.push(...batch.values());
    if (batch.size < 100) break;
    const oldest = typeof batch.last === 'function' ? batch.last() : null;
    if (!oldest?.id || oldest.id === before) break;
    before = oldest.id;
  }
  return all;
}

async function follow(interaction, content, ephemeral) {
  await interaction.followUp({ content, ephemeral }).catch(() => {});
}

function draftLinkText(reviewId, reviewFixUrl) {
  const url = reviewFixUrl(reviewId);
  return url ? `Draft is on VALHALLA: ${url}` : 'Draft is on VALHALLA (Raid → GVG Attendance).';
}

export async function runCreateDraftFromThread(interaction) {
  const db = getTenantStore();
  const snap = await db.ref(PROMPT_PATH).once('value');
  const pointer = findPromptPointer(snap.exists() ? snap.val() : {}, interaction.channelId);
  if (!pointer?.threadId) {
    await follow(interaction, 'This thread is not a War screenshot thread.', true);
    return;
  }

  const {
    loadReview,
    reviewFixUrl,
    resolveOcrEvent,
    createReviewFromBuffers,
  } = await import('./discordPartyOcr.js');
  const review = pointer.reviewId ? await loadReview(pointer.reviewId) : null;
  if (createDraftPress(review) === 'repeat') {
    await follow(interaction, draftLinkText(review.id, reviewFixUrl), false);
    return;
  }

  let discordClient;
  let thread;
  try {
    discordClient = await requireReadyClient();
    thread = await enqueueDiscordCall(() => discordClient.channels.fetch(pointer.threadId));
  } catch (err) {
    await follow(interaction, err.message || 'Could not open the War thread.', true);
    return;
  }
  if (!thread?.messages?.fetch) {
    await follow(interaction, 'Could not read this War thread.', true);
    return;
  }
  if (thread.archived) {
    await enqueueDiscordCall(() => thread.setArchived(false)).catch(() => {});
  }

  const selected = selectThreadShots(await listThreadMessages(thread), {
    botId: discordClient.user?.id || '',
    promptMessageId: pointer.messageId,
    warDate: pointer.eventDate,
  });
  if (selected.count === 0) {
    await follow(interaction, 'No screenshots in this thread yet.', true);
    return;
  }
  if (selected.overLimit) {
    await follow(
      interaction,
      `This thread has ${selected.count} screenshots. The draft holds ${MAX_PROMPT_SHOTS}. Remove extras and press Create draft again.`,
      true,
    );
    return;
  }

  let event = await resolveOcrEvent(pointer.eventKey);
  if (!event) {
    const parsed = parseCompositeKey(pointer.eventKey);
    event = {
      key: pointer.eventKey,
      date: pointer.eventDate || parsed?.dateStr || '',
      eventId: parsed?.eventId || '',
      title: pointer.eventTitle || parsed?.eventId || 'GVG',
    };
  }

  const buffers = [];
  try {
    for (const shot of selected.shots) {
      const res = await fetch(shot.url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`Failed to download screenshot (${res.status}).`);
      buffers.push({ buffer: Buffer.from(await res.arrayBuffer()), name: shot.name });
    }
    const officerName = interaction.user?.displayName || interaction.user?.username || 'Officer';
    const { review: created } = await createReviewFromBuffers({
      buffers,
      fileNames: buffers.map((row) => row.name),
      event,
      createdBy: interaction.user?.id || '',
      createdByName: officerName,
      source: {
        kind: 'discord',
        channelId: pointer.threadId,
        messageId: pointer.messageId,
        attachmentUrls: selected.shots.map((shot) => shot.url),
      },
    });
    await db.ref(`${PROMPT_PATH}/${pointer.key}`).update({ reviewId: created.id });
    await follow(interaction, draftLinkText(created.id, reviewFixUrl), false);
  } catch (err) {
    await follow(interaction, err.message || 'Could not create the draft.', true);
  } finally {
    buffers.length = 0;
  }
}

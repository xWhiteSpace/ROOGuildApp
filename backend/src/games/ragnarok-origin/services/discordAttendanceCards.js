/**
 * Per-event GVG Readiness dashboard (public War-announce message) plus a
 * private ephemeral panel for role / class changes.
 */
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { sanitizeInGameName } from '@guildname/shared/inGameAlias';
import { getTenantStore } from '../../../db/database.js';
import { loadRosterMembers } from './scheduleService.js';
import {
  applyAttendanceDecision,
  AttendanceDecisionError,
  resolveAttendanceTargetEvent,
  getDefaultLeaveCredits,
} from './attendanceDecision.js';
import { enqueueDiscordCall, isDiscordCircuitOpen } from '../../../utils/discordRateLimit.js';
import { jobIconEmoji, withJobIcon } from './discordJobEmojis.js';
import { discordChannel } from '../../../db/channels.js';
import { getRaidCycleStatus } from '../raidTimeWindow.js';
import {
  buildRsvpAnnounceLine,
  sendGenRoomMessage,
} from './discordGenAnnounce.js';

const EMBED_COLOR = '#9333ea';
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DISCORD_SELECT_LIMIT = 25;
const FIELD_VALUE_LIMIT = 1024;
const MAX_INLINE_FIELDS = 24;
const PANEL_TITLE = 'GVG Readiness Check';
const CARD_PATH = 'attendance/gvg_readiness_card';
const BAR_WIDTH = 10;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const ANNOUNCE_COOLDOWN_MS = 60 * 1000;

const userEventLocks = new Map();
const lastAnnounceAt = new Map();

function consumeAnnounceCooldown(key) {
  const now = Date.now();
  const last = lastAnnounceAt.get(key) || 0;
  if (now - last < ANNOUNCE_COOLDOWN_MS) return false;
  lastAnnounceAt.set(key, now);
  return true;
}

function withUserEventLock(key, fn) {
  const prev = userEventLocks.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  userEventLocks.set(key, next);
  return next.finally(() => {
    if (userEventLocks.get(key) === next) userEventLocks.delete(key);
  });
}

function isEphemeralInteraction(interaction) {
  try {
    return Boolean(interaction.message?.flags?.has(MessageFlags.Ephemeral));
  } catch {
    return false;
  }
}

function formatEventWhen(dateStr, timeStart) {
  if (!dateStr) return '—';
  const [year, month, day] = String(dateStr).split('-').map(Number);
  const mon = MONTHS_SHORT[(month || 1) - 1] || '—';
  const dd = Number.isFinite(day) ? String(day).padStart(2, '0') : '—';
  const time = timeStart || '20:55';
  return Number.isFinite(year) ? `${mon} ${dd}, ${year}  ${time}` : `${dateStr}  ${time}`;
}

const AVAILABILITY_COPY =
  'Please confirm your availability for our upcoming GVG.\n' +
  'This will help our officers to build balanced parties. Your Response is greatly appreciated.';

function formatDeadline(deadlineMs, timezone) {
  if (!Number.isFinite(deadlineMs)) return '—';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(deadlineMs))
      .map((p) => [p.type, p.value])
  );
  return `${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

function unicodeBar(fractionLeft, width = BAR_WIDTH) {
  const clamped = Math.max(0, Math.min(1, Number(fractionLeft) || 0));
  const filled = Math.round(clamped * width);
  return `${'▰'.repeat(filled)}${'▱'.repeat(Math.max(0, width - filled))}`;
}

function buildDeadlineBarLine(nowMs, windowStartMs, deadlineMs) {
  if (!Number.isFinite(deadlineMs)) return 'Response Deadline: —';
  const start = Number.isFinite(windowStartMs) ? windowStartMs : deadlineMs - WEEK_MS;
  const total = Math.max(1, deadlineMs - start);
  const remaining = deadlineMs - nowMs;
  const fractionLeft = remaining <= 0 ? 0 : Math.max(0, Math.min(1, remaining / total));
  const unix = Math.floor(deadlineMs / 1000);
  const pct = Math.round(fractionLeft * 100);
  const locked = remaining <= 0 ? '  · locked' : '';
  return `${unicodeBar(fractionLeft)}  **${pct}%** left${locked}\nDeadline <t:${unix}:R> · <t:${unix}:f>`;
}

function attendanceEmptyDescription(missing) {
  return missing
    ? "The Set Active composition's scheduled event is missing or cancelled."
    : 'No upcoming GVG has an open RSVP window right now.';
}

function catalogName(catalog, code) {
  if (!code) return '—';
  return catalog?.[code]?.name || code;
}

function catalogSelectOptions(catalog) {
  return Object.entries(catalog || {})
    .slice(0, DISCORD_SELECT_LIMIT)
    .map(([code, obj]) => {
      const opt = {
        label: String(obj?.name || code).slice(0, 100) || code,
        value: String(code).slice(0, 100),
      };
      const emoji = jobIconEmoji(obj?.iconFile);
      if (emoji) opt.emoji = { id: emoji.id };
      return opt;
    })
    .filter((opt) => opt.value);
}

function isRaidRosterMember(m) {
  return m?.isRaidRoster === true && m?.status !== 'Ghost';
}

function commitmentRank(status) {
  if (status === 'Confirmed' || status === 'Confirm') return 0;
  if (status === 'Leave') return 2;
  return 1;
}

function formatRosterLine(status, iconFile, name) {
  if (status === 'Confirmed' || status === 'Confirm') {
    return withJobIcon(iconFile, `🟢 **${name}**`);
  }
  if (status === 'Leave') {
    return withJobIcon(iconFile, `🕊️ *${name}*`);
  }
  return withJobIcon(iconFile, name);
}

const NAMES_PER_COLUMN = 5;

function packFiveByThree(lines) {
  const columns = [];
  for (let i = 0; i < lines.length; i += NAMES_PER_COLUMN) {
    columns.push(lines.slice(i, i + NAMES_PER_COLUMN).join('\n') || '\u200b');
  }
  if (columns.length > MAX_INLINE_FIELDS) {
    const hidden = Math.max(0, lines.length - MAX_INLINE_FIELDS * NAMES_PER_COLUMN);
    columns.length = MAX_INLINE_FIELDS;
    if (hidden > 0) {
      const last = columns[MAX_INLINE_FIELDS - 1];
      const suffix = `\n+${hidden} more`;
      if ((last + suffix).length <= FIELD_VALUE_LIMIT) columns[MAX_INLINE_FIELDS - 1] = last + suffix;
    }
  }
  while (columns.length % 3 !== 0) columns.push('\u200b');
  return columns;
}

function masterListFields(members, commitments, jobsCatalog) {
  const roster = Object.entries(members || {})
    .filter(([, m]) => isRaidRosterMember(m))
    .map(([uid, m]) => {
      const status = commitments?.[uid]?.status || 'Unanswered';
      const name = String(m.displayName || m.name || uid);
      const job = jobsCatalog?.[m.jobCode];
      return {
        uid,
        rank: commitmentRank(status),
        name,
        line: formatRosterLine(status, job?.iconFile, name),
      };
    })
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  if (!roster.length) {
    return [{ name: 'Master List', value: 'No raid roster members yet.', inline: false }];
  }

  return packFiveByThree(roster.map((r) => r.line)).map((value, idx) => ({
    name: idx === 0 ? 'Master List' : '\u200b',
    value: value || '\u200b',
    inline: true,
  }));
}

function lockedReply() {
  return {
    content: '🔒 Interaction Rejected: System under administrative lockdown freeze.',
    embeds: [],
    components: [],
  };
}

function buildBackRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('attcard:back')
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildJobChangeView(jobsCatalog) {
  const options = catalogSelectOptions(jobsCatalog);
  if (!options.length) {
    return {
      content: '❌ Jobs database catalog missing.',
      embeds: [],
      components: [buildBackRow()],
    };
  }
  const menu = new StringSelectMenuBuilder()
    .setCustomId('attcard:job:select')
    .setPlaceholder('Select your active character class spec...')
    .addOptions(options);
  return {
    content: 'Select your new Job Class:',
    embeds: [],
    components: [
      new ActionRowBuilder().addComponents(menu),
      buildBackRow(),
    ],
  };
}

function buildRoleChangeView(rolesCatalog) {
  const options = catalogSelectOptions(rolesCatalog);
  if (!options.length) return null;
  const menu = new StringSelectMenuBuilder()
    .setCustomId('attcard:role:select')
    .setPlaceholder('Next, confirm your primary combat raid role...')
    .addOptions(options);
  return {
    content: 'Job saved. Next, select your combat role:',
    embeds: [],
    components: [
      new ActionRowBuilder().addComponents(menu),
      buildBackRow(),
    ],
  };
}

function publicActionRows(eventKey, pastDeadline) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`attcard:set:${eventKey}:confirm`)
        .setLabel('Available')
        .setStyle(ButtonStyle.Success)
        .setDisabled(pastDeadline),
      new ButtonBuilder()
        .setCustomId(`attcard:set:${eventKey}:leave`)
        .setLabel('Unavailable')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(pastDeadline)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('attcard:open')
        .setLabel('My status')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('attcard:jobchange')
        .setLabel('Change class')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('attcard:alias')
        .setLabel('Change Alias')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('attcard:roster')
        .setLabel('Master List')
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

async function buildPublicReadinessBoard() {
  const db = getTenantStore();
  const { event, timezone, deadlineMs, missing } = await resolveAttendanceTargetEvent();
  const embed = new EmbedBuilder().setTitle(PANEL_TITLE).setColor(EMBED_COLOR).setTimestamp();

  if (!event) {
    embed.setDescription(attendanceEmptyDescription(missing));
    return { content: null, embeds: [embed], components: [] };
  }

  const [members, commitSnap] = await Promise.all([
    loadRosterMembers(db),
    db.ref(`attendance/commitments/${event.key}`).once('value'),
  ]);
  const commitments = commitSnap.exists() ? commitSnap.val() : {};
  const cycle = getRaidCycleStatus();
  const nowMs = Date.now();
  const pastDeadline = Number.isFinite(deadlineMs) && nowMs > deadlineMs;
  const windowStart = Number.isFinite(cycle?.prepStartsAt) ? cycle.prepStartsAt : null;

  const confirmed = Object.values(commitments).filter((c) => c?.status === 'Confirmed' || c?.status === 'Confirm').length;
  const leave = Object.values(commitments).filter((c) => c?.status === 'Leave').length;
  const rosterCount = Object.values(members).filter(isRaidRosterMember).length;

  embed.setDescription(
    `${AVAILABILITY_COPY}\n\n` +
      `**${event.title || event.eventId || 'Raid'}** · ${formatEventWhen(event.date, event.timeStart)}\n` +
      `${buildDeadlineBarLine(nowMs, windowStart, deadlineMs)}`
  );
  embed.setFooter({
    text: `${confirmed} confirmed · ${leave} leave · ${Math.max(0, rosterCount - confirmed - leave)} unanswered · Master List button to view names`,
  });

  return {
    content: null,
    embeds: [embed],
    components: publicActionRows(event.key, pastDeadline),
    eventKey: event.key,
  };
}

async function buildRosterPanel() {
  const db = getTenantStore();
  const { event, missing } = await resolveAttendanceTargetEvent();
  const embed = new EmbedBuilder().setTitle('Master List').setColor(EMBED_COLOR).setTimestamp();

  if (!event) {
    embed.setDescription(attendanceEmptyDescription(missing));
    return { content: null, embeds: [embed], components: [] };
  }

  const [configSnap, membersSnap, commitSnap] = await Promise.all([
    db.ref('settings/configuration').once('value'),
    db.ref('auction/members').once('value'),
    db.ref(`attendance/commitments/${event.key}`).once('value'),
  ]);
  const jobsCatalog = configSnap.exists() ? (configSnap.val().jobs || {}) : {};
  const members = membersSnap.exists() ? membersSnap.val() : {};
  const commitments = commitSnap.exists() ? commitSnap.val() : {};
  const confirmed = Object.values(commitments).filter((c) => c?.status === 'Confirmed' || c?.status === 'Confirm').length;
  const leave = Object.values(commitments).filter((c) => c?.status === 'Leave').length;
  const rosterCount = Object.values(members).filter(isRaidRosterMember).length;

  embed.setDescription(`**${event.title || event.eventId || 'Raid'}**\n🟢 **bold** = confirmed · 🕊️ italic = leave`);
  embed.addFields(...masterListFields(members, commitments, jobsCatalog));
  embed.setFooter({
    text: `${confirmed} confirmed · ${leave} leave · ${Math.max(0, rosterCount - confirmed - leave)} unanswered`,
  });

  return { content: null, embeds: [embed], components: [] };
}

async function buildPersonalPanel(snowflakeId) {
  const db = getTenantStore();
  const { event, timezone, deadlineMs, missing } = await resolveAttendanceTargetEvent();
  const [memberSnap, configSnap] = await Promise.all([
    db.ref(`auction/members/${snowflakeId}`).once('value'),
    db.ref('settings/configuration').once('value'),
  ]);
  const member = memberSnap.exists() ? memberSnap.val() : {};
  const config = configSnap.exists() ? configSnap.val() : {};
  const jobsCatalog = config.jobs || {};
  const rolesCatalog = config.roles || {};
  const defaultCredits = getDefaultLeaveCredits(config);
  const credits = Number.isInteger(member.leaveCreditsRemaining)
    ? member.leaveCreditsRemaining
    : defaultCredits;

  const embed = new EmbedBuilder().setTitle(PANEL_TITLE).setColor(EMBED_COLOR).setTimestamp();

  if (!event) {
    embed.setDescription(attendanceEmptyDescription(missing));
    return { content: null, embeds: [embed], components: [] };
  }

  const commitSnap = await db.ref(`attendance/commitments/${event.key}/${snowflakeId}`).once('value');
  const status = commitSnap.exists() ? commitSnap.val().status : 'Unanswered';
  const pastDeadline = Number.isFinite(deadlineMs) && Date.now() > deadlineMs;
  const leaveDisabled = pastDeadline || (credits <= 0 && status !== 'Leave');
  const confirmDisabled = pastDeadline;
  const jobName = catalogName(jobsCatalog, member.jobCode);
  const roleName = catalogName(rolesCatalog, member.roleCode);

  embed.setDescription(
    `Your Current Role: ${withJobIcon(jobsCatalog[member.jobCode]?.iconFile, `**${jobName}** ${roleName}`)}\n` +
      `In-game alias: **${member.inGameName || '—'}**\n` +
      `Response Deadline: **${formatDeadline(deadlineMs, timezone)}**\n` +
      `Your RSVP: **${status}**`
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`attcard:set:${event.key}:confirm`)
      .setLabel('Available')
      .setStyle(status === 'Confirmed' ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(confirmDisabled),
    new ButtonBuilder()
      .setCustomId(`attcard:set:${event.key}:leave`)
      .setLabel('Unavailable')
      .setStyle(status === 'Leave' ? ButtonStyle.Danger : ButtonStyle.Secondary)
      .setDisabled(leaveDisabled),
    new ButtonBuilder()
      .setCustomId('attcard:jobchange')
      .setLabel('Change class')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('attcard:alias')
      .setLabel('Change Alias')
      .setStyle(ButtonStyle.Secondary)
  );

  if (credits <= 0 && status !== 'Leave') {
    embed.setFooter({ text: 'No leave credits remaining — Available, or you will receive a No Confirm after the deadline.' });
  }

  return { content: null, embeds: [embed], components: [row] };
}

async function requireReadyClient() {
  const { discordClient } = await import('../../../discord-bot/client.js');
  const { getDiscordRateLimitStatus } = await import('../../../utils/discordRateLimit.js');

  if (!discordClient || !discordClient.isReady()) {
    throw new Error(
      'Discord bot gateway is not connected on this backend. ' +
      'Website Sign-in can still work because OAuth is offloaded to Vercel — that does not mean the bot is online. ' +
      'Check Render for "successfully deployed as" or GET /api/debug/discord-ratelimit (botReady).'
    );
  }
  if (isDiscordCircuitOpen()) {
    const status = getDiscordRateLimitStatus();
    const when = status.circuitUntilHuman || status.untilHuman || status.circuitRemainingHuman || status.remainingHuman;
    throw new Error(`Discord is temporarily blocking this server IP. Try again after ${when}.`);
  }
  return discordClient;
}

function toMessagePayload(payload) {
  const { eventKey, ...rest } = payload;
  void eventKey;
  if (rest.content == null) delete rest.content;
  return rest;
}

async function persistCardPointer(channelId, messageId, eventKey) {
  const db = getTenantStore();
  await db.ref(CARD_PATH).set({
    channelId,
    messageId,
    eventKey: eventKey || '',
    updatedAt: Date.now(),
  });
}

/**
 * Post the dashboard if missing, otherwise edit the stored War-announce message.
 */
export async function ensureGvgReadinessBoard({ forcePost = false } = {}) {
  const channelId = discordChannel('DISCORD_WARANNOUNCE_CHANNEL_ID');
  if (!channelId) {
    throw new Error('DISCORD_WARANNOUNCE_CHANNEL_ID is not configured.');
  }
  const discordClient = await requireReadyClient();
  const targetChannel = await enqueueDiscordCall(() => discordClient.channels.fetch(channelId));
  if (!targetChannel) {
    throw new Error('Discord gateway client failed to locate the war-announce channel.');
  }

  const payload = await buildPublicReadinessBoard();
  const messagePayload = toMessagePayload(payload);
  const eventKey = payload.eventKey;
  const db = getTenantStore();
  const storedSnap = await db.ref(CARD_PATH).once('value');
  const stored = storedSnap.exists() ? storedSnap.val() : null;

  if (!forcePost && stored?.messageId && stored.channelId === channelId) {
    try {
      const existing = await enqueueDiscordCall(() => targetChannel.messages.fetch(stored.messageId));
      await enqueueDiscordCall(() => existing.edit(messagePayload));
      await persistCardPointer(channelId, stored.messageId, eventKey);
      return { posted: false, edited: true, messageId: stored.messageId };
    } catch {
      /* missing or uneditable — post a replacement */
    }
  }

  const sent = await enqueueDiscordCall(() => targetChannel.send(messagePayload));
  await persistCardPointer(channelId, sent.id, eventKey);
  return { posted: true, edited: false, messageId: sent.id };
}

export async function ensureGvgReadinessBoardIfMissing() {
  const db = getTenantStore();
  const storedSnap = await db.ref(CARD_PATH).once('value');
  if (storedSnap.exists() && storedSnap.val()?.messageId) return { skipped: true };
  return ensureGvgReadinessBoard({ forcePost: false });
}

export async function refreshGvgReadinessBoard() {
  try {
    if (isDiscordCircuitOpen()) return { skipped: true };
    const db = getTenantStore();
    const storedSnap = await db.ref(CARD_PATH).once('value');
    if (!storedSnap.exists() || !storedSnap.val()?.messageId) return { skipped: true };
    return await ensureGvgReadinessBoard({ forcePost: false });
  } catch (err) {
    console.error('[gvg-readiness] refresh failed:', err.message);
    return { ok: false, error: err.message };
  }
}

export async function sendPublicAttendanceCard(channel) {
  const payload = await buildPublicReadinessBoard();
  const messagePayload = toMessagePayload(payload);
  const sent = await enqueueDiscordCall(() => channel.send(messagePayload));
  await persistCardPointer(channel.id, sent.id, payload.eventKey);
  return { posted: true, messageId: sent.id };
}

/**
 * Settings Send: upsert the public dashboard in DISCORD_WARANNOUNCE_CHANNEL_ID.
 */
export async function deployPublicAttendanceCardToWarAnnounce() {
  return await ensureGvgReadinessBoard({ forcePost: false });
}

async function replyIfLocked(db, interaction) {
  const configSnap = await db.ref('settings/configuration').once('value');
  if (configSnap.exists() && configSnap.val().isForceLocked === true) {
    await interaction.editReply(lockedReply());
    return true;
  }
  return false;
}

async function isForceLocked(db) {
  const configSnap = await db.ref('settings/configuration').once('value');
  return Boolean(configSnap.exists() && configSnap.val().isForceLocked === true);
}

function buildAliasModal(currentValue) {
  const input = new TextInputBuilder()
    .setCustomId('inGameName')
    .setLabel('In-game name / aliases')
    .setPlaceholder('Akeno, Akeno愛')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(100);
  const prefill = sanitizeInGameName(currentValue);
  if (prefill) input.setValue(prefill);
  return new ModalBuilder()
    .setCustomId('attcard:alias:modal')
    .setTitle('Change Alias')
    .addComponents(new ActionRowBuilder().addComponents(input));
}

export function attendanceCardWantsEphemeralAck(interaction) {
  const customId = interaction.customId || '';
  if (customId === 'attcard:open' || customId === 'attcard:mystatus' || customId === 'attcard:roster') return true;
  if (customId === 'attcard:jobchange' && !isEphemeralInteraction(interaction)) return true;
  return false;
}

export function attendanceCardSkipsGatewayAck(interaction) {
  return interaction.customId === 'attcard:alias';
}

export async function handleAttendanceCardInteraction(interaction) {
  const snowflakeId = interaction.user.id;
  const customId = interaction.customId || '';
  const db = getTenantStore();
  const fromEphemeral = isEphemeralInteraction(interaction);

  if (customId === 'attcard:open' || customId === 'attcard:mystatus') {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }
    if (await replyIfLocked(db, interaction)) return;
    const payload = await buildPersonalPanel(snowflakeId);
    return await interaction.editReply(payload);
  }

  if (customId === 'attcard:roster') {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }
    if (await replyIfLocked(db, interaction)) return;
    const payload = await buildRosterPanel();
    return await interaction.editReply(payload);
  }

  if (customId === 'attcard:back') {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
    }
    if (await replyIfLocked(db, interaction)) return;
    const payload = await buildPersonalPanel(snowflakeId);
    return await interaction.editReply(payload);
  }

  if (customId === 'attcard:jobchange') {
    if (!interaction.deferred && !interaction.replied) {
      if (fromEphemeral) await interaction.deferUpdate();
      else await interaction.deferReply({ ephemeral: true });
    }
    if (await replyIfLocked(db, interaction)) return;
    const jobsSnap = await db.ref('settings/configuration/jobs').once('value');
    return await interaction.editReply(buildJobChangeView(jobsSnap.exists() ? jobsSnap.val() : {}));
  }

  if (customId === 'attcard:alias') {
    if (await isForceLocked(db)) {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ ...lockedReply(), ephemeral: true });
      }
      return;
    }
    const memberSnap = await db.ref(`auction/members/${snowflakeId}`).once('value');
    const current = memberSnap.exists() ? (memberSnap.val().inGameName || '') : '';
    return await interaction.showModal(buildAliasModal(current));
  }

  if (customId === 'attcard:alias:modal') {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }
    if (await replyIfLocked(db, interaction)) return;
    let raw = '';
    try {
      raw = interaction.fields.getTextInputValue('inGameName');
    } catch {
      raw = '';
    }
    const nextAlias = sanitizeInGameName(raw);
    await db.ref(`auction/members/${snowflakeId}/inGameName`).set(nextAlias || null);
    return await interaction.editReply({
      content: nextAlias
        ? `In-game alias saved as **${nextAlias}**. Officers use this to match raid screenshots.`
        : 'In-game alias cleared.',
      embeds: [],
      components: [],
    });
  }

  if (customId === 'attcard:job:select') {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
    }
    if (await replyIfLocked(db, interaction)) return;
    const selectedJobCode = interaction.values?.[0];
    if (!selectedJobCode) {
      const payload = await buildPersonalPanel(snowflakeId);
      return await interaction.editReply(payload);
    }
    await db.ref(`auction/members/${snowflakeId}`).update({ jobCode: selectedJobCode });
    const rolesSnap = await db.ref('settings/configuration/roles').once('value');
    const roleView = buildRoleChangeView(rolesSnap.exists() ? rolesSnap.val() : {});
    if (roleView) return await interaction.editReply(roleView);
    const payload = await buildPersonalPanel(snowflakeId);
    await interaction.editReply(payload);
    refreshGvgReadinessBoard().catch(() => {});
    return;
  }

  if (customId === 'attcard:role:select') {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
    }
    if (await replyIfLocked(db, interaction)) return;
    const selectedRoleCode = interaction.values?.[0];
    if (selectedRoleCode) {
      await db.ref(`auction/members/${snowflakeId}`).update({ roleCode: selectedRoleCode });
    }
    const payload = await buildPersonalPanel(snowflakeId);
    await interaction.editReply(payload);
    refreshGvgReadinessBoard().catch(() => {});
    return;
  }

  if (customId.startsWith('attcard:set:')) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
    }
    const parts = customId.split(':');
    const compositeKey = parts.slice(2, -1).join(':');
    const action = parts[parts.length - 1];
    const lockKey = `${snowflakeId}:${compositeKey}`;

    return await withUserEventLock(lockKey, async () => {
      if (await replyIfLocked(db, interaction)) return;

      const memberSnap = await db.ref(`auction/members/${snowflakeId}`).once('value');
      const member = memberSnap.exists() ? memberSnap.val() : {};
      const displayName = member.displayName || member.name || interaction.user.username;
      const nextStatus = action === 'leave' ? 'Leave' : 'Confirmed';

      const existingSnap = await db.ref(`attendance/commitments/${compositeKey}/${snowflakeId}`).once('value');
      const current = existingSnap.exists() ? existingSnap.val().status : null;
      if (current === nextStatus) {
        if (fromEphemeral) {
          const payload = await buildPersonalPanel(snowflakeId);
          return await interaction.editReply(payload);
        }
        const board = await buildPublicReadinessBoard();
        return await interaction.editReply(toMessagePayload(board));
      }

      try {
        await applyAttendanceDecision({
          userId: snowflakeId,
          displayName,
          compositeKey,
          status: nextStatus,
        });
      } catch (err) {
        const msg = err instanceof AttendanceDecisionError ? err.message : err.message;
        return await interaction.followUp({ content: `❌ ${msg}`, ephemeral: true }).catch(() => {});
      }

      if (consumeAnnounceCooldown(lockKey)) {
        const cycle = getRaidCycleStatus();
        sendGenRoomMessage(buildRsvpAnnounceLine({
          displayName,
          available: nextStatus === 'Confirmed',
          eventTitle: cycle?.activeEventTitle,
          eventDate: cycle?.warDate,
        })).catch((err) => {
          console.error('⚠️ Attendance gen-room announce skipped:', err.message);
        });
      }

      if (fromEphemeral) {
        const payload = await buildPersonalPanel(snowflakeId);
        await interaction.editReply(payload);
        refreshGvgReadinessBoard().catch(() => {});
      } else {
        const board = await buildPublicReadinessBoard();
        await interaction.editReply(toMessagePayload(board));
        const channelId = discordChannel('DISCORD_WARANNOUNCE_CHANNEL_ID');
        if (channelId && interaction.message?.id) {
          await persistCardPointer(channelId, interaction.message.id, board.eventKey);
        }
      }
    });
  }
}

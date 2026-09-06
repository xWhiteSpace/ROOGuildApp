/**
 * Per-event Attendance Discord card (auction-card pattern).
 */
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import admin from 'firebase-admin';
import {
  applyAttendanceDecision,
  AttendanceDecisionError,
  resolveAttendanceTargetEvent,
  getDefaultLeaveCredits,
} from './attendanceDecision.js';
import { enqueueDiscordCall, isDiscordCircuitOpen } from '../utils/discordRateLimit.js';

const EMBED_COLOR = '#9333ea';
const ANNOUNCE_COOLDOWN_MS = 60 * 1000;
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const userEventLocks = new Map();
const lastAnnounceAt = new Map();

function withUserEventLock(key, fn) {
  const prev = userEventLocks.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  userEventLocks.set(key, next);
  return next.finally(() => {
    if (userEventLocks.get(key) === next) userEventLocks.delete(key);
  });
}

function consumeAnnounceCooldown(key) {
  const now = Date.now();
  const last = lastAnnounceAt.get(key) || 0;
  if (now - last < ANNOUNCE_COOLDOWN_MS) return false;
  lastAnnounceAt.set(key, now);
  return true;
}

function formatEventWhen(dateStr, timeStart) {
  if (!dateStr) return '—';
  const [year, month, day] = String(dateStr).split('-').map(Number);
  const mon = MONTHS_SHORT[(month || 1) - 1] || '—';
  const dd = Number.isFinite(day) ? String(day).padStart(2, '0') : '—';
  const time = timeStart || '20:55';
  return Number.isFinite(year) ? `${mon} ${dd}, ${year}  ${time}` : `${dateStr}  ${time}`;
}

function buildRsvpAnnounceLine({ displayName, action, eventTitle, whenLabel }) {
  const name = displayName || 'A raider';
  const event = eventTitle || 'the raid';
  const when = whenLabel || '—';
  const warId = (process.env.DISCORD_WARANNOUNCE_CHANNEL_ID || '').trim();
  const cta = warId ? ` Confirm yours at <#${warId}>.` : '';
  if (action === 'Leave') {
    return `🕊️ **${name}** will **Leave** on **${event}** this coming **${when}.** Rest well — the guild has you covered.${cta}`;
  }
  return `⚔️ **${name}** will **Confirm** on **${event}** this coming **${when}.** Locked in — see you there.${cta}`;
}

async function announceAttendanceToGenRoom({ displayName, action, eventTitle, whenLabel }) {
  const genRoomId = (process.env.DISCORD_GENROOM_ID_1 || '').trim();
  if (!genRoomId) return;
  if (isDiscordCircuitOpen()) return;

  const { discordClient } = await import('../discord-bot/client.js');
  if (!discordClient?.isReady()) return;

  const content = buildRsvpAnnounceLine({ displayName, action, eventTitle, whenLabel });
  await enqueueDiscordCall(async () => {
    if (isDiscordCircuitOpen() || !discordClient.isReady()) return;
    let channel = discordClient.channels.cache.get(genRoomId);
    if (!channel) {
      channel = await discordClient.channels.fetch(genRoomId);
    }
    if (!channel) return;
    await channel.send({ content });
  });
}

function formatDeadline(deadlineMs, timezone) {
  if (!Number.isFinite(deadlineMs)) return '—';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(deadlineMs))
      .map((p) => [p.type, p.value])
  );
  return `${parts.month} ${parts.day}, ${parts.year}  ${parts.hour}:${parts.minute}`;
}

function attendanceEmptyDescription(missing) {
  return missing
    ? "The Set Active composition's scheduled event is missing or cancelled."
    : 'No upcoming raid has an open RSVP window right now.';
}

export async function sendPublicAttendanceCard(channel) {
  const embed = new EmbedBuilder()
    .setTitle('Attendance')
    .setColor(EMBED_COLOR)
    .setDescription(
      'Open your personal panel to Check the Upcoming Event.\n' +
        'Select Confirm or Leave before the set Deadline.'
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('attcard:open')
      .setLabel('Open Attendance')
      .setStyle(ButtonStyle.Primary)
  );

  await enqueueDiscordCall(() => channel.send({ embeds: [embed], components: [row] }));
  return { posted: true };
}

/**
 * Settings Send: post the public launcher into DISCORD_WARANNOUNCE_CHANNEL_ID.
 */
export async function deployPublicAttendanceCardToWarAnnounce() {
  const channelId = process.env.DISCORD_WARANNOUNCE_CHANNEL_ID;
  if (!channelId) {
    throw new Error('DISCORD_WARANNOUNCE_CHANNEL_ID is not configured.');
  }

  const { discordClient } = await import('../discord-bot/client.js');
  const { isDiscordCircuitOpen, getDiscordRateLimitStatus } = await import('../utils/discordRateLimit.js');

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

  const targetChannel = await enqueueDiscordCall(() => discordClient.channels.fetch(channelId));
  if (!targetChannel) {
    throw new Error('Discord gateway client failed to locate the war-announce channel.');
  }
  return await sendPublicAttendanceCard(targetChannel);
}

async function buildPersonalPanel(snowflakeId) {
  const db = admin.database();
  const { event, timezone, deadlineMs, missing } = await resolveAttendanceTargetEvent();
  const memberSnap = await db.ref(`auction/members/${snowflakeId}`).once('value');
  const member = memberSnap.exists() ? memberSnap.val() : {};
  const configSnap = await db.ref('settings/configuration').once('value');
  const defaultCredits = getDefaultLeaveCredits(configSnap.exists() ? configSnap.val() : {});
  const credits = Number.isInteger(member.leaveCreditsRemaining)
    ? member.leaveCreditsRemaining
    : defaultCredits;

  const embed = new EmbedBuilder().setTitle('Attendance').setColor(EMBED_COLOR).setTimestamp();

  if (!event) {
    embed.setDescription(attendanceEmptyDescription(missing));
    return { embeds: [embed], components: [] };
  }

  const commitSnap = await db.ref(`attendance/commitments/${event.key}/${snowflakeId}`).once('value');
  const status = commitSnap.exists() ? commitSnap.val().status : 'Unanswered';
  const pastDeadline = Number.isFinite(deadlineMs) && Date.now() > deadlineMs;
  const leaveDisabled = pastDeadline || (credits <= 0 && status !== 'Leave');
  const confirmDisabled = pastDeadline;

  embed.setDescription(
    `**${event.title || event.eventId}**  •  \`${event.date}\`\n\n` +
      `Deadline: **${formatDeadline(deadlineMs, timezone)}**\n` +
      `Leave Credits: **${credits}**\n` +
      `Your status: **${status}**`
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`attcard:set:${event.key}:confirm`)
      .setLabel(status === 'Confirmed' ? 'Confirmed' : 'Confirm')
      .setStyle(status === 'Confirmed' ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(confirmDisabled),
    new ButtonBuilder()
      .setCustomId(`attcard:set:${event.key}:leave`)
      .setLabel(status === 'Leave' ? 'Leave' : 'Leave')
      .setStyle(status === 'Leave' ? ButtonStyle.Danger : ButtonStyle.Secondary)
      .setDisabled(leaveDisabled)
  );

  if (credits <= 0 && status !== 'Leave') {
    embed.setFooter({ text: 'No leave credits remaining — Confirm, or you will receive a No Confirm after the deadline.' });
  }

  return { embeds: [embed], components: [row] };
}

export async function handleAttendanceCardInteraction(interaction) {
  const snowflakeId = interaction.user.id;
  const customId = interaction.customId || '';

  if (customId === 'attcard:open') {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }
    const db = admin.database();
    const configSnap = await db.ref('settings/configuration').once('value');
    if (configSnap.exists() && configSnap.val().isForceLocked === true) {
      return await interaction.editReply({ content: '🔒 Interaction Rejected: System under administrative lockdown freeze.' });
    }
    const payload = await buildPersonalPanel(snowflakeId);
    return await interaction.editReply(payload);
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
      const db = admin.database();
      const configSnap = await db.ref('settings/configuration').once('value');
      if (configSnap.exists() && configSnap.val().isForceLocked === true) {
        return await interaction.editReply({ content: '🔒 Interaction Rejected: System under administrative lockdown freeze.', components: [] }).catch(() => {});
      }

      const memberSnap = await db.ref(`auction/members/${snowflakeId}`).once('value');
      const member = memberSnap.exists() ? memberSnap.val() : {};
      const displayName = member.displayName || member.name || interaction.user.username;
      const nextStatus = action === 'leave' ? 'Leave' : 'Confirmed';

      const existingSnap = await db.ref(`attendance/commitments/${compositeKey}/${snowflakeId}`).once('value');
      const current = existingSnap.exists() ? existingSnap.val().status : null;
      if (current === nextStatus) {
        const payload = await buildPersonalPanel(snowflakeId);
        return await interaction.editReply(payload);
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

      const payload = await buildPersonalPanel(snowflakeId);
      await interaction.editReply(payload);

      if (nextStatus === 'Confirmed' || nextStatus === 'Leave') {
        if (consumeAnnounceCooldown(lockKey)) {
          (async () => {
            const instSnap = await db.ref(`scheduler/instances/${compositeKey}`).once('value');
            const inst = instSnap.exists() ? instSnap.val() : {};
            await announceAttendanceToGenRoom({
              displayName,
              action: nextStatus,
              eventTitle: inst.title || inst.eventId || compositeKey,
              whenLabel: formatEventWhen(inst.date, inst.timeStart),
            });
          })().catch((err) => {
            console.error('⚠️ Attendance gen-room announce skipped:', err.message);
          });
        }
      }
    });
  }
}

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
import { enqueueDiscordCall } from '../utils/discordRateLimit.js';

const EMBED_COLOR = '#9333ea';

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
    const status = current === nextStatus ? 'None' : nextStatus;

    try {
      await applyAttendanceDecision({
        userId: snowflakeId,
        displayName,
        compositeKey,
        status,
      });
    } catch (err) {
      const msg = err instanceof AttendanceDecisionError ? err.message : err.message;
      return await interaction.followUp({ content: `❌ ${msg}`, ephemeral: true }).catch(() => {});
    }

    const payload = await buildPersonalPanel(snowflakeId);
    return await interaction.editReply(payload);
  }
}

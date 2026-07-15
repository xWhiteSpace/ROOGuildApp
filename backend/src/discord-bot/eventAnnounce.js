/**
 * Event Phase Announcements (Discord)
 *
 * Fires the per-event phase notifications configured in Settings → Events
 * (the 🔔 bell popover): Phase 1 registration reminders, Phase 2 bid-close,
 * and Phase 3 event-live notices.
 *
 * Design goals (why this exists instead of an in-memory tick tracker):
 *  - RESTART-SAFE: every occurrence is claimed via an idempotent Firebase
 *    marker, so a redeploy/cold-start/crash can no longer silently skip an
 *    announcement. A short catch-up window re-checks recent minutes each tick.
 *  - NO DUPLICATES: the marker is claimed with an atomic transaction, so
 *    concurrent ticks (or multiple instances) can never double-post.
 *  - SELF-HEALING: if the Discord send throws (rate limit / permissions), the
 *    marker is released so the next tick retries within the catch-up window.
 *
 * Mirrors the idempotency pattern used by attendanceAnnounce.js.
 */
import admin from 'firebase-admin';
import { discordClient } from './client.js';
import { getGuildNowParts, formatGuildDate, DEFAULT_TZ } from '../utils/guildTime.js';

const DAY_MINUTES = 1440;

/**
 * How many recent minutes to re-check each tick. Markers make this safe from
 * duplicates, so this window heals typical restart/deploy gaps without risk.
 */
const CATCHUP_WINDOW_MINUTES = 20;

/**
 * Resolve the guild-timezone week-minute (0–10079) and calendar date for a
 * given instant. Weekday/date resolution is delegated to the guildTime SSOT so
 * this stays consistent with the rest of the scheduler; only the hour/minute
 * (not exposed by that helper) is formatted here to derive the week-minute.
 */
function getGuildMinuteContext(timezone, instant) {
  const { dayOfWeek } = getGuildNowParts(timezone, instant);

  const hmParts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant);
  const t = {};
  hmParts.forEach((p) => {
    t[p.type] = p.value;
  });
  const hour = parseInt(t.hour, 10) % 24;
  const minute = parseInt(t.minute, 10);

  const absMinute = dayOfWeek * DAY_MINUTES + hour * 60 + minute;
  const dateStr = formatGuildDate(instant, timezone);
  return { absMinute, dateStr };
}

/**
 * Atomically claim an announcement occurrence. Returns { claimed, ref }.
 * claimed === true means THIS call reserved it (marker was absent) and the
 * caller must send. claimed === false means it was already sent / in-flight.
 */
async function claimAnnouncement(db, markerKey) {
  const ref = db.ref(`scheduler/event_announcements/${markerKey}`);
  const res = await ref.transaction((current) => {
    if (current === null) return { status: 'sending', at: Date.now() };
    return; // abort — someone already holds this occurrence
  });
  return { claimed: res.committed === true, ref };
}

/**
 * Post one phase message (throws on failure so the marker can be released) and
 * fire the best-effort snapshot side-effect (never blocks the announcement).
 */
async function dispatchAnnouncement(phaseTag, eventName) {
  const auctionChannelId = process.env.DISCORD_AUCTION_CHANNEL_ID;
  if (!auctionChannelId) throw new Error('DISCORD_AUCTION_CHANNEL_ID is not configured');

  const channel = await discordClient.channels.fetch(auctionChannelId);
  if (!channel || !channel.isTextBased()) {
    throw new Error('Configured auction announcement channel is missing or not text-based');
  }

  const { processAndPostDiscordSnapshot } = await import('../services/discordSnapshot.js');

  if (phaseTag === 'p1') {
    await channel.send(
      `📢 **${eventName} Registration Update**:\nBid requests are currently **OPEN**! Remember to check your basket modifications and confirm your item choices on the request deck.`
    );
    await processAndPostDiscordSnapshot(false).catch(() => {});
  } else if (phaseTag === 'p2') {
    await channel.send(
      `🔒 **${eventName} Registration Locked**:\nSubmissions are now closed! Bidding selections are frozen for list allocation processing by Management Officers.`
    );
    await processAndPostDiscordSnapshot(true).catch(() => {});
  } else if (phaseTag === 'p3') {
    await channel.send(
      `⚡ **${eventName} Auction Arena LIVE**:\nThe raid session has commenced! Stand by for interactive live bidding controls.`
    );
    await processAndPostDiscordSnapshot(false).catch(() => {});
  }
}

/**
 * Determine which phase announcements are due at a given guild week-minute.
 */
function collectDuePhases(absMinute, announcementMinutes) {
  const { phase1 = [], phase2 = null, phase3 = null } = announcementMinutes || {};
  const due = [];
  if (Array.isArray(phase1) && phase1.includes(absMinute)) due.push('p1');
  if (typeof phase2 === 'number' && absMinute === phase2) due.push('p2');
  if (typeof phase3 === 'number' && absMinute === phase3) due.push('p3');
  return due;
}

/**
 * Cron-callable entrypoint (invoked every 60s from client.js). Self-gated on
 * the force-lock flag and fully idempotent: safe to call repeatedly.
 */
export async function maybeAnnounceEvents() {
  const db = admin.database();

  const configSnap = await db.ref('settings/configuration').once('value');
  if (configSnap.exists() && configSnap.val().isForceLocked === true) return;

  const { getGateStatusDetails } = await import('../config/timeWindow.js');
  const status = getGateStatusDetails();
  if (!status || !status.announcementMinutes || !status.eventId) return;

  const timezone = status.timezone || DEFAULT_TZ;
  const eventName = status.eventName || 'Raid Session';
  const eventId = status.eventId;
  const now = new Date();

  // Walk the catch-up window from oldest → newest so backfilled announcements
  // post in chronological order.
  for (let k = CATCHUP_WINDOW_MINUTES; k >= 0; k--) {
    const instant = new Date(now.getTime() - k * 60000);
    const { absMinute, dateStr } = getGuildMinuteContext(timezone, instant);

    const duePhases = collectDuePhases(absMinute, status.announcementMinutes);
    if (duePhases.length === 0) continue;

    for (const phaseTag of duePhases) {
      // dateStr scopes the marker per calendar day (Phase 1 repeats daily) and
      // per week (Phase 2/3), so it auto-resets on the next occurrence.
      const markerKey = `${eventId}_${dateStr}_${phaseTag}`;
      const { claimed, ref } = await claimAnnouncement(db, markerKey);
      if (!claimed) continue;

      try {
        await dispatchAnnouncement(phaseTag, eventName);
        await ref.update({ status: 'sent', at: Date.now() });
      } catch (err) {
        // Release so a later tick within the window can retry transient failures.
        await ref.remove().catch(() => {});
        console.error(`⚠️ Event announcement (${phaseTag}) failed to post:`, err.message);
      }
    }
  }
}

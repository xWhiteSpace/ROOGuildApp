/**
 * Raid-cycle Discord announcements (GEN Room for P1, war-announce for P2/P3).
 * Isolated from auction eventAnnounce.js — never posts to the auction channel.
 */
import { getTenantStore } from '../db/database.js';
import { DEFAULT_TZ, getGuildWeekMinute } from '../utils/guildTime.js';
import { isDiscordCircuitOpen, logDiscordRateLimit } from '../utils/discordRateLimit.js';
import {
  buildAttendanceRaidAnnounce,
  buildRaidPhaseAnnounce,
  sendGenRoomMessage,
  sendWarAnnounceMessage,
} from '../games/ragnarok-origin/services/discordGenAnnounce.js';
import { getRaidCycleStatus } from '../games/ragnarok-origin/raidTimeWindow.js';
import { readTenantConfiguration } from '../games/ragnarok-origin/timeWindow.js';

const CATCHUP_WINDOW_MINUTES = 3;
const SENDING_TTL_MS = 10 * 60 * 1000;

function isRateLimitError(err) {
  if (!err) return false;
  if (err.name === 'DiscordCircuitOpenError') return true;
  const status = err.status ?? err.httpStatus ?? err.code;
  if (status === 429) return true;
  if (err.name === 'RateLimitError' || err.name === 'RateLimitedError') return true;
  return /rate limit|too many requests|being blocked/i.test(err.message || '');
}

async function claimAnnouncement(db, markerKey) {
  const ref = db.ref(`scheduler/war_room/announcements/${markerKey}`);
  const res = await ref.transaction((current) => {
    if (current === null) return { status: 'sending', at: Date.now() };
    if (current.status === 'sending' && (Date.now() - (current.at || 0)) > SENDING_TTL_MS) {
      return { status: 'sending', at: Date.now() };
    }
    return;
  });
  return { claimed: res.committed === true, ref };
}

function collectDuePhases(absMinute, announcementMinutes) {
  const { phase1 = [], phase2 = null, phase3 = null } = announcementMinutes || {};
  const due = [];
  if (Array.isArray(phase1) && phase1.includes(absMinute)) due.push('p1');
  if (typeof phase2 === 'number' && absMinute === phase2) due.push('p2');
  if (typeof phase3 === 'number' && absMinute === phase3) due.push('p3');
  return due;
}

function hasScheduledRaidAnnouncements(announcementMinutes) {
  const { phase1 = [], phase2 = null, phase3 = null } = announcementMinutes || {};
  return (Array.isArray(phase1) && phase1.length > 0)
    || typeof phase2 === 'number'
    || typeof phase3 === 'number';
}

async function dispatchRaidAnnouncement(phaseTag, cycle) {
  const payload = {
    eventTitle: cycle.activeEventTitle,
    eventDate: cycle.warDate,
    timeStart: cycle.warStartTime,
  };
  if (phaseTag === 'p1') {
    await sendGenRoomMessage(buildAttendanceRaidAnnounce(payload));
    return;
  }
  await sendWarAnnounceMessage(buildRaidPhaseAnnounce(phaseTag, payload));
}

export async function maybeAnnounceRaidEvents() {
  if (isDiscordCircuitOpen()) return;

  const db = getTenantStore();
  const config = await readTenantConfiguration(db);
  if (config.isForceLocked === true) return;

  const status = getRaidCycleStatus();
  if (!status || status.needsSetup || status.isForceLocked || !status.eventId) return;
  if (!hasScheduledRaidAnnouncements(status.announcementMinutes)) return;

  const timezone = status.timezone || DEFAULT_TZ;
  const eventId = status.eventId;
  const now = new Date();

  for (let k = CATCHUP_WINDOW_MINUTES; k >= 0; k -= 1) {
    const instant = new Date(now.getTime() - k * 60000);
    const { absMinute, dateStr } = getGuildWeekMinute(timezone, instant);
    const duePhases = collectDuePhases(absMinute, status.announcementMinutes);
    if (duePhases.length === 0) continue;
    if (isDiscordCircuitOpen()) return;

    for (const phaseTag of duePhases) {
      if (isDiscordCircuitOpen()) return;
      const markerKey = phaseTag === 'p1'
        ? `${eventId}_${dateStr}_p1_${absMinute}`
        : `${eventId}_${dateStr}_${phaseTag}`;
      const { claimed, ref } = await claimAnnouncement(db, markerKey);
      if (!claimed) continue;

      try {
        await dispatchRaidAnnouncement(phaseTag, status);
        await ref.update({ status: 'sent', at: Date.now() });
      } catch (err) {
        if (isRateLimitError(err)) {
          logDiscordRateLimit(`raid announcement ${phaseTag}`, err);
          console.error(`⏳ Raid announcement (${phaseTag}) rate-limited — holding marker:`, err.message);
        } else {
          await ref.remove().catch(() => {});
          console.error(`⚠️ Raid announcement (${phaseTag}) failed:`, err.message);
        }
      }
    }
  }
}

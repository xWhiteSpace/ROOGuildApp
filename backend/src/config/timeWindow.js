/**
 * ⏳ DYNAMIC GUILD REGISTRATION TIME MATRIX SYSTEM
 * Fetches rolling weekly schedules, timezones, and lock states dynamically from Firebase Realtime Database.
 */
import { getDatabase } from 'firebase-admin/database';

export async function getGateStatusDetails() {
  let timezone = "Asia/Manila";
  let isForceLocked = false;
  let events = {
    "ev_001": {
      title: "GuildLeague",
      phases: {
        1: { dayStart: 0, timeStart: "22:15", dayEnd: 1, timeEnd: "22:15" },
        2: { dayStart: 1, timeStart: "22:15", dayEnd: 2, timeEnd: "20:55" },
        3: { dayStart: 2, timeStart: "20:55", dayEnd: 2, timeEnd: "22:15" }
      }
    }
  };

  try {
    const db = getDatabase();
    const configSnap = await db.ref('settings/configuration').once('value');
    if (configSnap.exists()) {
      const data = configSnap.val();
      if (data.timezone) timezone = data.timezone;
      if (data.isForceLocked !== undefined) isForceLocked = data.isForceLocked;
      if (data.events) events = data.events;
    }
  } catch (err) {
    console.error("⚠️ Error pulling time configurations from Firebase Realtime Database:", err.message);
  }

  // Enforce system clock normalization to the configured adjustable timezone profile
  const tzString = new Date().toLocaleString("en-US", { timeZone: timezone });
  const localClock = new Date(tzString);

  const dayOfWeek = localClock.getDay(); // 0 = Sunday, 1 = Monday, 2 = Tuesday, ...
  const hours = localClock.getHours();
  const minutes = localClock.getMinutes();
  const currentMinutesOffset = hours * 60 + minutes;

  // ⭕ 1. Simple Manual Overriding Gate Lockdown Check
  if (isForceLocked) {
    return {
      isGateOpen: false,
      currentSessionLabel: "Forced Operational Lockdown",
      nextStatusChangeMessage: "Bidding channels are forcefully locked by Management Officers.",
      currentPhase: 2,
      phaseIntervals: { phase1: "Force Locked", phase2: "Force Locked", phase3: "Force Locked" }
    };
  }

  let currentPhase = 2; // Default fallback to Phase 2 (Request Locked) if no window matches
  let activeEventTitle = "Raid Session";

  function getAbsoluteMinutes(day, timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return day * 1440 + h * 60 + m;
  }

  if (events && typeof events === 'object') {
    for (const evId of Object.keys(events)) {
      const ev = events[evId];
      if (!ev || !ev.phases) continue;
      activeEventTitle = ev.title || "Raid Session";

      for (const phaseKey of ['1', '2', '3']) {
        const p = ev.phases[phaseKey];
        if (!p) continue;

        const startAbs = getAbsoluteMinutes(p.dayStart, p.timeStart);
        const endAbs = getAbsoluteMinutes(p.dayEnd, p.timeEnd);
        const currentAbs = dayOfWeek * 1440 + currentMinutesOffset;

        let isMatch = false;
        if (endAbs < startAbs) {
          // Window wraps around the weekly continuous boundary line
          if (currentAbs >= startAbs || currentAbs < endAbs) isMatch = true;
        } else {
          if (currentAbs >= startAbs && currentAbs < endAbs) isMatch = true;
        }

        if (isMatch) {
          currentPhase = Number(phaseKey);
        }
      }
    }
  }

  const isGateOpen = (currentPhase === 1);
  
  let currentSessionLabel = "";
  let nextStatusChangeMessage = "";

  if (currentPhase === 1) {
    currentSessionLabel = `${activeEventTitle} Registration Open`;
    nextStatusChangeMessage = "Registration paths are OPEN. Modify choices freely inside your basket.";
  } else if (currentPhase === 3) {
    currentSessionLabel = `${activeEventTitle} Live Event Active`;
    nextStatusChangeMessage = "Live Event Auction is currently ACTIVE. Bidding parameters are running live.";
  } else {
    currentSessionLabel = `${activeEventTitle} Registration Closed`;
    nextStatusChangeMessage = "Registration is LOCKED. Review pending allocation priority indexes.";
  }

  // Resolve time zone display name abbreviation or GMT string dynamically
  let gmtIndicator = "UTC";
  try {
    const formatterLong = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'short' });
    const tzParts = formatterLong.formatToParts(new Date());
    const tzNamePart = tzParts.find(p => p.type === 'timeZoneName');
    if (tzNamePart) gmtIndicator = tzNamePart.value;
  } catch (e) {
    gmtIndicator = "UTC";
  }

  const daysMap = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const phaseIntervals = { phase1: "Unconfigured", phase2: "Unconfigured", phase3: "Unconfigured" };

  if (events && typeof events === 'object') {
    const firstEvent = Object.values(events)[0];
    if (firstEvent && firstEvent.phases) {
      for (const pk of ['1', '2', '3']) {
        const phaseData = firstEvent.phases[pk];
        if (phaseData) {
          phaseIntervals[`phase${pk}`] = `${daysMap[phaseData.dayStart]} ${phaseData.timeStart} ~ ${daysMap[phaseData.dayEnd]} ${phaseData.timeEnd} ${gmtIndicator}`;
        }
      }
    }
  }

  return { isGateOpen, currentSessionLabel, nextStatusChangeMessage, currentPhase, phaseIntervals };
}
// backend/src/config/timeWindow.js
/**
 * ⏳ DYNAMIC TIME MATRIX SYSTEM (REAL-TIME CACHED)
 * Listens to Firebase real-time nodes on boot to maintain a localized memory cache.
 * Keeps function execution synchronous to protect background system loops against promise crashes.
 */
import { getDatabase } from 'firebase-admin/database';

let cachedConfig = {
  timezone: "Asia/Manila",
  isForceLocked: false,
  adminRoles: ["GUILD LEADER", "Vice Guild Leader", "Commander"],
helpEmbedUrl: "",
  items: [
    { id: "item_001", name: "Puppet Scroll", colorTheme: "purple" },
    { id: "item_002", name: "Illusion Scroll", colorTheme: "yellow" },
    { id: "item_003", name: "Light & Dark Scroll", colorTheme: "slate" },
    { id: "item_004", name: "Time & Space Scroll", colorTheme: "red" }
  ],
  events: {
    "ev_001": {
      title: "GuildLeague",
      phases: {
        1: { dayStart: 0, timeStart: "22:15", dayEnd: 1, timeEnd: "22:15" }, 
        2: { dayStart: 1, timeStart: "22:15", dayEnd: 2, timeEnd: "20:55" }, 
        3: { dayStart: 2, timeStart: "20:55", dayEnd: 2, timeEnd: "22:15" }  
      },
      loots: {
        "item_001": 1,
        "item_002": 1,
        "item_003": 3,
        "item_004": 5
      },
      announcements: {
        phase1: ["07:00", "12:00", "19:00"],
        phase2: "22:15",
        phase3: "20:55"
      }
    }
  }
};

let isListenerAttached = false;

const DAYS_OF_WEEK_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAYS_SHORT_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * 📡 BOOTSTRAP REAL-TIME CACHE LISTENER
 * Attaches a permanent real-time stream listener to the Firebase parameters tree.
 */
function initConfigListener() {
  if (isListenerAttached) return;
  
  try {
    const db = getDatabase();
    const configRef = db.ref('settings/configuration');

    configRef.on('value', (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        cachedConfig = {
          timezone: data.timezone || "Asia/Manila",
          isForceLocked: data.isForceLocked !== undefined ? data.isForceLocked : false,
          adminRoles: data.adminRoles || ["GUILD LEADER", "Vice Guild Leader", "Commander"],
          helpEmbedUrl: data.helpEmbedUrl || "",
          items: data.items || cachedConfig.items,
          events: data.events || cachedConfig.events
        };
      }
    }, (error) => {
      console.error("⚠️ Firebase real-time synchronization listener failure:", error.message);
    });

    isListenerAttached = true;
  } catch (err) {
    console.error("⚠️ Server bootstrap initialization error attaching Firebase time listeners:", err.message);
  }
}

/**
 * Synchronous Gate State Evaluation Engine
 * Instantly parses current calendar structures against cached cloud parameters without promises.
 */
export function getGateStatusDetails() {
  if (!isListenerAttached) {
    initConfigListener();
  }

  const { timezone, isForceLocked, events } = cachedConfig;

  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric'
  }).formatToParts(now);

  const timeObj = {};
  parts.forEach(p => { timeObj[p.type] = p.value; });

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayOfWeek = dayNames.indexOf(timeObj.weekday);
  const trueHours = parseInt(timeObj.hour, 10) % 24;
  const trueMinutes = parseInt(timeObj.minute, 10);

  const currentMinutesOffset = trueHours * 60 + trueMinutes;
  const currentAbs = dayOfWeek * 1440 + currentMinutesOffset;

  // 🔒 Manual administrative override lockdown check
  if (isForceLocked) {
    return {
      isGateOpen: false,
      currentSessionLabel: "Forced Operational Lockdown",
      nextStatusChangeMessage: "🔒 Bidding channels are forcefully locked by Management Officers.",
      currentPhase: 2,
      phaseIntervals: { phase1: "Force Locked", phase2: "Force Locked", phase3: "Force Locked" }
    };
  }

  function getAbsoluteMinutes(day, timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return day * 1440 + h * 60 + m;
  }

 let currentPhase = 2;
  let activePhaseConfig = null;
  let selectedEventContext = null;
  let activeEventId = "";
  let activeEventTitle = "Raid Session";

  const validEventIds = Object.keys(events || {}).filter(id => events[id]);

  if (validEventIds.length > 0) {
    const timelinePhases = [];

    validEventIds.forEach(evId => {
      const ev = events[evId];
      if (!ev || !ev.phases) return;

      Object.keys(ev.phases).forEach(phaseKey => {
        const p = ev.phases[phaseKey];
        if (!p) return;
        timelinePhases.push({
          eventId: evId,
          eventTitle: ev.title || "Raid Session",
          phase: Number(phaseKey),
          startAbs: getAbsoluteMinutes(p.dayStart, p.timeStart),
          endAbs: getAbsoluteMinutes(p.dayEnd, p.timeEnd),
          config: p,
          evConfig: ev
        });
      });
    });

    let activeMatch = null;

    // 🌟 PASS 1: Scan for any currently active Phase 3 (Live Auction) windows with absolute priority
    for (const entry of timelinePhases) {
      if (entry.phase !== 3) continue;
      let isLiveNow = false;
      if (entry.endAbs < entry.startAbs) {
        if (currentAbs >= entry.startAbs || currentAbs < entry.endAbs) isLiveNow = true;
      } else {
        if (currentAbs >= entry.startAbs && currentAbs < entry.endAbs) isLiveNow = true;
      }
      if (isLiveNow) {
        activeMatch = entry;
        break;
      }
    }

    // 🌟 PASS 2: If no live auction is running, evaluate standard Phase 1 and Phase 2 windows
    if (!activeMatch) {
      for (const entry of timelinePhases) {
        if (entry.phase === 3) continue;
        let isLiveNow = false;
        if (entry.endAbs < entry.startAbs) {
          if (currentAbs >= entry.startAbs || currentAbs < entry.endAbs) isLiveNow = true;
        } else {
          if (currentAbs >= entry.startAbs && currentAbs < entry.endAbs) isLiveNow = true;
        }
        if (isLiveNow) {
          activeMatch = entry;
          break;
        }
      }
    }

    if (activeMatch) {
      activeEventId = activeMatch.eventId;
      activeEventTitle = activeMatch.eventTitle;
      selectedEventContext = activeMatch.evConfig;
      currentPhase = activeMatch.phase;
      activePhaseConfig = activeMatch.config;
    } else if (timelinePhases.length > 0) {
      const sortedByClosestUpcoming = [...timelinePhases].sort((a, b) => {
        const distA = a.startAbs >= currentAbs ? (a.startAbs - currentAbs) : (10080 - currentAbs + a.startAbs);
        const distB = b.startAbs >= currentAbs ? (b.startAbs - currentAbs) : (10080 - currentAbs + b.startAbs);
        return distA - distB;
      });

      const upcomingMatch = sortedByClosestUpcoming[0];
      activeEventId = upcomingMatch.eventId;
      activeEventTitle = upcomingMatch.eventTitle;
      selectedEventContext = upcomingMatch.evConfig;
      currentPhase = 2;
      activePhaseConfig = null;
    }
  }


  const isGateOpen = (currentPhase === 1);
  let nextStatusChangeMessage = "";

  if (activePhaseConfig) {
    const endDayName = DAYS_OF_WEEK_NAMES[activePhaseConfig.dayEnd] || "Target Day";
    if (currentPhase === 1) {
      nextStatusChangeMessage = `🟢 Registration is OPEN for ${activeEventTitle}. Submissions close on ${endDayName} at ${activePhaseConfig.timeEnd} (${timezone} Time).`;
    } else if (currentPhase === 2) {
      nextStatusChangeMessage = `🔒 Submissions for ${activeEventTitle} are locked. Live bidding preparation commences on ${endDayName} at ${activePhaseConfig.timeEnd}.`;
    } else {
      nextStatusChangeMessage = `⚡ ${activeEventTitle} Event Session is currently LIVE inside the auction arena.`;
    }
  } else {
    nextStatusChangeMessage = isGateOpen 
      ? `Registration paths are OPEN for ${activeEventTitle}. Modify choices freely inside your basket.`
      : `Registration is LOCKED for ${activeEventTitle}. Review pending allocation priority indexes.`;
  }

  // Dynamic automatic computation of phase interval display string lines
  let gmtIndicator = "UTC";
  try {
    const formatterShort = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'short' });
    const tzParts = formatterShort.formatToParts(new Date());
    const foundPart = tzParts.find(p => p.type === 'timeZoneName');
    if (foundPart) gmtIndicator = foundPart.value;
  } catch (e) {
    gmtIndicator = "UTC";
  }

  const phaseIntervals = { phase1: "Unconfigured", phase2: "Unconfigured", phase3: "Unconfigured" };
  const displayTargetEvent = selectedEventContext || (validEventIds.length > 0 ? events[validEventIds[0]] : null);

  if (displayTargetEvent && displayTargetEvent.phases) {
    for (const pk of [1, 2, 3]) {
      const phaseData = displayTargetEvent.phases[pk];
      if (phaseData) {
        phaseIntervals[`phase${pk}`] = `${DAYS_SHORT_NAMES[phaseData.dayStart]} ${phaseData.timeStart} ~ ${DAYS_SHORT_NAMES[phaseData.dayEnd]} ${phaseData.timeEnd} ${gmtIndicator}`;
      }
    }
  }

  return {
    isGateOpen,
    currentSessionLabel: currentPhase === 1 ? `${activeEventTitle} Registration Open` : currentPhase === 3 ? `${activeEventTitle} Live Event Active` : `${activeEventTitle} Registration Closed`,
    nextStatusChangeMessage,
    currentPhase,
    phaseIntervals,
    activeEventId: activeEventId || "", // 🛡️ Explicit property injection ensures downstream route endpoints can map IDs natively
    activeEventTitle: activeEventTitle || "Raid Session", // 🛡️ Explicit property injection ensures descriptive matching text
    helpEmbedUrl: cachedConfig.helpEmbedUrl || "",
    // Contextual lookup extracts notification schedules belonging exclusively to the matched event context
    announcements: selectedEventContext?.announcements || (events && typeof events === 'object' ? Object.values(events)[0]?.announcements : null) || {
      phase1: ["07:00", "12:00", "19:00"],
      phase2: "22:15",
      phase3: "20:55"
    }
  };
}
// backend/src/config/timeWindow.js
/**
 * ⏳ DYNAMIC TIME MATRIX SYSTEM (REAL-TIME CACHED)
 * Listens to Firebase real-time nodes on boot to maintain a localized memory cache.
 * Keeps function execution synchronous to protect background system loops against promise crashes.
 */
import { getDatabase } from 'firebase-admin/database';

// Local volatile server memory cache block seeded with robust default parameters
let cachedConfig = {
  timezone: "Asia/Manila",
  isForceLocked: false,
  adminRoles: ["GUILD LEADER", "Vice Guild Leader", "Commander"],
  items: [
    { id: "item_001", name: "Puppet Scroll", limitQty: 1 },
    { id: "item_002", name: "Illusion Scroll", limitQty: 1 },
    { id: "item_003", name: "Light & Dark Scroll", limitQty: 3 },
    { id: "item_004", name: "Time & Space Scroll", limitQty: 5 }
  ],
  events: {
    "ev_001": {
      title: "GuildLeague",
      phases: {
        1: { dayStart: 0, timeStart: "22:15", dayEnd: 1, timeEnd: "22:15" }, // Sun 22:15 ~ Mon 22:15
        2: { dayStart: 1, timeStart: "22:15", dayEnd: 2, timeEnd: "20:55" }, // Mon 22:15 ~ Tue 20:55
        3: { dayStart: 2, timeStart: "20:55", dayEnd: 2, timeEnd: "22:15" }  // Tue 20:55 ~ Tue 22:15
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
        // Dynamic merge payload structural modifications safely into server memory
        cachedConfig = {
          timezone: data.timezone || "Asia/Manila",
          isForceLocked: data.isForceLocked !== undefined ? data.isForceLocked : false,
          adminRoles: data.adminRoles || ["GUILD LEADER", "Vice Guild Leader", "Commander"],
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
  // Ensure the live configuration cache listener is initialized on evaluation pass
  if (!isListenerAttached) {
    initConfigListener();
  }

  const { timezone, isForceLocked, events } = cachedConfig;

  // Enforce system clock normalization to your adjustable timezone configuration profile
  const targetTimeStr = new Date().toLocaleString("en-US", { timeZone: timezone });
  const localClock = new Date(targetTimeStr);

  const dayOfWeek = localClock.getDay();
  const currentMinutesOffset = localClock.getHours() * 60 + localClock.getMinutes();

  // 🔒 1. Simple Manual Overriding Gate Lockdown Check
  if (isForceLocked) {
    return {
      isGateOpen: false,
      currentSessionLabel: "Forced Operational Lockdown",
      nextStatusChangeMessage: "🔒 Bidding channels are forcefully locked by Management Officers.",
      currentPhase: 2,
      phaseIntervals: { phase1: "Force Locked", phase2: "Force Locked", phase3: "Force Locked" }
    };
  }

  let currentPhase = 2; // Fallback default to Phase 2 (Request Locked) if no windows trigger
  let activeEventTitle = "Raid Session";
  let activePhaseConfig = null;

  function getAbsoluteMinutes(day, timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return day * 1440 + h * 60 + m;
  }

  if (events && typeof events === 'object') {
    for (const evId of Object.keys(events)) {
      const ev = events[evId];
      if (!ev || !ev.phases) continue;
      
      // Resolve descriptive title text dynamically from parameters instead of using raw codes like ev_001
      activeEventTitle = ev.title || "Raid Session";

      for (const phaseKey of ['1', '2', '3']) {
        const p = ev.phases[phaseKey];
        if (!p) continue;

        const startAbs = getAbsoluteMinutes(p.dayStart, p.timeStart);
        const endAbs = getAbsoluteMinutes(p.dayEnd, p.timeEnd);
        const currentAbs = dayOfWeek * 1440 + currentMinutesOffset;

        let isInsideWindow = false;
        if (endAbs < startAbs) {
          // Rolling schedule window wraps across continuous weekly boundary line marks
          if (currentAbs >= startAbs || currentAbs < endAbs) isInsideWindow = true;
        } else {
          if (currentAbs >= startAbs && currentAbs < endAbs) isInsideWindow = true;
        }

        if (isInsideWindow) {
          currentPhase = Number(phaseKey);
          activePhaseConfig = p;
        }
      }
    }
  }

  const isGateOpen = (currentPhase === 1);
  let nextStatusChangeMessage = "";

  // 🔮 REPAIRED ACCURATE DAY & TIME DESCRIPTION INJECTOR
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

  // Dynamic automatic computation of active zone indicator text layout parameters
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

  if (events && typeof events === 'object') {
    const primaryEvent = Object.values(events)[0];
    if (primaryEvent && primaryEvent.phases) {
      for (const pk of ['1', '2', '3']) {
        const phaseData = primaryEvent.phases[pk];
        if (phaseData) {
          phaseIntervals[`phase${pk}`] = `${DAYS_SHORT_NAMES[phaseData.dayStart]} ${phaseData.timeStart} ~ ${DAYS_SHORT_NAMES[phaseData.dayEnd]} ${phaseData.timeEnd} ${gmtIndicator}`;
        }
      }
    }
  }

  return {
    isGateOpen,
    currentSessionLabel: currentPhase === 1 ? `${activeEventTitle} Registration Open` : currentPhase === 3 ? `${activeEventTitle} Live Event Active` : `${activeEventTitle} Registration Closed`,
    nextStatusChangeMessage,
    currentPhase,
    phaseIntervals
  };
}
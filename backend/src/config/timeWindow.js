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
  if (!isListenerAttached) {
    initConfigListener();
  }

  const { timezone, isForceLocked, events } = cachedConfig;

  // 1. Normalize current clock time into target timezone coordinates safely
  const targetTimeStr = new Date().toLocaleString("en-US", { timeZone: timezone });
  const localClock = new Date(targetTimeStr);

  const dayOfWeek = localClock.getDay();
  const currentMinutesOffset = localClock.getHours() * 60 + localClock.getMinutes();
  const currentAbsMinutes = dayOfWeek * 1440 + currentMinutesOffset;

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

  let currentPhase = 2; // Default fallback to Registration Closed
  let activeEventTitle = "Raid Session";
  let activePhaseConfig = null;

  function getAbsoluteMinutes(day, timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return day * 1440 + h * 60 + m;
  }

  // 🎯 Find the active event and check its current phase window
  if (events && typeof events === 'object') {
    const eventKeys = Object.keys(events);
    if (eventKeys.length > 0) {
      const ev = events[eventKeys[0]]; // Look at active event row directly
      if (ev) {
        activeEventTitle = ev.title || "Raid Session"; // Grab moniker exactly as written

        if (ev.phases) {
          // Check phase windows to see where current timestamp intersects
          for (const phaseKey of ['1', '2', '3']) {
            const p = ev.phases[phaseKey];
            if (!p) continue;

            const startAbs = getAbsoluteMinutes(p.dayStart, p.timeStart);
            const endAbs = getAbsoluteMinutes(p.dayEnd, p.timeEnd);

            let isInsideWindow = false;
            if (endAbs < startAbs) {
              // Handles weekly calendar wrapping transitions cleanly
              if (currentAbsMinutes >= startAbs || currentAbsMinutes < endAbs) isInsideWindow = true;
            } else {
              if (currentAbsMinutes >= startAbs && currentAbsMinutes < endAbs) isInsideWindow = true;
            }

            if (isInsideWindow) {
              currentPhase = Number(phaseKey);
              activePhaseConfig = p;
              break; // Mapped onto active window, exit phase check loop
            }
          }
        }
      }
    }
  }

  const isGateOpen = (currentPhase === 1); // Open only if explicitly inside Phase 1 bounds
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

  // Automatic computation of zone display tags
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
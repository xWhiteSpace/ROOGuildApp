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
  items: [
    { id: "item_001", name: "Puppet Scroll", limitQty: 1 },
    { id: "item_002", name: "Illusion Scroll", limitQty: 1 },
    { id: "item_003", name: "Light & Dark Scroll", limitQty: 3 },
    { id: "item_004", name: "Time & Space Scroll", limitQty: 5 }
  ],
  events: {
    "ev_001": {
      title: "GuildLeague",
      phases: [
        null,
        { dayStart: 0, timeStart: "22:15", dayEnd: 1, timeEnd: "22:15" }, 
        { dayStart: 1, timeStart: "22:15", dayEnd: 2, timeEnd: "20:55" }, 
        { dayStart: 2, timeStart: "20:55", dayEnd: 2, timeEnd: "22:15" }  
      ],
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

  // Enforce system clock normalization to your adjustable timezone configuration profile
  const targetTimeStr = new Date().toLocaleString("en-US", { timeZone: timezone });
  const localClock = new Date(targetTimeStr);

  const dayOfWeek = localClock.getDay();
  const currentMinutesOffset = localClock.getHours() * 60 + localClock.getMinutes();
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

  let currentPhase = 2; // Fallback default to Phase 2 (Request Locked) if no windows trigger
  let activePhaseConfig = null;
  let selectedEventContext = null;
  let activeEventId = "";
  let activeEventTitle = "Raid Session";

  if (events && typeof events === 'object') {
    const eventIds = Object.keys(events);

    if (eventIds.length > 0) {
      // 1️⃣ STEP 1: Scan for any currently live active Phase 3 windows
      for (const evId of eventIds) {
        const ev = events[evId];
        const p3 = ev?.phases?.[3];
        if (!p3) continue;

        const startAbs = getAbsoluteMinutes(p3.dayStart, p3.timeStart);
        const endAbs = getAbsoluteMinutes(p3.dayEnd, p3.timeEnd);

        let isLiveNow = false;
        if (endAbs < startAbs) {
          if (currentAbs >= startAbs || currentAbs < endAbs) isLiveNow = true;
        } else {
          if (currentAbs >= startAbs && currentAbs < endAbs) isLiveNow = true;
        }

        if (isLiveNow) {
          activeEventId = evId;
          break;
        }
      }

      // 2️⃣ STEP 2: If no event is currently live, look ahead for the closest upcoming Phase 3 anchor
      if (!activeEventId) {
        let minDistance = Infinity;
        let closestEvId = eventIds[0];

        for (const evId of eventIds) {
          const ev = events[evId];
          const p3 = ev?.phases?.[3];
          if (!p3) continue;

          const startAbs = getAbsoluteMinutes(p3.dayStart, p3.timeStart);
          
          // Calculate look-ahead distance inside the 10080-minute weekly loop boundary
          let distance = 0;
          if (startAbs >= currentAbs) {
            distance = startAbs - currentAbs;
          } else {
            distance = (10080 - currentAbs) + startAbs;
          }

          if (distance < minDistance) {
            minDistance = distance;
            closestEvId = evId;
          }
        }
        activeEventId = closestEvId;
      }

      // 3️⃣ STEP 3: Evaluate target phase state constraints exclusively for the resolved event context
      const ev = events[activeEventId];
      if (ev) {
        activeEventTitle = ev.title || "Raid Session";
        selectedEventContext = ev;

        if (ev.phases) {
          for (const phaseKey of [1, 2, 3]) {
            const p = ev.phases[phaseKey];
            if (!p) continue;

            const startAbs = getAbsoluteMinutes(p.dayStart, p.timeStart);
            const endAbs = getAbsoluteMinutes(p.dayEnd, p.timeEnd);

            let isInsideWindow = false;
            if (endAbs < startAbs) {
              if (currentAbs >= startAbs || currentAbs < endAbs) isInsideWindow = true;
            } else {
              if (currentAbs >= startAbs && currentAbs < endAbs) isInsideWindow = true;
            }

            if (isInsideWindow) {
              currentPhase = Number(phaseKey);
              activePhaseConfig = p;
              break;
            }
          }
        }
      }
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
  const displayTargetEvent = selectedEventContext || (events && typeof events === 'object' ? Object.values(events)[0] : null);

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
    // Contextual lookup extracts notification schedules belonging exclusively to the matched event context
    announcements: selectedEventContext?.announcements || (events && typeof events === 'object' ? Object.values(events)[0]?.announcements : null) || {
      phase1: ["07:00", "12:00", "19:00"],
      phase2: "22:15",
      phase3: "20:55"
    }
  };
}
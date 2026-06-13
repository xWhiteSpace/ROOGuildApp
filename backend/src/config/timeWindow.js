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
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric'
  }).formatToParts(now);

  const timeObj = {};
  parts.forEach(p => { timeObj[p.type] = p.value; });

  const year = parseInt(timeObj.year, 10);
  const month = parseInt(timeObj.month, 10) - 1; // 0-indexed adjustment for JavaScript months
  const day = parseInt(timeObj.day, 10);
  const trueHours = parseInt(timeObj.hour, 10) % 24;
  const trueMinutes = parseInt(timeObj.minute, 10);

  // Construct a localized snapshot instance to extract the true day of week integer cleanly
  const localSnap = new Date(year, month, day);
  const dayOfWeek = localSnap.getDay();

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

const getModularDistance = (from, to) => (to - from + 10080) % 10080;

  let currentPhase = 2;
  let activePhaseConfig = null;
  let selectedEventContext = null;
  let activeEventId = "";
  let activeEventTitle = "Raid Session";

  const validEventIds = Object.keys(events || {}).filter(id => events[id]);

  if (validEventIds.length > 0) {
    let minP3EndDistance = Infinity;
    let targetEventId = "";

    // 1. Determine active event utilizing the min(P3 End) distance metric
    validEventIds.forEach(evId => {
      const ev = events[evId];
      const p3 = ev?.phases?.[3];
      if (!p3) return;

      const p3EndAbs = getAbsoluteMinutes(p3.dayEnd, p3.timeEnd);
      const distanceToP3End = getModularDistance(currentAbs, p3EndAbs);

      if (distanceToP3End < minP3EndDistance) {
        minP3EndDistance = distanceToP3End;
        targetEventId = evId;
      }
    });

    if (targetEventId) {
      activeEventId = targetEventId;
      selectedEventContext = events[activeEventId];
      activeEventTitle = selectedEventContext.title || "Raid Session";

      // 2. Evaluate active sub-phase using wrap-around circular duration rules
      if (selectedEventContext.phases) {
        for (const phaseKey of [1, 2, 3]) {
          const p = selectedEventContext.phases[phaseKey];
          if (!p) continue;

          const startAbs = getAbsoluteMinutes(p.dayStart, p.timeStart);
          const endAbs = getAbsoluteMinutes(p.dayEnd, p.timeEnd);

          const totalDuration = getModularDistance(startAbs, endAbs);
          const distanceFromStart = getModularDistance(startAbs, currentAbs);

          if (distanceFromStart <= totalDuration) {
            currentPhase = Number(phaseKey);
            activePhaseConfig = p;
            if (currentPhase === 3) break;
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
  const displayTargetEvent = selectedEventContext || (validEventIds.length > 0 ? events[validEventIds[0]] : null);

  if (displayTargetEvent && displayTargetEvent.phases) {
    for (const pk of [1, 2, 3]) {
      const phaseData = displayTargetEvent.phases[pk];
      if (phaseData) {
        phaseIntervals[`phase${pk}`] = `${DAYS_SHORT_NAMES[phaseData.dayStart]} ${phaseData.timeStart} ~ ${DAYS_SHORT_NAMES[phaseData.dayEnd]} ${phaseData.timeEnd} ${gmtIndicator}`;
      }
    }
  }

const computedAnnouncementMinutes = { phase1: [], phase2: null, phase3: null };

  if (selectedEventContext && selectedEventContext.phases) {
    const evAnn = selectedEventContext.announcements || {};
    
    // Phase 1 alerts: Evaluated as daily repeating variations constrained inside the Phase 1 window
    const p1 = selectedEventContext.phases[1];
    if (p1 && evAnn.phase1) {
      const p1Start = (p1.dayStart * 1440) + parseInt(p1.timeStart.split(':')[0], 10) * 60 + parseInt(p1.timeStart.split(':')[1], 10);
      const p1End = (p1.dayEnd * 1440) + parseInt(p1.timeEnd.split(':')[0], 10) * 60 + parseInt(p1.timeEnd.split(':')[1], 10);
      const p1Duration = (p1End - p1Start + 10080) % 10080;

      evAnn.phase1.forEach(timeStr => {
        for (let d = 0; d <= 6; d++) {
          const annAbs = (d * 1440) + parseInt(timeStr.split(':')[0], 10) * 60 + parseInt(timeStr.split(':')[1], 10);
          if (((annAbs - p1Start + 10080) % 10080) <= p1Duration) {
            computedAnnouncementMinutes.phase1.push(annAbs);
          }
        }
      });
      computedAnnouncementMinutes.phase1.sort((a, b) => a - b);
    }

    // Phase 2 alerts: Milestone anchored explicitly to P2 Day Start
    const p2 = selectedEventContext.phases[2];
    if (p2 && evAnn.phase2) {
      computedAnnouncementMinutes.phase2 = (p2.dayStart * 1440) + parseInt(evAnn.phase2.split(':')[0], 10) * 60 + parseInt(evAnn.phase2.split(':')[1], 10);
    }

    // Phase 3 alerts: Milestone anchored explicitly to P3 Day Start
    const p3 = selectedEventContext.phases[3];
    if (p3 && evAnn.phase3) {
      computedAnnouncementMinutes.phase3 = (p3.dayStart * 1440) + parseInt(evAnn.phase3.split(':')[0], 10) * 60 + parseInt(evAnn.phase3.split(':')[1], 10);
    }
  }

  return {
    isGateOpen,
    currentSessionLabel: currentPhase === 1 ? `${activeEventTitle} Registration Open` : currentPhase === 3 ? `${activeEventTitle} Live Event Active` : `${activeEventTitle} Registration Closed`,
    nextStatusChangeMessage,
    currentPhase,
    phaseIntervals,
    eventId: activeEventId || "",
    eventName: activeEventTitle || "Raid Session",
    activeEventId: activeEventId || "", 
    activeEventTitle: activeEventTitle || "Raid Session", 
    helpEmbedUrl: cachedConfig.helpEmbedUrl || "",
    announcementMinutes: computedAnnouncementMinutes,
    announcements: selectedEventContext?.announcements || (events && typeof events === 'object' ? Object.values(events)[0]?.announcements : null) || {
      phase1: ["07:00", "12:00", "19:00"],
      phase2: "22:15",
      phase3: "20:55"
    }
  };
}
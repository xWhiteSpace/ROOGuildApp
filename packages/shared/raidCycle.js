/**
 * Raid-cycle week-circle helpers shared by Settings UI and the raid clock.
 * Auction phases live on ev.phases — this module only reads ev.raid.
 */

export const WEEK_MINUTES = 10080;
export const DEFAULT_RAID_POLL_MINUTES = 20;
export const MIN_RAID_POLL_MINUTES = 15;

export const RAID_PHASE_LABELS = {
  1: 'GvG Preparation',
  2: 'Party Adjustments',
  3: 'War',
};

export function getAbsoluteMinutes(day, timeStr) {
  if (timeStr == null || timeStr === '') return 0;
  const [h, m] = String(timeStr).split(':').map(Number);
  const dayNum = Number(day) || 0;
  return dayNum * 1440 + (h || 0) * 60 + (m || 0);
}

export function getModularDistance(from, to) {
  return (to - from + WEEK_MINUTES) % WEEK_MINUTES;
}

export function isPhaseWindowActive(currentAbs, startAbs, endAbs) {
  if (startAbs <= endAbs) {
    return currentAbs >= startAbs && currentAbs <= endAbs;
  }
  return currentAbs >= startAbs || currentAbs <= endAbs;
}

export function isRaidEnabled(ev) {
  const configId = String(ev?.raid?.configId || '').trim();
  const p3 = ev?.raid?.phases?.[3];
  return Boolean(configId && p3 && p3.timeEnd != null && p3.timeStart != null);
}

export function raidCycleSpanAbs(ev) {
  const raid = ev?.raid;
  const p1 = raid?.phases?.[1];
  const p3 = raid?.phases?.[3];
  if (!p1 || !p3) return null;
  return {
    start: getAbsoluteMinutes(p1.dayStart, p1.timeStart),
    end: getAbsoluteMinutes(p3.dayEnd, p3.timeEnd),
  };
}

function linearSegments(startAbs, endAbs) {
  if (startAbs <= endAbs) return [[startAbs, endAbs]];
  return [[startAbs, WEEK_MINUTES - 1], [0, endAbs]];
}

function linearOverlap(a0, a1, b0, b1) {
  return a0 <= b1 && b0 <= a1;
}

export function raidCyclesOverlap(spanA, spanB) {
  if (!spanA || !spanB) return false;
  const segsA = linearSegments(spanA.start, spanA.end);
  const segsB = linearSegments(spanB.start, spanB.end);
  for (const [a0, a1] of segsA) {
    for (const [b0, b1] of segsB) {
      if (linearOverlap(a0, a1, b0, b1)) return true;
    }
  }
  return false;
}

/**
 * @returns {{ a: string, b: string } | null}
 */
export function findOverlappingRaidCyclePair(events = {}) {
  const enabled = Object.entries(events).filter(([, ev]) => isRaidEnabled(ev));
  for (let i = 0; i < enabled.length; i += 1) {
    const [idA, evA] = enabled[i];
    const spanA = raidCycleSpanAbs(evA);
    if (!spanA) continue;
    for (let j = i + 1; j < enabled.length; j += 1) {
      const [idB, evB] = enabled[j];
      const spanB = raidCycleSpanAbs(evB);
      if (!spanB) continue;
      if (raidCyclesOverlap(spanA, spanB)) {
        return { a: idA, b: idB };
      }
    }
  }
  return null;
}

export function defaultRaidSubtree({ configId = '', fromAuctionPhases = null } = {}) {
  const phases = fromAuctionPhases
    ? JSON.parse(JSON.stringify(fromAuctionPhases))
    : {
      1: { dayStart: 0, timeStart: '22:15', dayEnd: 1, timeEnd: '22:15' },
      2: { dayStart: 1, timeStart: '22:15', dayEnd: 2, timeEnd: '20:55' },
      3: { dayStart: 2, timeStart: '20:55', dayEnd: 2, timeEnd: '22:15' },
    };
  return {
    configId: String(configId || '').trim(),
    warRoomIds: [],
    pollIntervalMinutes: DEFAULT_RAID_POLL_MINUTES,
    phases,
    announcements: {
      phase1: ['19:00'],
      phase2: '20:00',
      phase3: '20:55',
      enabled: { phase1: false, phase2: false, phase3: false },
    },
  };
}

export function clampRaidPollMinutes(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_RAID_POLL_MINUTES;
  return Math.max(MIN_RAID_POLL_MINUTES, Math.round(n));
}

/**
 * Times are only a schedule. Discord posts when this is true.
 * Missing `enabled` keeps legacy behaviour (saved times still notify).
 */
export function phaseAnnouncementEnabled(announcements, phaseKey) {
  const flag = announcements?.enabled?.[phaseKey];
  if (flag === undefined || flag === null) return true;
  return flag === true;
}

export function computeRaidAnnouncementMinutes(raid) {
  const computed = { phase1: [], phase2: null, phase3: null };
  const phases = raid?.phases;
  const evAnn = raid?.announcements || {};
  if (!phases) return computed;

  const p1 = phases[1];
  if (p1 && Array.isArray(evAnn.phase1) && phaseAnnouncementEnabled(evAnn, 'phase1')) {
    const p1Start = getAbsoluteMinutes(p1.dayStart, p1.timeStart);
    const p1End = getAbsoluteMinutes(p1.dayEnd, p1.timeEnd);
    const p1Duration = (p1End - p1Start + WEEK_MINUTES) % WEEK_MINUTES;
    evAnn.phase1.forEach((timeStr) => {
      if (!timeStr) return;
      for (let d = 0; d <= 6; d += 1) {
        const annAbs = getAbsoluteMinutes(d, timeStr);
        if (((annAbs - p1Start + WEEK_MINUTES) % WEEK_MINUTES) <= p1Duration) {
          computed.phase1.push(annAbs);
        }
      }
    });
    computed.phase1.sort((a, b) => a - b);
  }

  const p2 = phases[2];
  if (p2 && evAnn.phase2 && phaseAnnouncementEnabled(evAnn, 'phase2')) {
    computed.phase2 = getAbsoluteMinutes(p2.dayStart, evAnn.phase2);
  }
  const p3 = phases[3];
  if (p3 && evAnn.phase3 && phaseAnnouncementEnabled(evAnn, 'phase3')) {
    computed.phase3 = getAbsoluteMinutes(p3.dayStart, evAnn.phase3);
  }
  return computed;
}

export function publishedIdForRaid(warDate, eventKey) {
  if (!warDate || !eventKey) return null;
  return `${warDate}_${eventKey}`;
}

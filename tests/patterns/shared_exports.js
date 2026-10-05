import { readFileSync } from 'node:fs';
import { patterns } from './registry.js';
import {
  COMMITMENT_CONFIRMED,
  COMMITMENT_LEAVE,
  COMMITMENT_NO_CONFIRM,
  COMMITMENT_NONE,
  normalizeCommitmentStatus,
  isCalendarCommitted,
  isArchivedRsvp,
} from '@guildname/shared/attendanceStatus';
import { findCrossTabDuplicates, normalizeComposition } from '@guildname/shared/compositionTabs';
import { isRaidEnabled, RAID_PHASE_LABELS, getAbsoluteMinutes } from '@guildname/shared/raidCycle';
import { sanitizeInGameName, foldConfusable, matchOcrTokensToRoster } from '@guildname/shared/inGameAlias';

patterns.shared_exports = 'used';

export function attendanceStatusExports() {
  return {
    statuses: [COMMITMENT_CONFIRMED, COMMITMENT_LEAVE, COMMITMENT_NO_CONFIRM, COMMITMENT_NONE],
    normalize: typeof normalizeCommitmentStatus === 'function',
    isCalendarCommitted: typeof isCalendarCommitted === 'function',
    isArchivedRsvp: typeof isArchivedRsvp === 'function',
  };
}

export function compositionTabHelpersIncludeCrossTab() {
  return {
    findCrossTabDuplicates: typeof findCrossTabDuplicates === 'function',
    normalizeComposition: typeof normalizeComposition === 'function',
    sample: findCrossTabDuplicates({
      a: { slots_allocation: { '0-0': { userId: 'u1' } } },
      b: { slots_allocation: { '1-1': { userId: 'u1' } } },
    }),
  };
}

export function raidCycleHelpersExported() {
  return {
    isRaidEnabled: typeof isRaidEnabled === 'function',
    RAID_PHASE_LABELS,
    getAbsoluteMinutes: typeof getAbsoluteMinutes === 'function',
  };
}

export function inGameAliasHelpersExported() {
  return {
    sanitizeInGameName: typeof sanitizeInGameName === 'function',
    foldConfusable: typeof foldConfusable === 'function',
    matchOcrTokensToRoster: typeof matchOcrTokensToRoster === 'function',
  };
}

export function apiAndSpaShareEntryPoints() {
  // Honesty: no bundler — assert package exports + both trees import @guildname/shared/*
  const pkg = JSON.parse(readFileSync(new URL('../../packages/shared/package.json', import.meta.url), 'utf8'));
  const backendHit = readFileSync(new URL('../../backend/src/api/attendance.routes.js', import.meta.url), 'utf8')
    .includes('@guildname/shared/');
  const frontendHit = readFileSync(new URL('../../frontend/src/games/ragnarok-origin/pages/Scheduler.jsx', import.meta.url), 'utf8')
    .includes('@guildname/shared/');
  return {
    exports: Object.keys(pkg.exports || {}),
    backendImportsShared: backendHit,
    frontendImportsShared: frontendHit,
    honesty: 'Checked shared package export surface and that backend + frontend import paths point at @guildname/shared (no bundler)',
  };
}

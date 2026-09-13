import { parseEnabledGames, RAGNAROK_ORIGIN_ID } from './catalog.js';
import { contributeRagnarokOriginSchedule } from './ragnarok-origin/scheduleContributor.js';

const CONTRIBUTORS = {
  [RAGNAROK_ORIGIN_ID]: contributeRagnarokOriginSchedule,
};

export async function collectScheduleContributions({ enabledGameIds, from, to, timezone }) {
  const enabled = parseEnabledGames(enabledGameIds);
  const events = [];
  for (const gameId of enabled) {
    const contribute = CONTRIBUTORS[gameId];
    if (!contribute) continue;
    const batch = await contribute({ from, to, timezone });
    if (Array.isArray(batch)) events.push(...batch);
  }
  return events;
}

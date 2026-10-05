import { gameSetupMap, isRagnarokSetupComplete, RAGNAROK_ORIGIN_ID } from '../../backend/src/games/catalog.js';
import { patterns } from './registry.js';

patterns.ro_setup_completeness = 'used';
patterns.channel_or_gate = 'used';

export function allThreeChannelIdsEmptyIncomplete() {
  return isRagnarokSetupComplete({
    aucreqChannelId: '',
    auctionChannelId: '',
    warAnnounceChannelId: '',
  });
}

export function eachSingleChannelCompletes() {
  return {
    aucreq: isRagnarokSetupComplete({ aucreqChannelId: 'ch-1', auctionChannelId: '', warAnnounceChannelId: '' }),
    auction: isRagnarokSetupComplete({ aucreqChannelId: '', auctionChannelId: 'ch-2', warAnnounceChannelId: '' }),
    warAnnounce: isRagnarokSetupComplete({ aucreqChannelId: '', auctionChannelId: '', warAnnounceChannelId: 'ch-3' }),
  };
}

export function gameSetupMapRoRequiresEnabledAndComplete() {
  const enabledIncomplete = gameSetupMap([RAGNAROK_ORIGIN_ID], {
    aucreqChannelId: '',
    auctionChannelId: '',
    warAnnounceChannelId: '',
  });
  const enabledComplete = gameSetupMap([RAGNAROK_ORIGIN_ID], {
    auctionChannelId: 'ch-2',
  });
  return { enabledIncomplete, enabledComplete };
}

import { describe, expect, it } from 'vitest';
import {
  allThreeChannelIdsEmptyIncomplete,
  eachSingleChannelCompletes,
  gameSetupMapRoRequiresEnabledAndComplete,
} from '../../patterns/ro_setup_completeness.js';
import { RAGNAROK_ORIGIN_ID } from '../../../backend/src/games/catalog.js';

describe('TST-ROO-049 RoSetupCompleteness requires aucreq OR auction OR warAnnounce', () => {
  it('All three channel ids empty → RO incomplete', () => {
    expect(allThreeChannelIdsEmptyIncomplete()).toBe(false);
  });

  it('Any one of aucreq/auction/warAnnounce set → complete', () => {
    const { aucreq, auction, warAnnounce } = eachSingleChannelCompletes();
    expect(aucreq).toBe(true);
    expect(auction).toBe(true);
    expect(warAnnounce).toBe(true);
  });

  it('gameSetupMap marks RO complete only when enabled AND complete', () => {
    const { enabledIncomplete, enabledComplete } = gameSetupMapRoRequiresEnabledAndComplete();
    expect(enabledIncomplete[RAGNAROK_ORIGIN_ID]).toBe(false);
    expect(enabledComplete[RAGNAROK_ORIGIN_ID]).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import {
  routeAttcardSkipsGate,
  routeOcrSkipsGate,
  routePartycardSkipsGate,
  routeReqcardSkipsGate,
  routeAuctionClaimSkipsGate,
  routeOnboardSkipsGate,
  unknownPrefixFallsThrough,
} from '../../patterns/custom_id_route.js';

describe('TST-ROO-096 InteractionRouterByCustomId dispatches card prefixes and skips the general-room gate', () => {
  it('attcard prefix goes to the attendance card handler and skips the gate', async () => {
    const r = await routeAttcardSkipsGate();
    expect(r.dispatched).toBe(true);
    expect(r.gateApplied).toBe(false);
  });

  it('ocr prefix goes to the party OCR handler and skips the gate', async () => {
    const r = await routeOcrSkipsGate();
    expect(r.dispatched).toBe(true);
    expect(r.gateApplied).toBe(false);
  });

  it('partycard prefix goes to the party viewer and skips the gate', async () => {
    const r = await routePartycardSkipsGate();
    expect(r.dispatched).toBe(true);
    expect(r.gateApplied).toBe(false);
  });

  it('reqcard prefix goes to the request deck and skips the gate', async () => {
    const r = await routeReqcardSkipsGate();
    expect(r.dispatched).toBe(true);
    expect(r.gateApplied).toBe(false);
  });

  it('Auction claim panel ids go to the interactive auction handler and skip the gate', async () => {
    const r = await routeAuctionClaimSkipsGate();
    expect(r.dispatched).toBe(true);
    expect(r.gateApplied).toBe(false);
  });

  it('onboard prefix goes to the onboarding card handler and skips the gate', async () => {
    const r = await routeOnboardSkipsGate();
    expect(r.dispatched).toBe(true);
    expect(r.gateApplied).toBe(false);
  });

  it('An unknown prefix does not take a card route', async () => {
    const r = await unknownPrefixFallsThrough();
    expect(r.cardRouteHits).toBe(0);
  });
});

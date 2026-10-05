import { describe, expect, it } from 'vitest';
import {
  enableInactiveSeatPaymentRequired,
  enableKnownGameIdempotent,
  enableReturnsSetupPathInBody,
  enableUnknownGameRefused,
  setupPathForAg,
  setupPathForRo,
} from '../../patterns/enable_known_game.js';
import { ADVENTURER_GUILD_ID, RAGNAROK_ORIGIN_ID } from '../../../backend/src/games/catalog.js';

describe('TST-ROO-047 EnableKnownGame appends known id with active seat and setupPath', () => {
  it('Officer + active seat appends known gameId idempotently', async () => {
    const { first, second, enabled } = await enableKnownGameIdempotent();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(enabled.filter((id) => id === RAGNAROK_ORIGIN_ID)).toHaveLength(1);
  });

  it('RO enable returns setupPath /games/ragnarok-origin/setup', async () => {
    expect(setupPathForRo()).toBe('/games/ragnarok-origin/setup');
    const { status, body } = await enableReturnsSetupPathInBody(RAGNAROK_ORIGIN_ID);
    expect(status).toBe(200);
    expect(body.setupPath).toBe('/games/ragnarok-origin/setup');
  });

  it('AG enable returns AG home path (no setup route)', async () => {
    expect(setupPathForAg()).toBe('/games/adventurer-guild');
    const { status, body } = await enableReturnsSetupPathInBody(ADVENTURER_GUILD_ID);
    expect(status).toBe(200);
    expect(body.setupPath).toBe('/games/adventurer-guild');
  });

  it('Inactive seat → payment_required surface', async () => {
    const { status, body } = await enableInactiveSeatPaymentRequired();
    expect(status).toBe(402);
    expect(body.code).toBe('payment_required');
  });

  it('Unknown gameId refused', async () => {
    const { status, body, enabled, setCalls } = await enableUnknownGameRefused();
    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(setCalls).toHaveLength(0);
    expect(enabled).toEqual([RAGNAROK_ORIGIN_ID]);
  });
});

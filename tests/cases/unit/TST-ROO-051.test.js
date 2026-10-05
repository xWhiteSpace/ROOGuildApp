import { describe, expect, it } from 'vitest';
import {
  gameSetupInactiveSeatPaymentRequired,
  gameSetupRequiresRoEnabled,
  persistsChannelFields,
  persistsWarRoomsOneThroughFive,
} from '../../patterns/ro_channel_map.js';

describe('TST-ROO-051 RoChannelMapPersistence writes war rooms 1–5 and channel fields', () => {
  it('Persists auction/aucreq/genroom/attendance/warAnnounce/raidScreenshot', async () => {
    const { status, saved } = await persistsChannelFields();
    expect(status).toBe(200);
    expect(saved).toMatchObject({
      auctionChannelId: 'auc',
      aucreqChannelId: 'req',
      genroomId: 'gen',
      attendanceId: 'att',
      warAnnounceChannelId: 'war',
      raidScreenshotChannelId: 'shot',
      onboardingChannelId: 'onboard',
    });
  });

  it('Persists warRooms DISCORD_WARROOM_ID_1..5', async () => {
    const warRooms = await persistsWarRoomsOneThroughFive();
    expect(warRooms).toEqual({
      DISCORD_WARROOM_ID_1: 'a',
      DISCORD_WARROOM_ID_2: 'b',
      DISCORD_WARROOM_ID_3: 'c',
      DISCORD_WARROOM_ID_4: 'd',
      DISCORD_WARROOM_ID_5: 'e',
    });
  });

  it('RO not enabled → game_required refuse', async () => {
    const { status, body } = await gameSetupRequiresRoEnabled();
    expect(status).toBe(403);
    expect(body.code).toBe('game_required');
  });

  it('Inactive seat → payment_required surface', async () => {
    const { status, body } = await gameSetupInactiveSeatPaymentRequired();
    expect(status).toBe(402);
    expect(body.code).toBe('payment_required');
  });
});

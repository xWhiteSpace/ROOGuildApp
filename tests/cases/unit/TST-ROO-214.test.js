import { describe, expect, it } from 'vitest';
import {
  itemsAndEventsEmpty,
  leaveCreditsAndLiveRaidCaps,
  specialEventCategoriesFour,
  emptyPlaceholders,
  helpEmbedUrlsEmpty,
  roMergedWithWorkspace,
} from '../../patterns/ro_defaults.js';

describe('TST-ROO-214 RagnarokOriginDefaultSeeds merge into DEFAULT_CONFIGURATION', () => {
  it('items and events start empty', () => {
    const r = itemsAndEventsEmpty();
    expect(r.items).toEqual([]);
    expect(r.events).toEqual({});
  });

  it('leave credits and live-raid caps are the named numbers', () => {
    const r = leaveCreditsAndLiveRaidCaps();
    expect(r.defaultLeaveCredits).toBe(3);
    expect(r.liveRaidMaxConfigs).toBe(5);
    expect(r.liveRaidMaxWarRooms).toBe(2);
  });

  it('specialEventCategories is the four named categories', () => {
    expect(specialEventCategoriesFour()).toEqual(['Raid', 'Meeting', 'PVP', 'Casual']);
  });

  it('warRooms, jobs, and roles are empty placeholders', () => {
    const r = emptyPlaceholders();
    expect(r.warRooms).toEqual({});
    expect(r.jobs).toEqual({});
    expect(r.roles).toEqual({});
  });

  it('help embed URLs start empty', () => {
    const r = helpEmbedUrlsEmpty();
    expect(r.helpEmbedUrl).toBe('');
    expect(r.raidHelpEmbedUrl).toBe('');
  });

  it('RO seeds merge with workspace defaults', () => {
    const r = roMergedWithWorkspace();
    expect(r.defaults).toEqual(r.expected);
  });
});

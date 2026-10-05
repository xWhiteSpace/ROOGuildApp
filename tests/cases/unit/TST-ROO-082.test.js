import { describe, expect, it } from 'vitest';
import {
  gameScopeMergesNonWorkspace,
  gameScopePersistsChannels,
  missingConfigDoesNotSave,
  nonOfficerDoesNotSave,
  omittedScopeDefaultsToGame,
  overlappingRaidCyclesRefuse,
  workspaceScopeMergesWorkspaceOnly,
} from '../../patterns/settings_save.js';

describe('TST-ROO-082 SettingsSaveWorkspaceOrGame merges by scope and rejects overlapping raid cycles', () => {
  it('Workspace scope merges workspace keys only', async () => {
    const { res, saved } = await workspaceScopeMergesWorkspaceOnly();
    expect(res.status).toBe(200);
    expect(saved.guildDisplayName).toBe('New Name');
    expect(saved.timezone).toBe('Asia/Tokyo');
    expect(saved.helpEmbedUrl).toBe('https://old.example/help');
    expect(saved.items[0].id).toBe('puppet');
  });

  it('Game scope merges non-workspace keys', async () => {
    const { res, saved } = await gameScopeMergesNonWorkspace();
    expect(res.status).toBe(200);
    expect(saved.helpEmbedUrl).toBe('https://new.example/help');
    expect(saved.items[0].id).toBe('card');
    expect(saved.guildDisplayName).toBe('Old Name');
  });

  it('Omitted scope defaults to game', async () => {
    const { res, saved } = await omittedScopeDefaultsToGame();
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Game settings/i);
    expect(saved.helpEmbedUrl).toBe('https://default-game.example/help');
    expect(saved.items[0].id).toBe('orb');
  });

  it('Game scope may persist discordChannels', async () => {
    const { res, channels, saved } = await gameScopePersistsChannels();
    expect(res.status).toBe(200);
    expect(channels).toEqual({ auctionChannelId: '999' });
    expect(saved.helpEmbedUrl).toBe('https://chan.example/help');
  });

  it('Overlapping raid cycles on game scope do not save', async () => {
    const { res, before, after } = await overlappingRaidCyclesRefuse();
    expect(res.status).toBe(400);
    expect(after).toEqual(before);
  });

  it('Non-officer does not save', async () => {
    const { res, before, after } = await nonOfficerDoesNotSave();
    expect(res.status).toBe(403);
    expect(after).toEqual(before);
  });

  it('Missing config does not save', async () => {
    const { res, before, after } = await missingConfigDoesNotSave();
    expect(res.status).toBe(400);
    expect(after).toEqual(before);
  });
});

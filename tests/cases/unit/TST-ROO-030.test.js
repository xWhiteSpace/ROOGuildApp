import { describe, expect, it } from 'vitest';
import {
  nonOfficerWorkspaceRefused,
  officerReadsWorkspaceSettings,
  officerUpdatesWorkspaceSettings,
} from '../../patterns/workspace_settings.js';

describe('TST-ROO-030 WorkspaceSettingsService officer-only read/update display/timezone/adminRoles', () => {
  it('Officer can read display name, timezone, adminRoles + Discord roles', async () => {
    const { status, body } = await officerReadsWorkspaceSettings();
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.workspace).toMatchObject({
      guildDisplayName: expect.any(String),
      timezone: expect.any(String),
      adminRoles: expect.any(Array),
    });
    expect(body.discordRoles.every((r) => r.name !== '@everyone')).toBe(true);
  });

  it('Officer can update display/timezone/adminRoles', async () => {
    const { status, body, persisted, setName } = await officerUpdatesWorkspaceSettings();
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(setName).toHaveBeenCalled();
    expect(persisted).toMatchObject({
      guildDisplayName: 'Renamed Guild',
      timezone: 'Asia/Tokyo',
      adminRoles: ['Raid Lead', 'Officer'],
    });
  });

  it('Non-officer refused', async () => {
    const { read, update } = await nonOfficerWorkspaceRefused();
    expect(read.status).toBe(403);
    expect(update.status).toBe(403);
  });
});

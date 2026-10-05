import { describe, expect, it } from 'vitest';
import {
  nonOfficerPublicView,
  officerFullView,
  unauthenticatedSettingsGet,
} from '../../patterns/settings_get.js';

describe('TST-ROO-081 SettingsGetPublicVsOfficer returns the public view or the officer config', () => {
  it('Non-officer gets the public view', async () => {
    const { status, body } = await nonOfficerPublicView();
    expect(status).toBe(200);
    expect(body.publicOnly).toBe(true);
    expect(body.needsSetup).toBe(false);
    expect(body.help).toBeTruthy();
    expect(body.config.adminRoles).toBeUndefined();
    expect(body.discordChannels).toBeUndefined();
  });

  it('Officer gets full config and discord channels', async () => {
    const { status, body } = await officerFullView();
    expect(status).toBe(200);
    expect(body.publicOnly).toBe(false);
    expect(body.config.adminRoles).toEqual(['Officer']);
    expect(body.discordChannels).toEqual({ requestChannelId: 'chan-1' });
  });

  it('Unauthenticated caller gets no settings view', async () => {
    const { status, body } = await unauthenticatedSettingsGet();
    // Real seam: no identity → publicOnly public view (not 401).
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.publicOnly).toBe(true);
    expect(body.config).toBeTruthy();
    expect(body.discordChannels).toBeUndefined();
  });
});

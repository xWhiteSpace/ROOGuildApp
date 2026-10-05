import { describe, expect, it } from 'vitest';
import {
  onboardAlreadyOnboardedConflict,
  onboardBotMissingInviteUrl,
  onboardHappyPathCreatesTenant,
  onboardMissingOfficerRolesRefused,
  onboardRequiresManageServerNotOfficerTools,
} from '../../patterns/onboard_gates.js';

describe('TST-ROO-026 WorkspaceOnboard gates Manage Server, bot presence, officer roles; 409/bot_not_in_guild', () => {
  it('Happy path: Manage Server + bot in guild + ≥1 officer role → create tenant', async () => {
    const { status, body, createSpy } = await onboardHappyPathCreatesTenant();
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(createSpy).toHaveBeenCalled();
    const args = createSpy.mock.calls[0][0];
    expect(args).toMatchObject({
      onboarded: true,
      discordChannels: expect.objectContaining({
        auctionChannelId: '',
        aucreqChannelId: '',
        genroomId: '',
        attendanceId: '',
        onboardingChannelId: '',
      }),
    });
  });

  it('Already onboarded → 409', async () => {
    const { status, body } = await onboardAlreadyOnboardedConflict();
    expect(status).toBe(409);
    expect(body.success).toBe(false);
    expect(String(body.error || '')).toMatch(/already/i);
  });

  it('Bot not in guild → bot_not_in_guild + invite URL', async () => {
    const { status, body } = await onboardBotMissingInviteUrl();
    expect(status).toBe(409);
    expect(body.code).toBe('bot_not_in_guild');
    expect(body.inviteUrl).toMatch(/discord\.com\/oauth2\/authorize/);
  });

  it('Missing officer role names refused', async () => {
    const { status, body, createSpy } = await onboardMissingOfficerRolesRefused();
    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('Manage Server required for create (not day-to-day officer tools)', async () => {
    const { status, body, createSpy } = await onboardRequiresManageServerNotOfficerTools();
    expect(status).toBe(403);
    expect(body.success).toBe(false);
    expect(String(body.error || '')).toMatch(/Manage Server/i);
    expect(createSpy).not.toHaveBeenCalled();
  });
});

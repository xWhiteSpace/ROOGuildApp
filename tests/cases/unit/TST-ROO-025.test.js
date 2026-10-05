import { describe, expect, it } from 'vitest';
import {
  selectBuildsSessionOfficerAndGames,
  selectRequiresMembershipVisibility,
  selectUpsertsAuctionMember,
} from '../../patterns/tenant_select.js';

describe('TST-ROO-025 TenantSelectAndRosterSync builds session and upserts auction member', () => {
  it('Select requires membership visibility', async () => {
    const { status, body } = await selectRequiresMembershipVisibility();
    expect(status).toBe(403);
    expect(body.success).toBe(false);
  });

  it('Select builds session user with officer flag and enabled games', async () => {
    const { status, body } = await selectBuildsSessionOfficerAndGames();
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.user).toMatchObject({
      isOfficer: true,
      enabledGames: expect.arrayContaining(['adventurer-guild', 'ragnarok-origin']),
      subscriptionAllowed: true,
    });
  });

  it('Select upserts auction/members/{discordId} displayName/roles/syncedAt', async () => {
    const { user, updateMock } = await selectUpsertsAuctionMember();
    expect(user.displayName).toEqual(expect.any(String));
    expect(updateMock).toHaveBeenCalled();
    const patch = updateMock.mock.calls[0][0];
    expect(patch).toMatchObject({
      displayName: expect.any(String),
      syncedAt: expect.any(String),
    });
    expect(patch.roles === undefined || Array.isArray(patch.roles)).toBe(true);
  });
});

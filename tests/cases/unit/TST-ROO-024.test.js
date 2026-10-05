import { describe, expect, it } from 'vitest';
import {
  capacityFullClearsOnboardable,
  manageServerOnboardableWhenCapacityAllows,
  visibleOnboardedTenantsForMember,
} from '../../patterns/mine_list.js';

describe('TST-ROO-024 MineAndOnboardableDiscovery lists onboarded and capacity-gated onboardable', () => {
  it('Visible onboarded tenants returned for member', async () => {
    const { status, body } = await visibleOnboardedTenantsForMember();
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.tenants.map((t) => t.id)).toContain('guild-on');
    expect(body.tenants.find((t) => t.id === 'guild-on')?.onboarded).toBe(true);
  });

  it('Manage-Server guilds appear as onboardable when capacity allows', async () => {
    const { status, body } = await manageServerOnboardableWhenCapacityAllows();
    expect(status).toBe(200);
    expect(body.onboardable.map((g) => g.id)).toContain('guild-ms');
    expect(body.billing.full).toBe(false);
  });

  it('Capacity full → onboardable empty + billing capacity flags', async () => {
    const { status, body } = await capacityFullClearsOnboardable();
    expect(status).toBe(200);
    expect(body.onboardable).toEqual([]);
    expect(body.billing).toMatchObject({ full: true, activeCount: 20, cap: 20 });
  });
});

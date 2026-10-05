import { describe, expect, it } from 'vitest';
import {
  noTenant409,
  inactiveSeat402,
  activeSeatContinues,
} from '../../patterns/seat_gate.js';

describe('TST-ROO-205 RequireActiveSubscriptionGate returns tenant_required or payment_required then continues for active seats', () => {
  it('no current tenant is 409 tenant_required', async () => {
    const r = await noTenant409();
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('tenant_required');
    expect(r.nextCalled).toBe(false);
  });

  it('an inactive seat is 402 payment_required', async () => {
    const r = await inactiveSeat402();
    expect(r.status).toBe(402);
    expect(r.body.code).toBe('payment_required');
    expect(r.body.error).toMatch(/active seat/i);
    expect(r.nextCalled).toBe(false);
  });

  it('an active seat continues', async () => {
    const r = await activeSeatContinues();
    expect(r.nextCalled).toBe(true);
    expect(r.status).toBe(200);
  });
});

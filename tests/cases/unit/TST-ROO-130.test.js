import { describe, expect, it } from 'vitest';
import {
  armCapturesTenantIncludingDelayed,
  intervalPulsesUseCapturedTenant,
  noTenantAtArmSkipsRunWithTenant,
  stopPulseClearsIntervalTicker,
} from '../../patterns/tenant_captured_at_arm.js';

describe('TST-ROO-130 VoiceMonitoringKeepsArmingTenant runs pulses under the tenant captured at arm time, or without a tenant when none was current', () => {
  it('Arming captures the current tenant, including the delayed start', async () => {
    const r = await armCapturesTenantIncludingDelayed();
    expect(r.scheduled).toBe(true);
    expect(r.tenantCapturedInPulse).toBe(true);
  });

  it('Interval pulses and the delayed start use that tenant', async () => {
    const r = await intervalPulsesUseCapturedTenant();
    expect(r.pulseTenantCalls).toBeGreaterThanOrEqual(1);
  });

  it('No tenant at arm time does not use runWithTenant', async () => {
    const r = await noTenantAtArmSkipsRunWithTenant();
    expect(r.tickerRunWithTenantCalls).toBe(0);
  });

  it('A stop pulse still clears the interval ticker', async () => {
    const r = await stopPulseClearsIntervalTicker();
    expect(r.hadPulseInterval).toBe(true);
    expect(r.tickerCleared).toBe(true);
  });
});

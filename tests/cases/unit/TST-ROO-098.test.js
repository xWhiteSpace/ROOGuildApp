import { describe, expect, it } from 'vitest';
import {
  trip429WithRetryAfterStoresHold,
  trip429WithoutRetryAfterUsesDefault,
  statusHumanNoSecrets,
  enqueueRefusesWhileOpen,
  enqueueSendsWhenClosed,
  hydrateFromPlatformStore,
} from '../../patterns/circuit_breaker.js';

describe('TST-ROO-098 Discord429CircuitBreaker opens on 429, refuses outbound REST, and returns human status without secrets', () => {
  it('A 429 with Retry-After stores an open circuit for that hold', async () => {
    const r = await trip429WithRetryAfterStoresHold();
    expect(r.circuitOpen).toBe(true);
    expect(r.until).toBeGreaterThan(Date.now());
    expect(r.remainingMs).toBeGreaterThan(30_000);
    expect(r.remainingMs).toBeLessThanOrEqual(r.holdMsApprox + 2000);
    // Honesty: persisted leaf uses `until` (and last meta), not a `circuit_open` boolean key.
    expect(r.stored?.until).toBeTruthy();
  });

  it('A 429 or rate-limit/soft-ban with Retry-After omitted uses the default hold', async () => {
    const r = await trip429WithoutRetryAfterUsesDefault();
    expect(r.circuitOpen).toBe(true);
    expect(r.withinDefault).toBe(true);
  });

  it('Status returns human remaining and until and no secrets', async () => {
    const r = await statusHumanNoSecrets();
    expect(r.circuitOpen).toBe(true);
    expect(typeof r.remainingHuman).toBe('string');
    expect(r.remainingHuman).not.toBe('none');
    expect(typeof r.untilHuman).toBe('string');
    expect(r.secretHits).toEqual([]);
  });

  it('Enqueue refuses outbound REST while the circuit is open', async () => {
    const r = await enqueueRefusesWhileOpen();
    expect(r.open).toBe(true);
    expect(r.refused).toBe(true);
    expect(r.sent).toBe(0);
  });

  it('Enqueue sends only after it sees the circuit closed', async () => {
    const r = await enqueueSendsWhenClosed();
    expect(r.open).toBe(false);
    expect(r.sent).toBe(1);
    expect(r.result).toBe('ok-sent');
  });

  it('A non-local restart can hydrate stored circuit state from the platform store', async () => {
    const r = await hydrateFromPlatformStore();
    expect(r.hydratedOpen).toBe(true);
    expect(r.circuitOpen).toBe(true);
    expect(r.remainingMs).toBeGreaterThan(0);
    expect(r.untilHuman).toBeTruthy();
  });
});

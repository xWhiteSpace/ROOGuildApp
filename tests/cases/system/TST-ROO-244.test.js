import { describe, expect, it } from 'vitest';
import {
  gateOfficerSuccess,
  gateUnmapped,
  gateBotOffline,
  gateCircuitOpen,
  gateLocateMiss,
  gateNotOfficer,
  aliasStatusMatchesRoot,
  unmappedDoesNotPost,
} from '../../patterns/deploy_onboarding_card.js';

describe('TST-ROO-244 DeployOnboardingCard posts the hub or returns the gate statuses', () => {
  it('Officer deploy posts the Onboarding hub to the mapped onboarding channel', () => {
    const r = gateOfficerSuccess();
    expect(r.status).toBe(200);
    expect(r.post).toBe(true);
  });

  it('Unmapped channel returns 400 and does not post', async () => {
    const gate = gateUnmapped();
    expect(gate.status).toBe(400);
    expect(gate.post).toBe(false);
    const live = await unmappedDoesNotPost();
    expect(live.posted).toBe(false);
    expect(live.message).toMatch(/not configured/i);
  });

  it('Bot offline or an open circuit returns 503 and does not post', () => {
    const offline = gateBotOffline();
    expect(offline.status).toBe(503);
    expect(offline.post).toBe(false);
    const circuit = gateCircuitOpen();
    expect(circuit.status).toBe(503);
    expect(circuit.post).toBe(false);
  });

  it('A mapped channel that cannot be located returns 404 and does not post', () => {
    const r = gateLocateMiss();
    expect(r.status).toBe(404);
    expect(r.post).toBe(false);
  });

  it('A caller who is not an authenticated officer returns 403 and does not post', () => {
    const r = gateNotOfficer();
    expect(r.status).toBe(403);
    expect(r.post).toBe(false);
  });

  it('Attendance alias does not diverge from root deploy', () => {
    const r = aliasStatusMatchesRoot();
    expect(r.unmapped).toBe(400);
    expect(r.offline).toBe(503);
    expect(r.blocking).toBe(503);
    expect(r.locate).toBe(404);
  });
});

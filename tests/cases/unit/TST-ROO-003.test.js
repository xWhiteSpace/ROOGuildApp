import { describe, expect, it } from 'vitest';
import { failedHealthBody, onlineHealthBody } from '../../patterns/health_probe_unit.js';

describe('TST-ROO-003 HealthProbe maps DB ping success/failure to HTTP outcomes', () => {
  it('DB ping success → online body', async () => {
    const { status, body, text } = await onlineHealthBody();
    expect(status).toBe(200);
    expect(String(body ?? text)).toMatch(/online/i);
  });

  it('DB ping failure → 503 failure body', async () => {
    const { status, body, text } = await failedHealthBody();
    expect(status).toBe(503);
    expect(String(body ?? text)).toMatch(/online|warming|fail/i);
  });
});

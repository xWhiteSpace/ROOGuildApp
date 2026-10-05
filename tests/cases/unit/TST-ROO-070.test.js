import { describe, expect, it } from 'vitest';
import {
  lowerVersionDoesNotOverwrite,
  missingPayloadDoesNotWrite,
  nonOfficerDoesNotWrite,
  officerWriteStoresSession,
} from '../../patterns/optimistic_version.js';

describe('TST-ROO-070 MimicSessionOptimisticUpdate writes a session only when version is not lower', () => {
  it('Officer write with version not lower stores the session', async () => {
    const { res, stored } = await officerWriteStoresSession();
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(stored.marker).toBe('new');
    expect(stored.version).toBe(2);
    expect(stored.lastUpdated).toBeGreaterThan(1);
  });

  it('Lower version does not overwrite the stored session', async () => {
    const { res, stored } = await lowerVersionDoesNotOverwrite();
    expect(res.status).toBe(200);
    expect(stored.marker).toBe('keep');
    expect(stored.version).toBe(5);
  });

  it('Non-officer does not write', async () => {
    const { res, stored } = await nonOfficerDoesNotWrite();
    expect(res.status).toBe(403);
    expect(stored.marker).toBe('keep');
  });

  it('Missing session payload does not write', async () => {
    const { res, stored } = await missingPayloadDoesNotWrite();
    expect(res.status).toBe(400);
    expect(stored.marker).toBe('keep');
  });
});

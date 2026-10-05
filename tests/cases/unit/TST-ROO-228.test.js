import { describe, expect, it } from 'vitest';
import {
  apiFetchSendsCredentialsInclude,
  presentSessionAttachesHeaders,
  http402OffBillingAssignsBilling,
  http402MissingMessageUsesDefault,
  http402AlreadyOnBillingNoRedirect,
} from '../../patterns/api_fetch_402.js';

describe('TST-ROO-228 ApiFetchCredentialsAndBillingRedirect sends cookies and routes 402 to billing', () => {
  it('apiFetch sends credentials include', async () => {
    const r = await apiFetchSendsCredentialsInclude();
    expect(r.credentials).toBe('include');
  });

  it('A present session attaches signed profile and tenant headers', async () => {
    const r = await presentSessionAttachesHeaders();
    expect(r.profile).toBeTruthy();
    expect(r.tenant).toBe('guild-1');
  });

  it('HTTP 402 off the billing path assigns billing', async () => {
    const r = await http402OffBillingAssignsBilling();
    expect(r.assigns).toContain('/workspace/billing');
    expect(r.message).toMatch(/Seat required now/);
  });

  it('After the redirect starts, the response error message is thrown', async () => {
    const r = await http402OffBillingAssignsBilling();
    expect(r.message).toMatch(/Seat required now/);
  });

  it('After the redirect starts, a missing message throws the seat-needed default', async () => {
    const r = await http402MissingMessageUsesDefault();
    expect(r.assigns).toContain('/workspace/billing');
    expect(r.message).toMatch(/needs an active seat/i);
  });

  it('HTTP 402 already on billing does not count as a redirect', async () => {
    const r = await http402AlreadyOnBillingNoRedirect();
    expect(r.assigns).toHaveLength(0);
    expect(r.threw).toBe(true);
  });
});

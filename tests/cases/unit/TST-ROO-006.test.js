import { describe, expect, it } from 'vitest';
import { deployedHttpsCookie, localHttpCookie } from '../../patterns/cookie_policy_matrix.js';

describe('TST-ROO-006 SessionCookiePolicy local HTTP vs deployed HTTPS flags', () => {
  it('Local HTTP cookie policy', () => {
    expect(localHttpCookie()).toMatchObject({ secure: false, sameSite: 'lax', httpOnly: true });
  });

  it('Deployed HTTPS cookie policy', () => {
    expect(deployedHttpsCookie()).toMatchObject({ secure: true, sameSite: 'none', httpOnly: true });
  });
});

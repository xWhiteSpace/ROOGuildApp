import { describe, expect, it } from 'vitest';
import { signForMe } from '../../patterns/hmac_sign.js';
import { resignedProfileVerifies, unauthenticatedMe } from '../../patterns/profile_resign.js';

describe('TST-ROO-005 ProfileSigner re-signs profile for authenticated /auth/me payload', () => {
  it('Authenticated me includes re-signed profile', () => {
    const signed = signForMe({ id: 'member-9', username: 'Ada', displayName: 'Ada' });
    expect(signed._sig).toEqual(expect.any(String));
    expect(resignedProfileVerifies(signed)).toMatchObject({
      id: 'member-9',
      username: 'Ada',
      displayName: 'Ada',
    });
  });

  it('Unauthenticated me returns authenticated:false', async () => {
    const { status, body } = await unauthenticatedMe();
    expect(status).toBe(200);
    expect(body).toEqual({ authenticated: false, user: null });
  });
});

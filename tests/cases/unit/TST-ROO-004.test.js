import { describe, expect, it } from 'vitest';
import { headerFor, identityFromHeader, rejectUnsignedProfile } from '../../patterns/hmac_verify.js';
import { sessionBeatsHeader } from '../../patterns/identity_resolution.js';

describe('TST-ROO-004 IdentityResolver prefers session then HMAC x-user-profile', () => {
  it('Session user wins over header', () => {
    expect(sessionBeatsHeader()).toMatchObject({ id: 'session-user', username: 'Session' });
  });

  it('Valid HMAC x-user-profile accepted without session', () => {
    const header = headerFor({ id: 'header-user', username: 'Ada' });
    expect(identityFromHeader(header)).toMatchObject({ id: 'header-user', username: 'Ada' });
  });

  it('Invalid/unsigned profile rejected', () => {
    const signed = headerFor({ id: 'header-user', username: 'Ada' });
    const tampered = JSON.parse(decodeURIComponent(signed));
    tampered._sig = 'not-a-real-signature';
    expect(identityFromHeader(encodeURIComponent(JSON.stringify(tampered)))).toBeNull();
    expect(rejectUnsignedProfile()).toBeNull();
  });
});

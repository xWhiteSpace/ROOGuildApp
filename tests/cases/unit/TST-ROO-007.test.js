import { describe, expect, it } from 'vitest';
import { authorizeStateForIntent, authorizeUrlWithRequiredScopes } from '../../patterns/oauth_authorize_url.js';

describe('TST-ROO-007 OAuthLoginStart builds Discord authorize URL with scopes and intent', () => {
  it('Scopes include identify guilds guilds.members.read', async () => {
    const { status, location, url } = await authorizeUrlWithRequiredScopes();
    expect(status).toBe(302);
    expect(location).toMatch(/discord\.com\/api\/oauth2\/authorize/);
    const scope = decodeURIComponent(url.searchParams.get('scope') || '');
    expect(scope.split(/\s+/)).toEqual(expect.arrayContaining([
      'identify',
      'guilds',
      'guilds.members.read',
    ]));
  });

  it('State carries signin|signup intent', async () => {
    const signin = await authorizeStateForIntent('signin');
    const signup = await authorizeStateForIntent('signup');
    expect(signin.status).toBe(302);
    expect(signup.status).toBe(302);
    expect(signin.state).toBe('signin');
    expect(signup.state).toBe('signup');
  });
});

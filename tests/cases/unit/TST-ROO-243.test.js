import { describe, expect, it } from 'vitest';
import {
  storedFieldResolves,
  emptyOrMissingStaysEmpty,
  processEnvDoesNotFillEmpty,
} from '../../patterns/channel_map.js';
import { setupCompletenessIgnoresOnboarding } from '../../patterns/onboarding_card.js';

describe('TST-ROO-243 OnboardingChannelResolver reads tenant JSON and never process.env', () => {
  it('A stored onboardingChannelId resolves to that channel id', () => {
    const r = storedFieldResolves();
    expect(r.onboard).toBe('chan-onboard-stored');
  });

  it('An empty or missing onboardingChannelId stays empty', () => {
    const r = emptyOrMissingStaysEmpty();
    expect(r.onboard).toBe('');
  });

  it('process.env does not fill an empty onboardingChannelId', () => {
    const r = processEnvDoesNotFillEmpty();
    expect(r.onboardEnvWasSet).toBe(true);
    expect(r.onboard).toBe('');
  });

  it('Setup completeness ignores onboardingChannelId', () => {
    const r = setupCompletenessIgnoresOnboarding();
    expect(r.onlyOnboarding).toBe(false);
    expect(r.aucreqEmptyOnboarding).toBe(true);
    expect(r.auctionEmptyOnboarding).toBe(true);
    expect(r.warEmptyOnboarding).toBe(true);
  });
});

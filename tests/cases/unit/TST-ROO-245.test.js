import { describe, expect, it } from 'vitest';
import { hubPayloadShape } from '../../patterns/onboarding_card.js';

describe('TST-ROO-245 BuildOnboardingHubPayload emits four onboard customIds', () => {
  it('Hub title is Onboarding', () => {
    expect(hubPayloadShape().title).toBe('Onboarding');
  });

  it('Four buttons are Auction, GvG, General Chat, Website', () => {
    expect(hubPayloadShape().labels).toEqual(['Auction', 'GvG', 'General Chat', 'Website']);
  });

  it('CustomIds are onboard auction gvg general website', () => {
    expect(hubPayloadShape().customIds).toEqual([
      'onboard:auction',
      'onboard:gvg',
      'onboard:general',
      'onboard:website',
    ]);
  });

  it('Hub has no Link buttons', () => {
    expect(hubPayloadShape().linkCount).toBe(0);
  });
});

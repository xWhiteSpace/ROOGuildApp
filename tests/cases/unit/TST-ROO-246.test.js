import { describe, expect, it } from 'vitest';
import {
  mappedAuctionTopic,
  unmappedGvgTopic,
  websiteTopic,
  emptyWebsiteHasNoLink,
} from '../../patterns/onboarding_card.js';

describe('TST-ROO-246 BuildOnboardingTopicPayload explains purpose and location', () => {
  it('A mapped Discord topic includes a channel mention and jump URL', () => {
    const r = mappedAuctionTopic();
    expect(r.description).toContain(r.mention);
    expect(r.description).toMatch(/Request|Live Dashboard/i);
    expect(r.jumpUrl).toBe('https://discord.com/channels/guild-1/chan-aucreq');
    expect(r.back).toBe(true);
  });

  it('An unmapped Discord topic has the officer-paste sentence and no jump', () => {
    const r = unmappedGvgTopic();
    expect(r.description).toContain(r.unmappedSentence);
    expect(r.hasMention).toBe(false);
    expect(r.linkCount).toBe(0);
    expect(r.back).toBe(true);
  });

  it('Website uses the frontend origin', () => {
    const r = websiteTopic();
    expect(r.description).toMatch(/VALHALLA|dashboard/i);
    expect(r.url).toBe('https://valhalla.example');
    expect(r.back).toBe(true);
  });

  it('Back customId is present', () => {
    expect(mappedAuctionTopic().back).toBe(true);
    expect(emptyWebsiteHasNoLink().back).toBe(true);
    expect(emptyWebsiteHasNoLink().linkCount).toBe(0);
  });
});

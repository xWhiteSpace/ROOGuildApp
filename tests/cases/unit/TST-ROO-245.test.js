import { describe, expect, it } from 'vitest';
import { DEFAULT_DISCORD_CARD_COPY } from '../../../backend/src/games/ragnarok-origin/defaults.js';
import {
  blankCopyFallsBack,
  customAuctionPurpose,
  hubPayloadShape,
  mappedMessageTopic,
} from '../../patterns/onboarding_card.js';

describe('TST-ROO-245 BuildOnboardingHubPayload emits five onboard customIds', () => {
  it('Hub title is Onboarding', () => {
    expect(hubPayloadShape().title).toBe('Onboarding');
  });

  it('Five buttons are Auction, GvG, General Chat, Website, Message', () => {
    expect(hubPayloadShape().labels).toEqual(['Auction', 'GvG', 'General Chat', 'Website', 'Message']);
  });

  it('CustomIds are onboard auction gvg general website message', () => {
    expect(hubPayloadShape().customIds).toEqual([
      'onboard:auction',
      'onboard:gvg',
      'onboard:general',
      'onboard:website',
      'onboard:message',
    ]);
  });

  it('Hub has no Link buttons', () => {
    expect(hubPayloadShape().linkCount).toBe(0);
  });

  it('A saved sentence replaces the default purpose', () => {
    const description = customAuctionPurpose();
    expect(description).toContain('Custom auction blurb');
    expect(description).not.toContain('Request weekly auction items');
  });

  it('Message jumps to messageChannelId', () => {
    const topic = mappedMessageTopic();
    expect(topic.title).toBe('Message');
    expect(topic.description).toContain(topic.mention);
    expect(topic.description).toContain(DEFAULT_DISCORD_CARD_COPY.onboarding.message);
    expect(topic.jumpUrl).toBe('https://discord.com/channels/guild-1/chan-msg');
    expect(topic.back).toBe(true);
  });

  it('Blank card copy falls back to the default sentence', () => {
    const fallback = blankCopyFallsBack();
    expect(fallback.message).toBe(DEFAULT_DISCORD_CARD_COPY.onboarding.message);
    expect(fallback.request).toBe(DEFAULT_DISCORD_CARD_COPY.request);
  });
});

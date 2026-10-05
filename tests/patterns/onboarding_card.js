import { ButtonStyle } from 'discord.js';
import { patterns } from './registry.js';
import { isRagnarokSetupComplete } from '../../backend/src/games/catalog.js';
import {
  buildHubPayload,
  buildTopicPayload,
  classifyOnboardingAck,
} from '../../backend/src/games/ragnarok-origin/services/discordOnboardingCard.js';

patterns.onboarding_hub_payload = 'used';
patterns.onboarding_topic_payload = 'used';
patterns.onboarding_ack = 'used';

const UNMAPPED = 'This channel is not mapped yet. Ask an officer to paste the ID in Settings.';

function flattenButtons(payload) {
  return (payload.components || []).flatMap((row) =>
    (row.components || []).map((btn) => btn.data || {}),
  );
}

export function hubPayloadShape() {
  const payload = buildHubPayload();
  const buttons = flattenButtons(payload);
  return {
    title: payload.embeds?.[0]?.data?.title,
    labels: buttons.map((b) => b.label),
    customIds: buttons.map((b) => b.custom_id),
    linkCount: buttons.filter((b) => b.style === ButtonStyle.Link).length,
  };
}

export function mappedAuctionTopic() {
  const payload = buildTopicPayload('auction', {
    aucreqChannelId: 'chan-aucreq',
    guildId: 'guild-1',
  }, { guildId: 'guild-1', frontendUrl: 'https://valhalla.example' });
  const buttons = flattenButtons(payload);
  return {
    description: payload.embeds?.[0]?.data?.description || '',
    mention: '<#chan-aucreq>',
    jumpUrl: buttons.find((b) => b.style === ButtonStyle.Link)?.url,
    back: buttons.some((b) => b.custom_id === 'onboard:back'),
    linkCount: buttons.filter((b) => b.style === ButtonStyle.Link).length,
  };
}

export function unmappedGvgTopic() {
  const payload = buildTopicPayload('gvg', { warAnnounceChannelId: '' }, { guildId: 'guild-1' });
  const buttons = flattenButtons(payload);
  const description = payload.embeds?.[0]?.data?.description || '';
  return {
    description,
    unmappedSentence: UNMAPPED,
    hasMention: /<#/.test(description),
    linkCount: buttons.filter((b) => b.style === ButtonStyle.Link).length,
    back: buttons.some((b) => b.custom_id === 'onboard:back'),
  };
}

export function websiteTopic() {
  const payload = buildTopicPayload('website', {}, { frontendUrl: 'https://valhalla.example/' });
  const buttons = flattenButtons(payload);
  return {
    description: payload.embeds?.[0]?.data?.description || '',
    url: buttons.find((b) => b.style === ButtonStyle.Link)?.url,
    back: buttons.some((b) => b.custom_id === 'onboard:back'),
  };
}

export function emptyWebsiteHasNoLink() {
  const payload = buildTopicPayload('website', {}, { frontendUrl: '' });
  const buttons = flattenButtons(payload);
  return {
    linkCount: buttons.filter((b) => b.style === ButtonStyle.Link).length,
    back: buttons.some((b) => b.custom_id === 'onboard:back'),
  };
}

function mockIx(customId, ephemeral) {
  return {
    customId,
    ephemeral,
    message: { flags: { has: () => ephemeral } },
  };
}

export function publicTopicAck() {
  return classifyOnboardingAck(mockIx('onboard:auction', false));
}

export function inPlaceBackAck() {
  return classifyOnboardingAck(mockIx('onboard:back', true));
}

export function inPlaceTopicAck() {
  return classifyOnboardingAck(mockIx('onboard:gvg', true));
}

export function unknownOnboardAck() {
  return classifyOnboardingAck(mockIx('onboard:unknown', false));
}

export function setupCompletenessIgnoresOnboarding() {
  return {
    onlyOnboarding: isRagnarokSetupComplete({ onboardingChannelId: 'ch-on' }),
    aucreqEmptyOnboarding: isRagnarokSetupComplete({
      aucreqChannelId: 'ch-1',
      onboardingChannelId: '',
    }),
    auctionEmptyOnboarding: isRagnarokSetupComplete({
      auctionChannelId: 'ch-2',
      onboardingChannelId: '',
    }),
    warEmptyOnboarding: isRagnarokSetupComplete({
      warAnnounceChannelId: 'ch-3',
      onboardingChannelId: '',
    }),
  };
}

import { patterns } from './registry.js';
import {
  evaluateDeployOnboardingGate,
  onboardingDeployHttpStatus,
} from '../../backend/src/games/ragnarok-origin/services/discordOnboardingCard.js';
import {
  runWithTenant,
  setCachedChannels,
  clearTenantCaches,
} from '../../backend/src/db/tenantContext.js';
import { deployPublicOnboardingCard } from '../../backend/src/games/ragnarok-origin/services/discordOnboardingCard.js';

patterns.deploy_onboarding_card = 'used';
patterns.onboarding_channel = 'used';

const TENANT = 'onboard-deploy-tenant';

export function gateOfficerSuccess() {
  return evaluateDeployOnboardingGate({
    isOfficer: true,
    channelId: 'chan-onboard',
    botReady: true,
    circuitOpen: false,
    channelFound: true,
  });
}

export function gateUnmapped() {
  return evaluateDeployOnboardingGate({
    isOfficer: true,
    channelId: '',
    botReady: true,
    circuitOpen: false,
    channelFound: false,
  });
}

export function gateBotOffline() {
  return evaluateDeployOnboardingGate({
    isOfficer: true,
    channelId: 'chan-onboard',
    botReady: false,
    circuitOpen: false,
    channelFound: true,
  });
}

export function gateCircuitOpen() {
  return evaluateDeployOnboardingGate({
    isOfficer: true,
    channelId: 'chan-onboard',
    botReady: true,
    circuitOpen: true,
    channelFound: true,
  });
}

export function gateLocateMiss() {
  return evaluateDeployOnboardingGate({
    isOfficer: true,
    channelId: 'chan-onboard',
    botReady: true,
    circuitOpen: false,
    channelFound: false,
  });
}

export function gateNotOfficer() {
  return evaluateDeployOnboardingGate({
    isOfficer: false,
    channelId: 'chan-onboard',
    botReady: true,
    circuitOpen: false,
    channelFound: true,
  });
}

export function aliasStatusMatchesRoot() {
  const unmapped = new Error('DISCORD_ONBOARDING_CHANNEL_ID is not configured.');
  const offline = new Error('Discord bot gateway is not connected on this backend.');
  const blocking = new Error('Discord is temporarily blocking this server IP. Try again after later.');
  const locate = new Error('Discord gateway client failed to locate the onboarding channel.');
  return {
    unmapped: onboardingDeployHttpStatus(unmapped),
    offline: onboardingDeployHttpStatus(offline),
    blocking: onboardingDeployHttpStatus(blocking),
    locate: onboardingDeployHttpStatus(locate),
  };
}

export async function unmappedDoesNotPost() {
  clearTenantCaches(TENANT);
  setCachedChannels(TENANT, { onboardingChannelId: '' });
  let posted = false;
  let message = '';
  try {
    await runWithTenant(TENANT, () => deployPublicOnboardingCard());
    posted = true;
  } catch (err) {
    message = err.message || '';
  }
  return { posted, message, usedEnv: Boolean(process.env.DISCORD_ONBOARDING_CHANNEL_ID) };
}

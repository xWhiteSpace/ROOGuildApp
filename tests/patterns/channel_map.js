import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import {
  runWithTenant,
  setCachedChannels,
  clearTenantCaches,
} from '../../backend/src/db/tenantContext.js';
import { discordChannel } from '../../backend/src/db/channels.js';

patterns.channel_map = 'used';
patterns.no_env_fallback = 'used';
patterns.onboarding_channel = 'used';

const TENANT = 'channel-map-tenant';

export function storedFieldResolves() {
  clearTenantCaches(TENANT);
  setCachedChannels(TENANT, {
    genroomId: 'chan-gen-stored',
    aucreqChannelId: 'chan-aucreq-stored',
    onboardingChannelId: 'chan-onboard-stored',
  });
  return runWithTenant(TENANT, () => ({
    gen: discordChannel('DISCORD_GENROOM_ID_1'),
    aucreq: discordChannel('DISCORD_AUCREQ_CHANNEL_ID'),
    onboard: discordChannel('DISCORD_ONBOARDING_CHANNEL_ID'),
  }));
}

export function emptyOrMissingStaysEmpty() {
  clearTenantCaches(TENANT);
  setCachedChannels(TENANT, { genroomId: '', aucreqChannelId: undefined });
  return runWithTenant(TENANT, () => ({
    gen: discordChannel('DISCORD_GENROOM_ID_1'),
    aucreq: discordChannel('DISCORD_AUCREQ_CHANNEL_ID'),
    war: discordChannel('DISCORD_WARANNOUNCE_CHANNEL_ID'),
    onboard: discordChannel('DISCORD_ONBOARDING_CHANNEL_ID'),
  }));
}

export function processEnvDoesNotFillEmpty() {
  clearTenantCaches(TENANT);
  setCachedChannels(TENANT, { genroomId: '' });
  return withEnv({
    DISCORD_GENROOM_ID_1: 'env-should-not-win',
    DISCORD_AUCREQ_CHANNEL_ID: 'env-aucreq-should-not-win',
    DISCORD_ONBOARDING_CHANNEL_ID: 'env-onboard-should-not-win',
  }, () => runWithTenant(TENANT, () => ({
    gen: discordChannel('DISCORD_GENROOM_ID_1'),
    onboard: discordChannel('DISCORD_ONBOARDING_CHANNEL_ID'),
    envWasSet: process.env.DISCORD_GENROOM_ID_1 === 'env-should-not-win',
    onboardEnvWasSet: process.env.DISCORD_ONBOARDING_CHANNEL_ID === 'env-onboard-should-not-win',
  })));
}

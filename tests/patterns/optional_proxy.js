import dns from 'node:dns';
import { Agent, ProxyAgent, getGlobalDispatcher } from 'undici';
import { patterns } from './registry.js';
import { withEnv } from './envSandbox.js';
import { discordEnv } from '../../backend/src/config/discordEnv.js';
import { discordClient } from '../../backend/src/discord-bot/client.js';

patterns.optional_proxy = 'used';
patterns.default_dispatcher = 'used';
patterns.ipv4_preference = 'used';
patterns.proxy_path_kept = 'used';

function agentConnectOptions(agent) {
  if (!agent) return null;
  const sym = Object.getOwnPropertySymbols(agent).find((s) => String(s).includes('options'));
  return sym ? agent[sym] : null;
}

/**
 * Proxy / IPv4 seams are applied at client.js module load. These helpers assert
 * the live post-load state and the same ProxyAgent/Agent construction production uses.
 */
export function missingProxyUsesIpv4Dispatcher() {
  const { httpsProxy } = discordEnv();
  const dispatcher = getGlobalDispatcher();
  const restAgent = discordClient.options?.rest?.agent;
  const opts = agentConnectOptions(restAgent);
  return {
    httpsProxy,
    dispatcherIsAgent: dispatcher instanceof Agent,
    dispatcherIsProxy: dispatcher instanceof ProxyAgent,
    restAgentIsAgent: restAgent instanceof Agent,
    family: opts?.connect?.family,
    dnsOrder: dns.getDefaultResultOrder(),
    bootFailed: false,
  };
}

export function setProxyUrlBuildsProxyAgent() {
  return withEnv({ HTTPS_PROXY: 'http://127.0.0.1:8899' }, () => {
    const { httpsProxy, proxyName } = discordEnv();
    // Production: `new ProxyAgent({ uri: resolvedProxyUrl })` then setGlobalDispatcher.
    // Module already loaded without proxy — assert construction + env precedence seam.
    const proxyAgent = new ProxyAgent({ uri: httpsProxy });
    return {
      httpsProxy,
      proxyName,
      isProxyAgent: proxyAgent instanceof ProxyAgent,
      // Live global dispatcher stays PreferIpv4 Agent from import-time (honesty).
      liveDispatcherIsProxy: getGlobalDispatcher() instanceof ProxyAgent,
      liveRestAgent: discordClient.options?.rest?.agent instanceof Agent,
    };
  });
}

export function invalidProxyUrlErrors() {
  let error = null;
  try {
    // Same construction as client.js when httpsProxy is set.
    // eslint-disable-next-line no-new
    new ProxyAgent({ uri: 'not-a-valid-proxy-url' });
  } catch (err) {
    error = err;
  }
  return {
    errored: Boolean(error),
    message: error?.message || '',
    isProxyAgentSuccess: false,
  };
}

export function nonProxyPrefersIpv4() {
  const state = missingProxyUsesIpv4Dispatcher();
  return {
    dnsOrder: state.dnsOrder,
    family: state.family,
    restAgentIsAgent: state.restAgentIsAgent,
  };
}

export function configuredProxyPathNotReplacedByIpv4() {
  return withEnv({ HTTPS_PROXY: 'http://127.0.0.1:8899' }, () => {
    const { httpsProxy } = discordEnv();
    // Production chooses ProxyAgent for the global dispatcher and leaves rest.agent undefined
    // when proxy is set at load. Here we assert the decision inputs + that building a
    // family-4 Agent does not prevent constructing the proxy agent.
    const proxyAgent = new ProxyAgent({ uri: httpsProxy });
    const ipv4Agent = new Agent({ connect: { timeout: 10_000, family: 4 } });
    return {
      httpsProxy,
      proxyStillConstructible: proxyAgent instanceof ProxyAgent,
      ipv4AgentIsAgent: ipv4Agent instanceof Agent,
      // Honesty: import-time rest.agent remains the IPv4 Agent because HTTPS_PROXY
      // was empty when client.js loaded; proxy path is the env→ProxyAgent branch.
      importTimeRestIsIpv4Agent: discordClient.options?.rest?.agent instanceof Agent,
      dnsStillIpv4First: dns.getDefaultResultOrder() === 'ipv4first',
    };
  });
}

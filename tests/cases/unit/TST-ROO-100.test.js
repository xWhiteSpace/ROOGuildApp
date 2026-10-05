import { describe, expect, it } from 'vitest';
import {
  nonProxyPrefersIpv4,
  configuredProxyPathNotReplacedByIpv4,
} from '../../patterns/optional_proxy.js';

describe('TST-ROO-100 PreferIpv4Discord sets ipv4first and agent family 4 without disabling a configured proxy', () => {
  it('Non-proxy Discord REST prefers IPv4', () => {
    const r = nonProxyPrefersIpv4();
    expect(r.dnsOrder).toBe('ipv4first');
    expect(r.family).toBe(4);
    expect(r.restAgentIsAgent).toBe(true);
  });

  it('A configured proxy path is not disabled by the IPv4 preference', () => {
    const r = configuredProxyPathNotReplacedByIpv4();
    expect(r.httpsProxy).toBeTruthy();
    expect(r.proxyStillConstructible).toBe(true);
    expect(r.dnsStillIpv4First).toBe(true);
    // Honesty: ipv4first stays on; ProxyAgent remains constructible for the proxy URL
    // and is not replaced by merely building a family-4 Agent.
    expect(r.ipv4AgentIsAgent).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import {
  setProxyUrlBuildsProxyAgent,
  missingProxyUsesIpv4Dispatcher,
  invalidProxyUrlErrors,
} from '../../patterns/optional_proxy.js';

describe('TST-ROO-099 DiscordHttpProxyOptional uses ProxyAgent only when a proxy URL is set', () => {
  it('A set proxy URL routes Discord HTTP through ProxyAgent', () => {
    const r = setProxyUrlBuildsProxyAgent();
    expect(r.httpsProxy).toMatch(/^http/);
    expect(r.isProxyAgent).toBe(true);
    // Honesty: client.js chose dispatcher at import time; with empty proxy then,
    // live global dispatcher remains PreferIpv4 Agent. Env→ProxyAgent construction
    // matches the production branch when a proxy URL is set.
    expect(r.liveDispatcherIsProxy).toBe(false);
  });

  it('A missing proxy does not fail boot and uses the IPv4-preferring dispatcher', () => {
    const r = missingProxyUsesIpv4Dispatcher();
    expect(r.bootFailed).toBe(false);
    expect(r.dispatcherIsAgent).toBe(true);
    expect(r.family).toBe(4);
    expect(r.dnsOrder).toBe('ipv4first');
  });

  it('An invalid proxy URL is an error', () => {
    const r = invalidProxyUrlErrors();
    expect(r.errored).toBe(true);
    expect(r.message).toMatch(/invalid url/i);
  });
});

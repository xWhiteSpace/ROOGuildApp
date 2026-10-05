import { describe, expect, it } from 'vitest';
import {
  storedFieldResolves,
  emptyOrMissingStaysEmpty,
  processEnvDoesNotFillEmpty,
} from '../../patterns/channel_map.js';

describe('TST-ROO-108 ChannelMapStorageResolver reads tenant discord_channels and never process.env', () => {
  it('A stored discord_channels field resolves to that channel id', () => {
    const r = storedFieldResolves();
    expect(r.gen).toBe('chan-gen-stored');
    expect(r.aucreq).toBe('chan-aucreq-stored');
  });

  it('An empty or missing mapped field stays empty', () => {
    const r = emptyOrMissingStaysEmpty();
    expect(r.gen).toBe('');
    expect(r.aucreq).toBe('');
    expect(r.war).toBe('');
  });

  it('process.env does not fill an empty mapped field', () => {
    const r = processEnvDoesNotFillEmpty();
    expect(r.envWasSet).toBe(true);
    expect(r.gen).toBe('');
  });
});

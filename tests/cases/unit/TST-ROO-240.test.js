import { describe, expect, it } from 'vitest';
import {
  localhostBackendBaseEmpty,
  offLocalhostUsesConfiguredApiBase,
} from '../../patterns/backend_base_url.js';

describe('TST-ROO-240 LocalhostApiBaseUsesViteProxy keeps same-origin /api and /auth on laptop', () => {
  it('On localhost the backend base is empty so the proxy serves /api and /auth', async () => {
    const r = await localhostBackendBaseEmpty();
    expect(r.empty).toBe(true);
  });

  it('Off localhost the client uses the configured API base URL', async () => {
    const r = await offLocalhostUsesConfiguredApiBase();
    expect(r.usesConfiguredOrFallback).toBe(true);
    expect(r.base).not.toBe('');
  });
});

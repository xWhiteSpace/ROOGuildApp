import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../backend/src/createApp.js';
import { getText, listen } from '../support/listen.js';

describe('system runner', () => {
  let server;

  afterAll(async () => {
    if (server) await server.close();
  });

  it('serves the health route without booting Discord', async () => {
    server = await listen(createApp());
    const response = await getText(`${server.url}/`);
    expect([200, 503]).toContain(response.status);
    expect(response.text).toContain('GuildName backend is online');
  });
});

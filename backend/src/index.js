// backend/src/index.js
import './config/loadEnv.js';
import { initializeEnv } from './config/env.js';
import { valhallaEnv } from './config/valhallaEnv.js';
import { migrate } from './db/migrate.js';
import { forEachEnabledGameTenant } from './db/tenants.js';
import { initializeDiscordBot } from './discord-bot/client.js';
import { resolveOAuthExchangeUrl } from './utils/discordRateLimit.js';
import { RAGNAROK_ORIGIN_ID } from './games/catalog.js';
import { createApp } from './createApp.js';

initializeEnv();
await migrate();
initializeDiscordBot();

const oauthBridge = resolveOAuthExchangeUrl();
if (oauthBridge) {
  console.log(`[OAUTH] Token exchange via ${oauthBridge}`);
}

const { port: PORT } = valhallaEnv();
const app = createApp();

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);

  forEachEnabledGameTenant(RAGNAROK_ORIGIN_ID, async () => {
    const { seedMissingLeaveCredits } = await import('./games/ragnarok-origin/services/attendanceDecision.js');
    await seedMissingLeaveCredits();
    const { resumeLiveRaidMonitoringIfNeeded } = await import('./api/liveRaid.routes.js');
    await resumeLiveRaidMonitoringIfNeeded();
  }).catch((err) => console.error('[boot] tenant seed failed:', err.message));
});

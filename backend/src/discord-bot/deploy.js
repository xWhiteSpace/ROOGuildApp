import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { listOnboardedTenants } from '../db/tenants.js';
import { migrate } from '../db/migrate.js';
import { discordEnv } from '../config/discordEnv.js';
import { postgresEnv } from '../config/postgresEnv.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const rest = new REST({ version: '10' }).setToken(discordEnv().botToken);

(async () => {
  try {
    if (!postgresEnv().databaseUrl) {
      console.log('DATABASE_URL is required to clear slash commands for onboarded guilds.');
      return;
    }
    await migrate();
    const tenants = await listOnboardedTenants();
    const ids = tenants.map((t) => t.id);
    for (const guildId of ids) {
      const data = await rest.put(
        Routes.applicationGuildCommands(discordEnv().clientId, guildId),
        { body: [] },
      );
      console.log(`Cleared slash commands on ${guildId} (${data.length} remaining)`);
    }
    if (!ids.length) console.log('No onboarded tenants found.');
  } catch (error) {
    console.error('Failed to clear slash commands:', error);
  }
})();

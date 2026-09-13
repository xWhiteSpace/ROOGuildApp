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
      console.log('DATABASE_URL is required to clear slash commands.');
      process.exit(1);
    }
    await migrate();
    const tenants = await listOnboardedTenants();
    console.log('Clearing slash commands on onboarded guilds...');
    for (const tenant of tenants) {
      const data = await rest.put(
        Routes.applicationGuildCommands(discordEnv().clientId, tenant.id),
        { body: [] },
      );
      console.log(`Cleared ${tenant.id} (${data.length} remaining).`);
    }
  } catch (error) {
    console.error('Failed to clear slash commands:', error);
    process.exit(1);
  }
})();

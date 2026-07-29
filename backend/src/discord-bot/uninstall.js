import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

(async () => {
  try {
    console.log('⏳ Clearing all guild slash commands...');

    const data = await rest.put(
      Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
      { body: [] },
    );

    console.log(`✅ Cleared all staging guild commands (${data.length} remaining).`);
  } catch (error) {
    console.error('❌ Failed to clear slash commands:', error);
    process.exit(1);
  }
})();

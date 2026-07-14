import { REST, Routes } from 'discord.js';
import commandsManifest from './commands/manifest.js';
import dotenv from 'dotenv';
dotenv.config();

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

(async () => {
  try {
    console.log(`⏳ Initializing refresh for ${commandsManifest.length} slash commands...`);

    const data = await rest.put(
      Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
      { body: commandsManifest },
    );

    console.log(`✅ Success! Registered ${data.length} commands to the test server.`);
  } catch (error) {
    console.error('❌ Failed to register slash commands:', error);
  }
})();
import { SlashCommandBuilder } from 'discord.js';

const commands = [
  new SlashCommandBuilder()
    .setName('jobchange')
    .setDescription('Select and update your active job class.'),
    
  new SlashCommandBuilder()
    .setName('rolechange')
    .setDescription('Manually switch your active team role.'),
    
  new SlashCommandBuilder()
    .setName('namechange')
    .setDescription('Change your display nickname inside this guild.')
    .addStringOption(option => 
      option.setName('nickname')
            .setDescription('Your new character/raid name')
            .setRequired(true)),
            
  new SlashCommandBuilder()
    .setName('event')
    .setDescription('Check and manage RSVPs for raid schedules over the next 2 weeks.'),
    
  new SlashCommandBuilder()
    .setName('myparty')
    .setDescription('Fetch your current position matrix from the live raid room.')
].map(command => command.toJSON());

export default commands;
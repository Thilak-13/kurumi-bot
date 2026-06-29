/**
 * interactionCreate Event Handler
 * Handles slash commands and other interactions
 */

const config = require('../config/config');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'interactionCreate',
    
    async execute(interaction) {
        // Handle slash commands
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);
            
            if (!command) {
                console.warn(`⚠️ No command matching ${interaction.commandName} was found.`);
                return;
            }
            
            try {
                const memberRoleIds = Array.from(interaction.member?.roles?.cache?.keys?.() || []);
                const canUse = interaction.client.accessControl?.canUse(interaction.commandName, interaction.user.id, memberRoleIds) || interaction.user.id === config.ownerId;

                if (!canUse) {
                    const embed = new EmbedBuilder()
                        .setTitle('❌ Permission Denied')
                        .setDescription('You do not have the required permissions to use this command.')
                        .setColor('#e74c3c');
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }
                // Log command usage
                console.log(`[SLASH CMD] ${interaction.user.tag} used /${interaction.commandName} in ${interaction.guild?.name || 'DM'}`);
                
                // Execute the command
                await command.execute(interaction);
                
            } catch (error) {
                console.error(`❌ Error executing /${interaction.commandName}:`, error);
                
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Command Error')
                    .setDescription('An error occurred while executing this command.')
                    .setColor('#e74c3c');
                
                const errorMessage = {
                    embeds: [errorEmbed],
                    ephemeral: true
                };
                
                // Send error message depending on interaction state
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage).catch(console.error);
                } else {
                    await interaction.reply(errorMessage).catch(console.error);
                }
            }
        }
        
        // Handle button interactions (future expansion)
        else if (interaction.isButton()) {
            // Add button handler logic here if needed
        }
        
        // Handle select menu interactions (future expansion)
        else if (interaction.isStringSelectMenu()) {
            // Add select menu handler logic here if needed
        }
    }
};

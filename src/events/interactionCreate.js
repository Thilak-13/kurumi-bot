/**
 * interactionCreate Event Handler
 * Thin delegate — the actual pipeline lives in src/core/dispatcher.js
 */

const { dispatchSlashCommand } = require('../core/dispatcher');

module.exports = {
    name: 'interactionCreate',

    async execute(interaction) {
        // Handle slash commands
        if (interaction.isChatInputCommand()) {
            await dispatchSlashCommand(interaction);
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

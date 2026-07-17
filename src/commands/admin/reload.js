const { EmbedBuilder } = require('discord.js');
const { loadCommands } = require('../../core/loaders');

module.exports = {
    name: 'reload',
    description: 'Reload all commands (Usage: zzreload)',

    async execute(message) {
        try {
            const { loaded, failed } = loadCommands(message.client, { bustCache: true });

            const embed = new EmbedBuilder()
                .setTitle('🔄 Commands Reloaded')
                .setColor('#2ecc71')
                .addFields(
                    { name: 'Successfully Reloaded', value: `${loaded}`, inline: true },
                    { name: 'Failed', value: `${failed}`, inline: true }
                )
                .setTimestamp();

            message.reply({ embeds: [embed] });
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Reload Failed')
                .setDescription(`Error: ${error.message}`)
                .setColor('#e74c3c');
            message.reply({ embeds: [embed] });
        }
    }
};

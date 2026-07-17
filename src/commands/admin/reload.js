const { EmbedBuilder } = require('discord.js');
const { loadCommands } = require('../../core/loaders');
const persona = require('../../lib/persona');

module.exports = {
    name: 'reload',
    description: 'Reload all commands (Usage: zzreload)',

    async execute(message) {
        try {
            const { loaded, failed } = loadCommands(message.client, { bustCache: true });

            const embed = new EmbedBuilder()
                .setTitle('🔄 Commands Reloaded')
                .setDescription('There... I have rewound myself, like turning back the hands of a clock. Everything is as it should be ♡')
                .setColor(persona.colors.gold)
                .addFields(
                    { name: 'Successfully Reloaded', value: `${loaded}`, inline: true },
                    { name: 'Failed', value: `${failed}`, inline: true }
                )
                .setFooter({ text: persona.footer() })
                .setTimestamp();

            message.reply({ embeds: [embed] });
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Reload Failed')
                .setDescription(`Ara... the rewind slipped. How vexing.\nError: ${error.message}`)
                .setColor(persona.colors.blood)
                .setFooter({ text: persona.footer() });
            message.reply({ embeds: [embed] });
        }
    }
};

const config = require('../../config/config');
const { EmbedBuilder } = require('discord.js');
const { purgeState } = require('../../services/purgeSessions');
const persona = require('../../lib/persona');

module.exports = {
    name: 'stoppurge',
    description: 'Stop ongoing purge (Usage: zzstoppurge)',

    async execute(message) {
        if (!message.guild) {
            return message.reply(`❌ ${persona.serverOnly()}`).catch(() => {});
        }
        if (message.author.id !== config.ownerId) {
            return;
        }

        const state = purgeState.get(message.channel.id);

        if (!state) {
            const embed = new EmbedBuilder()
                .setTitle('❌ No Active Purge')
                .setDescription('Ara...? There is nothing to stop, my dear. No feast is underway in this channel.')
                .setColor(persona.colors.blood)
                .setFooter({ text: persona.footer() });
            return message.reply({ embeds: [embed] });
        }

        state.active = false;
        const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
        const embed = new EmbedBuilder()
            .setTitle('🛑 Purge Stopped')
            .setDescription('Very well... I shall set down my fork. For now. Ufufu.')
            .addFields(
                { name: 'Messages Devoured', value: `${state.deleted}`, inline: true },
                { name: 'Time Elapsed', value: `${elapsed}s`, inline: true }
            )
            .setColor(persona.colors.amber)
            .setFooter({ text: persona.footer() })
            .setTimestamp();
        message.reply({ embeds: [embed] });
    }
};

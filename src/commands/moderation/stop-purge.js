const config = require('../../config/config');
const { EmbedBuilder } = require('discord.js');
const { purgeState } = require('../../services/purgeSessions');

module.exports = {
    name: 'stoppurge',
    description: 'Stop ongoing purge (Usage: zzstoppurge)',

    async execute(message) {
        if (!message.guild) {
            return message.reply('❌ This command can only be used in a server.').catch(() => {});
        }
        if (message.author.id !== config.ownerId) {
            return;
        }

        const state = purgeState.get(message.channel.id);

        if (!state) {
            const embed = new EmbedBuilder()
                .setTitle('❌ No Active Purge')
                .setDescription('There is no active purge in this channel.')
                .setColor('#e74c3c');
            return message.reply({ embeds: [embed] });
        }

        state.active = false;
        const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
        const embed = new EmbedBuilder()
            .setTitle('🛑 Purge Stopped')
            .addFields(
                { name: 'Messages Deleted', value: `${state.deleted}`, inline: true },
                { name: 'Time Elapsed', value: `${elapsed}s`, inline: true }
            )
            .setColor('#f39c12')
            .setTimestamp();
        message.reply({ embeds: [embed] });
    }
};

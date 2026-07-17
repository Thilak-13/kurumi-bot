const { EmbedBuilder } = require('discord.js');
const persona = require('../../lib/persona');

module.exports = {
    name: 'userinfo',
    description: 'Get user info (Usage: zzuserinfo [@user])',

    async execute(message, args) {
        if (!message.guild) {
            return message.reply(`❌ ${persona.serverOnly()}`).catch(() => {});
        }
        const target = message.mentions.users.first() || (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : message.author);
        if (!target) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ No Such Soul')
                .setDescription('Ara...? I searched every shadow, and no one by that name looked back. Are you certain they exist, my dear?')
                .setColor(persona.colors.blood)
                .setFooter({ text: persona.footer() });
            return message.reply({ embeds: [errorEmbed] });
        }

        try {
            const member = await message.guild.members.fetch(target.id);
            const accountAge = Math.floor((Date.now() - target.createdAt) / 86400000);
            const joinAge = Math.floor((Date.now() - member.joinedAt) / 86400000);

            const roles = member.roles.cache.filter(r => r.id !== message.guild.id).map(r => r.name);
            const roleText = roles.length ? roles.slice(0, 10).join(', ') + (roles.length > 10 ? ` +${roles.length - 10} more` : '') : 'None';

            const embed = new EmbedBuilder()
                .setTitle(`👁️ A closer look at ${target.tag}`)
                .setDescription('Ufufu... I have been watching, you see. I watch *everyone*. Here is what their time has told me.')
                .setColor(persona.colors.crimson)
                .setThumbnail(target.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: 'User ID', value: `\`${target.id}\``, inline: true },
                    { name: 'Bot Account', value: target.bot ? 'Yes' : 'No', inline: true },
                    { name: 'Account Age', value: `${accountAge} days of time spent`, inline: true },
                    { name: 'Server Join Date', value: `${joinAge} days among us`, inline: true },
                    { name: `Roles (${roles.length})`, value: roleText, inline: false }
                )
                .setFooter({ text: `Requested by ${message.author.tag} — ${persona.footer()}` })
                .setTimestamp();

            message.reply({ embeds: [embed] });
        } catch (error) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Not Among Us')
                .setDescription('That one does not walk these halls, my dear. Perhaps they slipped into someone *else\'s* shadow... kihihi.')
                .setColor(persona.colors.blood)
                .setFooter({ text: persona.footer() });
            message.reply({ embeds: [errorEmbed] });
        }
    }
};

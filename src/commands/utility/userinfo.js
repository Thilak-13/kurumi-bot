const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'userinfo',
    description: 'Get user info (Usage: zzuserinfo [@user])',
    
    async execute(message, args) {
        if (!message.guild) {
            return message.reply('❌ This command can only be used in a server.').catch(() => {});
        }
        const target = message.mentions.users.first() || (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : message.author);
        if (!target) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('User not found')
                .setColor('#e74c3c');
            return message.reply({ embeds: [errorEmbed] });
        }

        try {
            const member = await message.guild.members.fetch(target.id);
            const accountAge = Math.floor((Date.now() - target.createdAt) / 86400000);
            const joinAge = Math.floor((Date.now() - member.joinedAt) / 86400000);
            
            const roles = member.roles.cache.filter(r => r.id !== message.guild.id).map(r => r.name);
            const roleText = roles.length ? roles.slice(0, 10).join(', ') + (roles.length > 10 ? ` +${roles.length - 10} more` : '') : 'None';
            
            const embed = new EmbedBuilder()
                .setTitle(`👤 User Information - ${target.tag}`)
                .setColor('#3498db')
                .setThumbnail(target.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: 'User ID', value: `\`${target.id}\``, inline: true },
                    { name: 'Bot Account', value: target.bot ? 'Yes' : 'No', inline: true },
                    { name: 'Account Age', value: `${accountAge} days ago`, inline: true },
                    { name: 'Server Join Date', value: `${joinAge} days ago`, inline: true },
                    { name: `Roles (${roles.length})`, value: roleText, inline: false }
                )
                .setFooter({ text: `Requested by ${message.author.tag}` })
                .setTimestamp();
            
            message.reply({ embeds: [embed] });
        } catch (error) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('User is not in this server')
                .setColor('#e74c3c');
            message.reply({ embeds: [errorEmbed] });
        }
    }
};

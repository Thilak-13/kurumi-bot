const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');
const persona = require('../../lib/persona');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('forumlogger')
        .setDescription('Configure or manage the Per-User Moderation History Threads (Forum Logger) feature')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Configure the hybrid forum logger for this server')
                .addChannelOption(option =>
                    option.setName('mod_log_channel')
                        .setDescription('The channel where the moderation logs are posted (e.g. from Sapphire bot)')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
                .addChannelOption(option =>
                    option.setName('forum_channel')
                        .setDescription('The forum channel where per-user history threads will be created')
                        .addChannelTypes(ChannelType.GuildForum)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('toggle')
                .setDescription('Quickly enable or disable the forum logger')
                .addBooleanOption(option =>
                    option.setName('enabled')
                        .setDescription('True to enable, False to disable')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Display the current configuration status of the forum logger')
        ),

    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({ content: `❌ ${persona.serverOnly()}`, flags: 64 });
        }
        const subcommand = interaction.options.getSubcommand();
        const db = interaction.client.database;

        if (!db || !db.connected) {
            return interaction.reply({ content: '❌ Ara... my memory fails me — the database is not connected.', flags: 64 });
        }

        const guildId = interaction.guild.id;
        let settings = db.getGuildSettings(guildId) || {};

        if (subcommand === 'setup') {
            const modLogChannel = interaction.options.getChannel('mod_log_channel');
            const forumChannel = interaction.options.getChannel('forum_channel');

            settings.forumLogger = {
                enabled: true,
                modLogChannelId: modLogChannel.id,
                forumChannelId: forumChannel.id,
                updatedAt: new Date().toISOString()
            };

            db.saveGuildSettings(guildId, settings);

            const embed = new EmbedBuilder()
                .setTitle('✅ Forum Logger Configured')
                .setDescription(`There... every sinner shall have their own little diary now, and I shall keep them all ♡\n\n**Status:** 🟢 **ENABLED**\n**Mod Log Channel:** <#${modLogChannel.id}>\n**Forum Channel:** <#${forumChannel.id}>`)
                .setColor(persona.colors.gold)
                .setFooter({ text: persona.footer() })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        } 
        
        else if (subcommand === 'toggle') {
            const enabled = interaction.options.getBoolean('enabled');

            if (!settings.forumLogger) {
                return interaction.reply({ content: '❌ Ara...? There is nothing to toggle, my dear — set it up first with `/forumlogger setup`.', flags: 64 });
            }

            settings.forumLogger.enabled = enabled;
            settings.forumLogger.updatedAt = new Date().toISOString();
            db.saveGuildSettings(guildId, settings);

            const statusEmoji = enabled ? '🟢' : '🔴';
            const statusLabel = enabled ? 'ENABLED' : 'DISABLED';

            const embed = new EmbedBuilder()
                .setTitle('⚙️ Forum Logger Updated')
                .setDescription(`The forum logger is now **${statusLabel}** ${statusEmoji}. ${enabled ? 'Ufufu... I shall resume my record-keeping.' : 'Very well... my pen rests. For now.'}`)
                .setColor(enabled ? persona.colors.gold : persona.colors.blood)
                .setFooter({ text: persona.footer() })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        } 
        
        else if (subcommand === 'status') {
            const config = settings.forumLogger;

            if (!config) {
                const embed = new EmbedBuilder()
                    .setTitle('⚙️ Forum Logger Status')
                    .setDescription('No diaries are being kept here yet, my dear...\n\nUse `/forumlogger setup`, and I shall begin writing ♡')
                    .setColor(persona.colors.blood)
                    .setFooter({ text: persona.footer() })
                    .setTimestamp();
                return interaction.reply({ embeds: [embed] });
            }

            const statusEmoji = config.enabled ? '🟢' : '🔴';
            const statusLabel = config.enabled ? 'ENABLED' : 'DISABLED';

            const embed = new EmbedBuilder()
                .setTitle('⚙️ Forum Logger Configuration Status')
                .addFields(
                    { name: 'Feature Status', value: `${statusEmoji} **${statusLabel}**`, inline: true },
                    { name: 'Mod Log Channel', value: `<#${config.modLogChannelId}>`, inline: true },
                    { name: 'Forum Log Channel', value: `<#${config.forumChannelId}>`, inline: true }
                )
                .setColor(config.enabled ? persona.colors.gold : persona.colors.blood)
                .setFooter({ text: `Last Updated: ${config.updatedAt || 'Unknown'} — ${persona.footer()}` })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }
    }
};

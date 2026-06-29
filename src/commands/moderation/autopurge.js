const { 
    SlashCommandBuilder, 
    PermissionFlagsBits, 
    ChannelType, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ChannelSelectMenuBuilder, 
    StringSelectMenuBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle 
} = require('discord.js');
const config = require('../../config/config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('autopurge')
        .setDescription('Configure or manage automatic message purging for channels')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Start the interactive setup for autopurge')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all configured autopurge channels')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('pause')
                .setDescription('Pause autopurge on a channel')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('The channel to pause')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('resume')
                .setDescription('Resume autopurge on a channel')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('The channel to resume')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove/Delete autopurge settings for a channel')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('The channel to remove autopurge from')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({ content: '❌ This command can only be used in a server.', flags: 64 });
        }
        const subcommand = interaction.options.getSubcommand();
        const db = interaction.client.database;

        if (!db || !db.connected) {
            return interaction.reply({ content: '❌ Database is not connected.', flags: 64 });
        }

        if (subcommand === 'setup') {
            await this.handleSetup(interaction);
        } else if (subcommand === 'list') {
            await this.handleList(interaction);
        } else if (subcommand === 'pause') {
            await this.handlePause(interaction);
        } else if (subcommand === 'resume') {
            await this.handleResume(interaction);
        } else if (subcommand === 'remove') {
            await this.handleRemove(interaction);
        }
    },

    async handleSetup(interaction) {
        let selectedChannelIds = [];
        let selectedFilters = [];
        let selectedIntervalMinutes = null;
        let intervalLabel = 'None';
        let selectedLogChannelId = null;

        const updateMessage = async (targetInteraction) => {
            const embed = new EmbedBuilder()
                .setTitle('⚙️ Autopurge Setup Dashboard')
                .setDescription('Configure automatic message purging. Messages matching selected filters will be deleted periodically.')
                .setColor(config.bot.color || 0x5865F2)
                .addFields(
                    {
                        name: '📢 Target Channels',
                        value: selectedChannelIds.length > 0
                            ? selectedChannelIds.map(id => `<#${id}>`).join(', ')
                            : '*None selected (use the channel menu below)*',
                        inline: false
                    },
                    {
                        name: '🛡️ Filters Applied',
                        value: selectedFilters.length > 0
                            ? selectedFilters.map(f => `• **${f}**`).join('\n')
                            : '• **all messages** *(no filters selected, will purge everything)*',
                        inline: true
                    },
                    {
                        name: '⏱️ Interval',
                        value: selectedIntervalMinutes !== null
                            ? `⏱️ **Every ${intervalLabel}**`
                            : '*None selected*',
                        inline: true
                    },
                    {
                        name: '📝 Log Channel',
                        value: selectedLogChannelId
                            ? `<#${selectedLogChannelId}>`
                            : '*Default (Server Log)*',
                        inline: true
                    }
                )
                .setFooter({ text: 'Interaction times out in 5 minutes' })
                .setTimestamp();

            // Row 1: Channels select menu
            const channelSelect = new ChannelSelectMenuBuilder()
                .setCustomId('autopurge_setup_channels')
                .setPlaceholder('Select channel(s) to purge...')
                .setChannelTypes([ChannelType.GuildText])
                .setMinValues(1)
                .setMaxValues(10);

            // Row 2: Filters select menu
            const filterOptions = [
                { label: 'Image', value: 'image', description: 'Purge images and image embeds', emoji: '🖼️' },
                { label: 'Video', value: 'video', description: 'Purge video attachments and embeds', emoji: '🎥' },
                { label: 'Link', value: 'link', description: 'Purge messages containing links', emoji: '🔗' },
                { label: 'File', value: 'file', description: 'Purge general file attachments (docs/zips)', emoji: '📁' },
                { label: 'Embed', value: 'embed', description: 'Purge rich embeds', emoji: '💻' },
                { label: 'Sound', value: 'sound', description: 'Purge audio files and voice messages', emoji: '🎵' },
                { label: 'Poll', value: 'poll', description: 'Purge polls', emoji: '📊' },
                { label: 'Sticker', value: 'sticker', description: 'Purge stickers', emoji: '🏷️' }
            ].map(opt => ({
                ...opt,
                default: selectedFilters.includes(opt.value)
            }));

            const filterSelect = new StringSelectMenuBuilder()
                .setCustomId('autopurge_setup_filters')
                .setPlaceholder('Select filters (matches will be deleted)...')
                .setMinValues(0)
                .setMaxValues(8)
                .addOptions(filterOptions);

            // Row 3: Interval select menu
            const intervalOptions = [
                { label: '15 Minutes', value: '15m', emoji: '⏱️' },
                { label: '30 Minutes', value: '30m', emoji: '⏱️' },
                { label: '1 Hour', value: '1h', emoji: '⏱️' },
                { label: '6 Hours', value: '6h', emoji: '⏱️' },
                { label: '12 Hours', value: '12h', emoji: '⏱️' },
                { label: '24 Hours', value: '24h', emoji: '⏱️' },
                { label: 'Custom Interval...', value: 'custom', emoji: '⚙️' }
            ].map(opt => {
                let isDefault = false;
                if (opt.value === '15m' && selectedIntervalMinutes === 15) isDefault = true;
                else if (opt.value === '30m' && selectedIntervalMinutes === 30) isDefault = true;
                else if (opt.value === '1h' && selectedIntervalMinutes === 60) isDefault = true;
                else if (opt.value === '6h' && selectedIntervalMinutes === 360) isDefault = true;
                else if (opt.value === '12h' && selectedIntervalMinutes === 720) isDefault = true;
                else if (opt.value === '24h' && selectedIntervalMinutes === 1440) isDefault = true;
                else if (opt.value === 'custom' && selectedIntervalMinutes !== null && ![15, 30, 60, 360, 720, 1440].includes(selectedIntervalMinutes)) isDefault = true;
                return { ...opt, default: isDefault };
            });

            const intervalSelect = new StringSelectMenuBuilder()
                .setCustomId('autopurge_setup_interval')
                .setPlaceholder('Select purge interval...')
                .setMinValues(1)
                .setMaxValues(1)
                .addOptions(intervalOptions);

            // Row 4: Log channel select menu
            const logChannelSelect = new ChannelSelectMenuBuilder()
                .setCustomId('autopurge_setup_log_channel')
                .setPlaceholder('Select log channel (optional)...')
                .setChannelTypes([ChannelType.GuildText])
                .setMinValues(0)
                .setMaxValues(1);

            // Row 5: Buttons
            const saveBtn = new ButtonBuilder()
                .setCustomId('autopurge_setup_save')
                .setLabel('Save Configuration')
                .setStyle(ButtonStyle.Success)
                .setDisabled(selectedChannelIds.length === 0 || selectedIntervalMinutes === null);

            const cancelBtn = new ButtonBuilder()
                .setCustomId('autopurge_setup_cancel')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Danger);

            const row1 = new ActionRowBuilder().addComponents(channelSelect);
            const row2 = new ActionRowBuilder().addComponents(filterSelect);
            const row3 = new ActionRowBuilder().addComponents(intervalSelect);
            const row4 = new ActionRowBuilder().addComponents(logChannelSelect);
            const row5 = new ActionRowBuilder().addComponents(saveBtn, cancelBtn);

            if (targetInteraction === interaction) {
                await targetInteraction.reply({ embeds: [embed], components: [row1, row2, row3, row4, row5] });
                return await targetInteraction.fetchReply();
            } else if (targetInteraction.isModalSubmit()) {
                return await interaction.editReply({ embeds: [embed], components: [row1, row2, row3, row4, row5] });
            } else {
                return await targetInteraction.update({ embeds: [embed], components: [row1, row2, row3, row4, row5] });
            }
        };

        // Initialize setup message
        const response = await updateMessage(interaction);

        const collector = response.createMessageComponentCollector({
            filter: i => i.user.id === interaction.user.id,
            time: 300000 // 5 minutes
        });

        collector.on('collect', async i => {
            if (i.customId === 'autopurge_setup_channels') {
                selectedChannelIds = i.values;
                await updateMessage(i);
            } 
            else if (i.customId === 'autopurge_setup_filters') {
                selectedFilters = i.values;
                await updateMessage(i);
            } 
            else if (i.customId === 'autopurge_setup_log_channel') {
                selectedLogChannelId = i.values[0] || null;
                await updateMessage(i);
            }
            else if (i.customId === 'autopurge_setup_interval') {
                const choice = i.values[0];
                if (choice === 'custom') {
                    // Show modal
                    const modal = new ModalBuilder()
                        .setCustomId('autopurge_setup_custom_modal')
                        .setTitle('Custom Autopurge Interval');

                    const minsInput = new TextInputBuilder()
                        .setCustomId('custom_mins')
                        .setLabel('Interval (in minutes)')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMinLength(1)
                        .setMaxLength(6)
                        .setPlaceholder('e.g., 45, 120, 1440');

                    modal.addComponents(new ActionRowBuilder().addComponents(minsInput));
                    await i.showModal(modal);

                    // Wait for modal submit
                    const modalSubmit = await interaction.awaitModalSubmit({
                        filter: mi => mi.customId === 'autopurge_setup_custom_modal' && mi.user.id === interaction.user.id,
                        time: 60000
                    }).catch(() => null);

                    if (modalSubmit) {
                        const rawMins = modalSubmit.fields.getTextInputValue('custom_mins');
                        const mins = parseInt(rawMins, 10);
                        if (isNaN(mins) || mins <= 0) {
                            await modalSubmit.reply({ content: '❌ Invalid input! Please enter a positive number of minutes.', flags: 64 });
                        } else {
                            selectedIntervalMinutes = mins;
                            intervalLabel = `${mins} Minute(s)`;
                            await modalSubmit.deferUpdate();
                            await updateMessage(modalSubmit);
                        }
                    }
                } else {
                    const mappings = {
                        '15m': 15,
                        '30m': 30,
                        '1h': 60,
                        '6h': 360,
                        '12h': 720,
                        '24h': 1440
                    };
                    selectedIntervalMinutes = mappings[choice];
                    // Retrieve label from options
                    const optIndex = i.component.options.findIndex(o => o.value === choice);
                    intervalLabel = i.component.options[optIndex].label;
                    await updateMessage(i);
                }
            } 
            else if (i.customId === 'autopurge_setup_save') {
                collector.stop('saved');
                
                // Save to DB
                const db = interaction.client.database;
                for (const channelId of selectedChannelIds) {
                    db.saveAutoPurgeConfig(interaction.guild.id, channelId, selectedIntervalMinutes, selectedFilters, 'active', selectedLogChannelId);
                }

                // Hot-reload engine cache
                interaction.client.autoPurgeScheduler?.reloadConfig();

                const logChannelText = selectedLogChannelId ? `<#${selectedLogChannelId}>` : 'Default Log';
                const successEmbed = new EmbedBuilder()
                    .setTitle('✅ Autopurge Saved')
                    .setDescription(`Successfully enabled autopurge for:\n${selectedChannelIds.map(id => `<#${id}>`).join('\n')}\n\n**Interval:** Every ${intervalLabel}\n**Filters:** ${selectedFilters.length > 0 ? selectedFilters.join(', ') : 'None (Purge all)'}\n**Log Channel:** ${logChannelText}`)
                    .setColor('#2ecc71')
                    .setTimestamp();

                await i.update({ embeds: [successEmbed], components: [] });
            } 
            else if (i.customId === 'autopurge_setup_cancel') {
                collector.stop('cancelled');
                
                const cancelEmbed = new EmbedBuilder()
                    .setTitle('❌ Setup Cancelled')
                    .setDescription('Autopurge setup has been cancelled.')
                    .setColor('#e74c3c')
                    .setTimestamp();

                await i.update({ embeds: [cancelEmbed], components: [] });
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('❌ Setup Timed Out')
                    .setDescription('Autopurge setup timed out due to inactivity.')
                    .setColor('#e74c3c')
                    .setTimestamp();
                await interaction.editReply({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
            }
        });
    },

    async handleList(interaction) {
        const db = interaction.client.database;
        const configs = db.listGuildAutoPurgeConfigs(interaction.guild.id);

        if (configs.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle('ℹ️ Autopurge Configurations')
                .setDescription('There are no autopurge configurations active in this server.')
                .setColor(config.bot.color || 0x5865F2)
                .setTimestamp();
            return interaction.reply({ embeds: [embed] });
        }

        const embed = new EmbedBuilder()
            .setTitle('📋 Autopurge Channels')
            .setColor(config.bot.color || 0x5865F2)
            .setTimestamp();

        const desc = configs.map((c, index) => {
            const statusEmoji = c.status === 'active' ? '🟢' : '🔴';
            const filterList = c.filters.length > 0 ? c.filters.join(', ') : 'All Messages';
            const logChannelText = c.log_channel_id ? `<#${c.log_channel_id}>` : 'Default Log';
            return `**${index + 1}. <#${c.channel_id}>**
• Status: ${statusEmoji} **${c.status.toUpperCase()}**
• Interval: Every ${c.interval_minutes} minutes
• Filters: \`${filterList}\`
• Log Channel: ${logChannelText}
• Mode: ⚡ Event-driven`;
        }).join('\n\n');

        embed.setDescription(desc);
        return interaction.reply({ embeds: [embed] });
    },

    async handlePause(interaction) {
        const channel = interaction.options.getChannel('channel');
        const db = interaction.client.database;

        const current = db.getAutoPurgeConfig(interaction.guild.id, channel.id);
        if (!current) {
            return interaction.reply({ content: `❌ No autopurge configuration found for <#${channel.id}>.`, flags: 64 });
        }

        if (current.status === 'paused') {
            return interaction.reply({ content: `ℹ️ Autopurge is already paused in <#${channel.id}>.`, flags: 64 });
        }

        db.updateAutoPurgeStatus(interaction.guild.id, channel.id, 'paused');
        interaction.client.autoPurgeScheduler?.reloadConfig();
        
        const embed = new EmbedBuilder()
            .setTitle('⏸️ Autopurge Paused')
            .setDescription(`Autopurge has been paused for <#${channel.id}>.`)
            .setColor('#f39c12')
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    },

    async handleResume(interaction) {
        const channel = interaction.options.getChannel('channel');
        const db = interaction.client.database;

        const current = db.getAutoPurgeConfig(interaction.guild.id, channel.id);
        if (!current) {
            return interaction.reply({ content: `❌ No autopurge configuration found for <#${channel.id}>.`, flags: 64 });
        }

        if (current.status === 'active') {
            return interaction.reply({ content: `ℹ️ Autopurge is already active in <#${channel.id}>.`, flags: 64 });
        }

        // Resume status
        db.updateAutoPurgeStatus(interaction.guild.id, channel.id, 'active');
        interaction.client.autoPurgeScheduler?.reloadConfig();

        const embed = new EmbedBuilder()
            .setTitle('▶️ Autopurge Resumed')
            .setDescription(`Autopurge has been resumed for <#${channel.id}>.\nNew messages will now be tracked and auto-deleted.`)
            .setColor('#2ecc71')
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    },

    async handleRemove(interaction) {
        const channel = interaction.options.getChannel('channel');
        const db = interaction.client.database;

        const current = db.getAutoPurgeConfig(interaction.guild.id, channel.id);
        if (!current) {
            return interaction.reply({ content: `❌ No autopurge configuration found for <#${channel.id}>.`, flags: 64 });
        }

        db.deleteAutoPurgeConfig(interaction.guild.id, channel.id);
        db.removeTrackedMessagesForChannel(interaction.guild.id, channel.id);
        interaction.client.autoPurgeScheduler?.reloadConfig();

        const embed = new EmbedBuilder()
            .setTitle('🗑️ Autopurge Config Removed')
            .setDescription(`Autopurge configuration for <#${channel.id}> has been deleted.`)
            .setColor('#e74c3c')
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
};

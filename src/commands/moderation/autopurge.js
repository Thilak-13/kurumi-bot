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
const persona = require('../../lib/persona');

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
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove-all')
                .setDescription('Remove/Delete all autopurge settings for all channels in the server')
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
        } else if (subcommand === 'remove-all') {
            await this.handleRemoveAll(interaction);
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
                .setDescription('Ara ara... setting the table for a standing feast? Choose what I devour, where, and how often — and I shall keep those channels *spotless* ♡')
                .setColor(config.bot.color || 0xB01E36)
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
                .setFooter({ text: 'You have five minutes to decide... I am counting. Kihihi.' })
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
                { label: 'Sticker', value: 'sticker', description: 'Purge stickers', emoji: '🏷️' },
                { label: 'Emoji', value: 'emoji', description: 'Purge messages containing emojis', emoji: '😀' }
            ].map(opt => ({
                ...opt,
                default: selectedFilters.includes(opt.value)
            }));

            const filterSelect = new StringSelectMenuBuilder()
                .setCustomId('autopurge_setup_filters')
                .setPlaceholder('Select filters (matches will be deleted)...')
                .setMinValues(0)
                .setMaxValues(9)
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
                            await modalSubmit.reply({ content: '❌ Ara... that is not a proper number of minutes, my dear. A positive one, if you please.', flags: 64 });
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
                    .setDescription(`The arrangement is made ♡ I shall dine on schedule in:\n${selectedChannelIds.map(id => `<#${id}>`).join('\n')}\n\n**Interval:** Every ${intervalLabel}\n**Filters:** ${selectedFilters.length > 0 ? selectedFilters.join(', ') : 'None (Purge all)'}\n**Log Channel:** ${logChannelText}`)
                    .setColor(persona.colors.gold)
                    .setFooter({ text: persona.footer() })
                    .setTimestamp();

                await i.update({ embeds: [successEmbed], components: [] });
            } 
            else if (i.customId === 'autopurge_setup_cancel') {
                collector.stop('cancelled');
                
                const cancelEmbed = new EmbedBuilder()
                    .setTitle('❌ Setup Cancelled')
                    .setDescription('Changed your mind, did you? Ufufu... very well. The table is cleared, nothing was arranged.')
                    .setColor(persona.colors.blood)
                    .setFooter({ text: persona.footer() })
                    .setTimestamp();

                await i.update({ embeds: [cancelEmbed], components: [] });
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('❌ Setup Timed Out')
                    .setDescription('Five minutes of silence... you kept a lady waiting, so I have put everything away. How terribly rude, my dear.')
                    .setColor(persona.colors.blood)
                    .setFooter({ text: persona.footer() })
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
                .setTitle('🕰️ Autopurge Configurations')
                .setDescription('Ara...? No standing arrangements here — I dine in this server only when invited.')
                .setColor(config.bot.color || 0xB01E36)
                .setFooter({ text: persona.footer() })
                .setTimestamp();
            return interaction.reply({ embeds: [embed] });
        }

        const embed = new EmbedBuilder()
            .setTitle('📋 Autopurge Channels')
            .setColor(config.bot.color || 0xB01E36)
            .setFooter({ text: persona.footer() })
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
            return interaction.reply({ content: `❌ Ara...? I have no arrangement with <#${channel.id}>. There is nothing there to touch.`, flags: 64 });
        }

        if (current.status === 'paused') {
            return interaction.reply({ content: `ℹ️ The clock in <#${channel.id}> is already stopped, my dear.`, flags: 64 });
        }

        db.updateAutoPurgeStatus(interaction.guild.id, channel.id, 'paused');
        interaction.client.autoPurgeScheduler?.reloadConfig();
        
        const embed = new EmbedBuilder()
            .setTitle('⏸️ Autopurge Paused')
            .setDescription(`Very well... I have stopped the clock in <#${channel.id}>. Its messages may breathe — for now.`)
            .setColor(persona.colors.amber)
            .setFooter({ text: persona.footer() })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    },

    async handleResume(interaction) {
        const channel = interaction.options.getChannel('channel');
        const db = interaction.client.database;

        const current = db.getAutoPurgeConfig(interaction.guild.id, channel.id);
        if (!current) {
            return interaction.reply({ content: `❌ Ara...? I have no arrangement with <#${channel.id}>. There is nothing there to touch.`, flags: 64 });
        }

        if (current.status === 'active') {
            return interaction.reply({ content: `ℹ️ The clock in <#${channel.id}> is already ticking, my dear.`, flags: 64 });
        }

        // Resume status
        db.updateAutoPurgeStatus(interaction.guild.id, channel.id, 'active');
        interaction.client.autoPurgeScheduler?.reloadConfig();

        const embed = new EmbedBuilder()
            .setTitle('▶️ Autopurge Resumed')
            .setDescription(`The clock in <#${channel.id}> ticks once more ♡\nNew messages shall be watched... and collected, right on schedule.`)
            .setColor(persona.colors.gold)
            .setFooter({ text: persona.footer() })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    },

    async handleRemove(interaction) {
        const channel = interaction.options.getChannel('channel');
        const db = interaction.client.database;

        const current = db.getAutoPurgeConfig(interaction.guild.id, channel.id);
        if (!current) {
            return interaction.reply({ content: `❌ Ara...? I have no arrangement with <#${channel.id}>. There is nothing there to touch.`, flags: 64 });
        }

        db.deleteAutoPurgeConfig(interaction.guild.id, channel.id);
        db.removeTrackedMessagesForChannel(interaction.guild.id, channel.id);
        interaction.client.autoPurgeScheduler?.reloadConfig();

        const embed = new EmbedBuilder()
            .setTitle('🗑️ Autopurge Config Removed')
            .setDescription(`The arrangement with <#${channel.id}> is ended. I shall dine there no longer... a pity. Ufufu.`)
            .setColor(persona.colors.blood)
            .setFooter({ text: persona.footer() })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    },

    async handleRemoveAll(interaction) {
        const db = interaction.client.database;
        const configs = db.listGuildAutoPurgeConfigs(interaction.guild.id);

        if (configs.length === 0) {
            return interaction.reply({ 
                content: '❌ Ara...? There is nothing to sweep away — no autopurge arrangements exist in this server.', 
                flags: 64 
            });
        }

        // Create confirmation prompt with buttons
        const confirmEmbed = new EmbedBuilder()
            .setTitle('⚠️ Remove ALL Autopurge Configurations')
            .setDescription(`You would tear up **all ${configs.length}** of my standing arrangements in this server at once...\n\nThere is no rewinding this, my dear — every automatic purge will stop.\n\nAre you quite certain?`)
            .setColor(persona.colors.blood)
            .setFooter({ text: 'Thirty seconds to decide... tick, tock.' })
            .setTimestamp();

        const confirmBtn = new ButtonBuilder()
            .setCustomId('autopurge_remove_all_confirm')
            .setLabel('Confirm Remove All')
            .setStyle(ButtonStyle.Danger);

        const cancelBtn = new ButtonBuilder()
            .setCustomId('autopurge_remove_all_cancel')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);

        const response = await interaction.reply({ 
            embeds: [confirmEmbed], 
            components: [row], 
            flags: 64 
        });

        const collector = response.createMessageComponentCollector({
            filter: i => i.user.id === interaction.user.id,
            time: 30000
        });

        collector.on('collect', async i => {
            if (i.customId === 'autopurge_remove_all_confirm') {
                collector.stop('confirmed');

                // Perform deletion
                const deletedConfigsCount = db.deleteAllGuildAutoPurgeConfigs(interaction.guild.id);
                db.removeAllTrackedMessagesForGuild(interaction.guild.id);

                // Reload scheduler configs
                interaction.client.autoPurgeScheduler?.reloadConfig();

                const successEmbed = new EmbedBuilder()
                    .setTitle('🗑️ All Autopurge Configs Removed')
                    .setDescription(`So be it. **${deletedConfigsCount}** arrangement(s) torn up, every tracked message forgotten. The table is bare... how quiet it will be. Ufufu.`)
                    .setColor(persona.colors.gold)
                    .setFooter({ text: persona.footer() })
                    .setTimestamp();

                await i.update({ embeds: [successEmbed], components: [] });
            } else if (i.customId === 'autopurge_remove_all_cancel') {
                collector.stop('cancelled');

                const cancelEmbed = new EmbedBuilder()
                    .setTitle('❌ Action Cancelled')
                    .setDescription('Ara... cold feet? The arrangements stay exactly as they were. Wise, perhaps.')
                    .setColor(persona.colors.shadow)
                    .setFooter({ text: persona.footer() })
                    .setTimestamp();

                await i.update({ embeds: [cancelEmbed], components: [] });
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('❌ Action Timed Out')
                    .setDescription('Thirty seconds came and went without a word... so nothing was touched. Do be more decisive next time, my dear.')
                    .setColor(persona.colors.blood)
                    .setFooter({ text: persona.footer() })
                    .setTimestamp();
                await interaction.editReply({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
            }
        });
    }
};

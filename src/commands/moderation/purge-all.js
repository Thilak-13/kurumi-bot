const { 
    SlashCommandBuilder, 
    PermissionFlagsBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder,
    ChannelType
} = require('discord.js');
const config = require('../../config/config');
const { filterChoices, matchesFilter } = require('../../lib/messageFilters');
const { purgeState } = require('../../services/purgeSessions');
const persona = require('../../lib/persona');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('purgeall')
        .setDescription('Purge messages in this channel with optional filters and limits')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(option =>
            option.setName('filter')
                .setDescription('Type of messages to delete (default: all messages)')
                .setRequired(false)
                .addChoices(...filterChoices)
        )
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Maximum number of messages to search/delete (leave empty to purge everything)')
                .setRequired(false)
                .setMinValue(1)
        )
        .addChannelOption(option =>
            option.setName('logchannel')
                .setDescription('Optional channel to send the purge log/summary to')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false)
        ),

    async execute(interaction, args) {
        const isInteraction = interaction.options !== undefined;
        
        if (!interaction.guild) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Server-Only Command')
                .setDescription(persona.serverOnly())
                .setColor(persona.colors.blood)
                .setFooter({ text: persona.footer() });
            return isInteraction
                ? interaction.reply({ embeds: [embed], flags: 64 })
                : interaction.reply({ embeds: [embed] }).catch(() => {});
        }
        
        let filter = 'all';
        let amount = null;
        let logChannelOption = null;
        
        if (isInteraction) {
            filter = interaction.options.getString('filter') || 'all';
            amount = interaction.options.getInteger('amount') || null;
            logChannelOption = interaction.options.getChannel('logchannel') || null;
        } else {
            // Permission check for legacy command
            const member = interaction.member;
            const author = interaction.author;
            const isOwner = author?.id === config.ownerId;
            const hasManageMessages = member?.permissions?.has(PermissionFlagsBits.ManageMessages);
            
            if (!isOwner && !hasManageMessages) {
                const embed = new EmbedBuilder()
                    .setTitle('🥀 Permission Denied')
                    .setDescription(persona.deny())
                    .setColor(persona.colors.blood)
                    .setFooter({ text: persona.footer() });
                return interaction.reply({ embeds: [embed] });
            }

            // Delete the command invocation message for privacy/cleanup
            await interaction.delete().catch(() => {});

            // Parse args
            if (args && args.length > 0) {
                // Find if there is a channel mention/ID in the arguments
                const channelArgIndex = args.findIndex(arg => {
                    const match = arg.match(/^<#(\d{17,20})>$/) || arg.match(/^\d{17,20}$/);
                    return !!match;
                });
                
                if (channelArgIndex !== -1) {
                    const channelId = args[channelArgIndex].replace(/[<#>]|/g, '');
                    logChannelOption = interaction.guild?.channels?.cache?.get(channelId) || null;
                    args.splice(channelArgIndex, 1);
                }

                const validFilters = filterChoices.map(c => c.value);
                
                // Check first arg
                if (args.length > 0) {
                    const arg1 = args[0].toLowerCase();
                    const parsedAmount1 = parseInt(arg1, 10);
                    if (!isNaN(parsedAmount1)) {
                        amount = parsedAmount1;
                    } else if (validFilters.includes(arg1)) {
                        filter = arg1;
                    }
                }
                
                // Check second arg if available
                if (args.length > 1) {
                    const arg2 = args[1].toLowerCase();
                    const parsedAmount2 = parseInt(arg2, 10);
                    if (!isNaN(parsedAmount2)) {
                        amount = parsedAmount2;
                    } else if (validFilters.includes(arg2)) {
                        filter = arg2;
                    }
                }
            }
        }

        const channel = interaction.channel;

        // Check if a purge is already running in this channel
        if (purgeState.has(channel.id)) {
            const embed = new EmbedBuilder()
                .setTitle('⚠️ Purge Already Running')
                .setDescription('Ara ara... greedy, aren\'t we? I am already dining in this channel. Use `zzstoppurge` if you wish me to stop.')
                .setColor(persona.colors.amber)
                .setFooter({ text: persona.footer() });
            return isInteraction 
                ? interaction.reply({ embeds: [embed], flags: 64 })
                : interaction.channel.send({ embeds: [embed] });
        }

        // Send confirmation prompt with buttons
        const filterLabel = filterChoices.find(c => c.value === filter)?.name || filter;
        const limitText = amount ? `up to **${amount}** messages` : 'all matching messages in the channel history';

        const confirmEmbed = new EmbedBuilder()
            .setTitle('⚠️ A Feast Awaits')
            .setDescription(`You are inviting me to devour **${filterLabel}** (${limitText}) in <#${channel.id}>...\n\nOnce eaten, their time **cannot be returned**. Not even by me.\n\nShall we begin, my dear? Kihihi ♡`)
            .setColor(persona.colors.blood)
            .setFooter({ text: 'Decide within 30 seconds... I do hate to be kept waiting.' })
            .setTimestamp();

        const confirmBtn = new ButtonBuilder()
            .setCustomId('purge_confirm')
            .setLabel('Begin the Feast')
            .setStyle(ButtonStyle.Danger);

        const cancelBtn = new ButtonBuilder()
            .setCustomId('purge_cancel')
            .setLabel('Spare Them')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);

        let response;
        if (isInteraction) {
            await interaction.reply({ embeds: [confirmEmbed], components: [row], flags: 64 });
            response = await interaction.fetchReply();
        } else {
            response = await interaction.channel.send({ embeds: [confirmEmbed], components: [row] });
        }

        // Button collector
        const userId = isInteraction ? interaction.user.id : interaction.author.id;
        const collector = response.createMessageComponentCollector({
            filter: i => i.user.id === userId,
            time: 30000
        });

        collector.on('collect', async i => {
            if (i.customId === 'purge_confirm') {
                collector.stop('confirmed');

                if (isInteraction) {
                    // Update prompt to show starting status
                    const statusEmbed = new EmbedBuilder()
                        .setTitle('🗑️ The Feast Begins')
                        .setDescription('Ufufu... how generous of you. Use `zzstoppurge` if your nerve fails.')
                        .setColor(persona.colors.amber)
                        .setFooter({ text: persona.footer() })
                        .setTimestamp();
                    
                    await i.update({ embeds: [statusEmbed], components: [] });
                    
                    // Begin the purge process
                    await this.purgeChannel(channel, response, filter, amount, isInteraction, logChannelOption, interaction, response.id);
                } else {
                    // For legacy commands, delete the confirmation prompt message immediately
                    await response.delete().catch(() => {});
                    // Begin the purge process silently
                    await this.purgeChannel(channel, null, filter, amount, isInteraction, logChannelOption, interaction, response.id);
                }
            } 
            
            else if (i.customId === 'purge_cancel') {
                collector.stop('cancelled');

                const cancelEmbed = new EmbedBuilder()
                    .setTitle('❌ Purge Cancelled')
                    .setDescription('Ara... mercy, is it? How very *soft* of you. They shall keep their little seconds — this time.')
                    .setColor(persona.colors.crimson)
                    .setFooter({ text: persona.footer() })
                    .setTimestamp();

                await i.update({ embeds: [cancelEmbed], components: [] });

                if (!isInteraction) {
                    setTimeout(() => {
                        response.delete().catch(() => {});
                    }, 5000);
                }
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('❌ Purge Cancelled')
                    .setDescription('You kept a lady waiting past thirty seconds... so I have withdrawn the invitation. How terribly rude, my dear.')
                    .setColor(persona.colors.blood)
                    .setFooter({ text: persona.footer() })
                    .setTimestamp();
                await response.edit({ embeds: [timeoutEmbed], components: [] }).catch(() => {});

                if (!isInteraction) {
                    setTimeout(() => {
                        response.delete().catch(() => {});
                    }, 5000);
                }
            }
        });
    },

    async purgeChannel(channel, statusMsg, filterType, maxAmount, isInteraction, logChannelOption, interaction, startMessageId) {
        const channelId = channel.id;
        purgeState.set(channelId, { active: true, deleted: 0, startTime: Date.now() });

        let totalDeleted = 0;
        let lastMessageId = startMessageId;

        try {
            while (purgeState.get(channelId)?.active) {
                // Fetch next batch of 100 messages
                const fetchLimit = maxAmount ? Math.min(100, maxAmount - totalDeleted) : 100;
                if (fetchLimit <= 0) break;

                const fetchOptions = { limit: fetchLimit };
                if (lastMessageId) {
                    fetchOptions.before = lastMessageId;
                }

                const messages = await channel.messages.fetch(fetchOptions).catch(() => null);
                if (!messages || messages.size === 0) break;

                // Track cursor for pagination
                lastMessageId = messages.lastKey();

                // Filter out the status message itself and system messages
                const toFilter = messages.filter(m => (!statusMsg || m.id !== statusMsg.id) && !m.system);
                if (toFilter.size === 0) {
                    // If we reached the end of the channel history, break
                    if (messages.size < fetchLimit) break;
                    continue;
                }

                // Apply selected filter (shared predicate in src/lib/messageFilters)
                const toDelete = toFilter.filter(msg => matchesFilter(msg, filterType));

                if (toDelete.size === 0) {
                    // If we fetched a batch but none matched the filter, check if we need to continue fetching
                    if (messages.size < fetchLimit) break;
                    continue;
                }

                const now = Date.now();
                const twoWeeksAgo = now - (14 * 24 * 60 * 60 * 1000);

                const recent = toDelete.filter(m => m.createdTimestamp > twoWeeksAgo);
                const old = toDelete.filter(m => m.createdTimestamp <= twoWeeksAgo);

                // Bulk delete recent messages
                if (recent.size > 0) {
                    try {
                        await channel.bulkDelete(recent, true);
                        totalDeleted += recent.size;
                        purgeState.get(channelId).deleted = totalDeleted;
                    } catch (error) {
                        console.error('Bulk delete error in purgeall:', error);
                        // Fallback one-by-one delete (no manual delay for maximum speed)
                        for (const [, msg] of recent) {
                            if (!purgeState.get(channelId)?.active) break;
                            try {
                                await msg.delete();
                                totalDeleted++;
                                purgeState.get(channelId).deleted = totalDeleted;
                            } catch (err) {
                                if (err.code !== 10008) console.error(err);
                            }
                        }
                    }
                }

                // Delete old messages one by one (no manual delay for maximum speed)
                for (const [, msg] of old) {
                    if (!purgeState.get(channelId)?.active) break;
                    try {
                        await msg.delete();
                        totalDeleted++;
                        purgeState.get(channelId).deleted = totalDeleted;
                    } catch (error) {
                        if (error.code !== 10008) {
                            console.error('Individual delete error in purgeall:', error);
                        }
                    }
                }

                // Update progress embed if status message is configured (only in Slash mode)
                if (statusMsg) {
                    const updateEmbed = new EmbedBuilder()
                        .setTitle('🗑️ The Feast Continues...')
                        .setDescription(`Messages devoured so far: **${totalDeleted}**\nKihihi... every last second of them.`)
                        .setColor(persona.colors.amber)
                        .setFooter({ text: persona.footer() })
                        .setTimestamp();
                    await statusMsg.edit({ embeds: [updateEmbed] }).catch(() => {});
                }

                // Small delay between batch fetches to prevent server lockouts
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Purge finished
            purgeState.delete(channelId);
            if (statusMsg) {
                const completeEmbed = new EmbedBuilder()
                    .setTitle('✅ Purge Complete')
                    .setDescription(`Delicious... **${totalDeleted}** messages, consumed whole. Not a crumb of their time remains ♡`)
                    .setColor(persona.colors.gold)
                    .setFooter({ text: persona.footer() })
                    .setTimestamp();
                await statusMsg.edit({ embeds: [completeEmbed] }).catch(() => {});
            }

            // Log output to configured channel or fallback to server logs
            const filterLabel = filterChoices.find(c => c.value === filterType)?.name || filterType;
            const author = isInteraction ? interaction.user : interaction.author;
            
            const logEmbed = new EmbedBuilder()
                .setTitle('🗑️ Channel Purged')
                .setDescription(`**${totalDeleted}** message(s) in <#${channel.id}> have been... relieved of their time. Ufufu.`)
                .addFields(
                    { name: 'Moderator', value: `${author.tag} (${author.id})`, inline: true },
                    { name: 'Channel', value: `<#${channel.id}>`, inline: true },
                    { name: 'Filter', value: `${filterLabel}`, inline: true }
                )
                .setColor(persona.colors.gold)
                .setFooter({ text: persona.footer() })
                .setTimestamp();

            let logged = false;
            if (logChannelOption) {
                await logChannelOption.send({ embeds: [logEmbed] }).catch(err => console.error('Failed to send purge summary to log channel:', err));
                logged = true;
            }

            if (!logged && interaction.client.logger) {
                await interaction.client.logger.logEvent(
                    '🗑️ Channel Purged',
                    `Successfully deleted **${totalDeleted}** message(s) in <#${channel.id}>.\n**Moderator:** ${author.tag}\n**Filter:** ${filterLabel}`,
                    'success'
                ).catch(err => console.error('Failed to log purge action:', err));
            }

        } catch (error) {
            purgeState.delete(channelId);
            console.error('Purging runtime error:', error);
            if (statusMsg) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Purge Stopped')
                    .setDescription(`Ara... something interrupted my meal: ${error.message}\nMessages devoured before the interruption: **${totalDeleted}**`)
                    .setColor(persona.colors.blood)
                    .setFooter({ text: persona.footer() })
                    .setTimestamp();
                await statusMsg.edit({ embeds: [errorEmbed] }).catch(() => {});
            }
        }
    },

    // Compatibility accessor (state itself lives in services/purgeSessions)
    getPurgeState() {
        return purgeState;
    }
};

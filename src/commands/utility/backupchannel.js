const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const AdmZip = require('adm-zip');
const config = require('../../config/config');
const { createErrorEmbed, createInfoEmbed, createSuccessEmbed } = require('../../lib/embeds');
const persona = require('../../lib/persona');

// Helper to download asset to Buffer and get filename info
async function downloadAsset(url, originalFilename) {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    
    // We can infer extension from the original filename if present, or content-type
    let ext = '';
    const nameParts = originalFilename.split('.');
    if (nameParts.length > 1) {
        ext = '.' + nameParts.pop();
    }
    
    if (!ext) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('gif')) ext = '.gif';
        else if (contentType.includes('png')) ext = '.png';
        else if (contentType.includes('webp')) ext = '.webp';
        else if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = '.jpg';
        else if (contentType.includes('json')) ext = '.json';
        else ext = '.bin';
    }

    return { buffer, ext };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('backupchannel')
        .setDescription('Backup all attachments in a channel into ZIP archives')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild || PermissionFlagsBits.ManageMessages)
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The text channel to backup attachments from (default: current channel)')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false)
        )
        .addIntegerOption(option =>
            option.setName('limit')
                .setDescription('Maximum number of messages to scan (default: all history)')
                .setRequired(false)
                .setMinValue(1)
        ),
    name: 'backupchannel',
    description: 'Backup all attachments in a channel into ZIP archives',

    async execute(interactionOrMessage, args) {
        const isInteraction = interactionOrMessage.options !== undefined;
        
        // Basic check for guild context
        if (!interactionOrMessage.guild) {
            const embed = createErrorEmbed('Server-Only Command', persona.serverOnly());
            return isInteraction 
                ? interactionOrMessage.reply({ embeds: [embed], flags: 64 })
                : interactionOrMessage.reply({ embeds: [embed] }).catch(() => {});
        }

        let targetChannel = interactionOrMessage.channel;
        let limit = null;

        if (isInteraction) {
            targetChannel = interactionOrMessage.options.getChannel('channel') || interactionOrMessage.channel;
            limit = interactionOrMessage.options.getInteger('limit') || null;
        } else {
            // Text command args parsing
            if (args && args.length > 0) {
                // Find if there is a channel mention/ID
                const channelArgIndex = args.findIndex(arg => {
                    const match = arg.match(/^<#(\d{17,20})>$/) || arg.match(/^\d{17,20}$/);
                    return !!match;
                });
                
                if (channelArgIndex !== -1) {
                    const channelId = args[channelArgIndex].replace(/[<#>]|/g, '');
                    targetChannel = interactionOrMessage.guild?.channels?.cache?.get(channelId) || targetChannel;
                    args.splice(channelArgIndex, 1);
                }

                // Check for limit in remaining args
                if (args.length > 0) {
                    const parsedLimit = parseInt(args[0], 10);
                    if (!isNaN(parsedLimit) && parsedLimit > 0) {
                        limit = parsedLimit;
                    }
                }
            }
        }

        // Check if target channel is text-based
        if (!targetChannel.isTextBased()) {
            const embed = createErrorEmbed('Invalid Channel', 'Ara... I can only read text channels, my dear. Choose one of those.');
            return isInteraction 
                ? interactionOrMessage.reply({ embeds: [embed], flags: 64 })
                : interactionOrMessage.reply({ embeds: [embed] }).catch(() => {});
        }

        // Send a deferred or loading reply
        let processingMsg = null;
        const initialEmbed = createInfoEmbed('Backup Started', `🔍 Peering back through time in <#${targetChannel.id}>... every attachment shall be accounted for. Kihihi.`);
        if (isInteraction) {
            await interactionOrMessage.reply({ embeds: [initialEmbed], flags: 64 });
            processingMsg = await interactionOrMessage.fetchReply();
        } else {
            processingMsg = await interactionOrMessage.reply({ embeds: [initialEmbed] }).catch(() => null);
        }

        try {
            let totalScanned = 0;
            let lastMessageId = null;
            const attachmentsList = []; // Array of { url, name, size }

            // Pagination loop to fetch all messages
            while (true) {
                const fetchLimit = limit ? Math.min(100, limit - totalScanned) : 100;
                if (fetchLimit <= 0) break;

                const fetchOptions = { limit: fetchLimit };
                if (lastMessageId) {
                    fetchOptions.before = lastMessageId;
                }

                const messages = await targetChannel.messages.fetch(fetchOptions).catch(() => null);
                if (!messages || messages.size === 0) break;

                lastMessageId = messages.lastKey();
                totalScanned += messages.size;

                for (const msg of messages.values()) {
                    if (msg.attachments && msg.attachments.size > 0) {
                        for (const att of msg.attachments.values()) {
                            attachmentsList.push({
                                url: att.url,
                                name: att.name,
                                size: att.size
                            });
                        }
                    }
                }

                // Periodically update fetch status
                if (totalScanned % 300 === 0 || limit) {
                    const currentScanEmbed = createInfoEmbed(
                        'Scanning Channel',
                        `🔍 Scanning history of <#${targetChannel.id}>...\n` +
                        `• Messages scanned: **${totalScanned}**\n` +
                        `• Attachments found: **${attachmentsList.length}**`
                    );
                    if (isInteraction) {
                        await interactionOrMessage.editReply({ embeds: [currentScanEmbed] }).catch(() => {});
                    } else if (processingMsg) {
                        await processingMsg.edit({ embeds: [currentScanEmbed] }).catch(() => {});
                    }
                }

                // If we hit the end of the channel history, break
                if (messages.size < fetchLimit) break;
            }

            if (attachmentsList.length === 0) {
                const embed = createErrorEmbed('No Attachments Found', `Ara...? <#${targetChannel.id}> holds no attachments at all. Its history is bare.`);
                if (isInteraction) {
                    return await interactionOrMessage.editReply({ embeds: [embed] });
                } else if (processingMsg) {
                    return await processingMsg.edit({ embeds: [embed] }).catch(() => {});
                }
            }

            const zips = []; // Array of Buffers
            let currentZip = new AdmZip();
            let currentZipSize = 0;
            let successCount = 0;
            let failCount = 0;
            let downloadedCount = 0;
            const maxZipsLimit = 5;
            let truncated = false;

            const nameCounts = {};
            function getUniqueName(name, ext) {
                const nameWithoutExt = name.slice(0, name.lastIndexOf('.')) || name;
                const safeName = nameWithoutExt.replace(/[\\/:*?"<>|]/g, '_');
                const key = `${safeName}${ext}`.toLowerCase();
                if (!nameCounts[key]) {
                    nameCounts[key] = 1;
                    return `${safeName}${ext}`;
                } else {
                    const count = nameCounts[key]++;
                    return `${safeName} (${count})${ext}`;
                }
            }

            // Download and package attachments
            for (const att of attachmentsList) {
                // If we already reached the max ZIP files limit, stop downloading
                if (zips.length >= maxZipsLimit) {
                    truncated = true;
                    break;
                }

                try {
                    const { buffer, ext } = await downloadAsset(att.url, att.name);
                    
                    // If adding this file would exceed the 23MB limit for the current ZIP
                    if (currentZipSize + buffer.length > 23 * 1024 * 1024) {
                        // Package current ZIP
                        zips.push(currentZip.toBuffer());
                        
                        // Check if we hit the limit after zipping
                        if (zips.length >= maxZipsLimit) {
                            truncated = true;
                            break;
                        }

                        // Reset for new ZIP
                        currentZip = new AdmZip();
                        currentZipSize = 0;
                    }

                    const filename = getUniqueName(att.name, ext);
                    currentZip.addFile(filename, buffer);
                    currentZipSize += buffer.length;
                    successCount++;
                } catch (err) {
                    console.error(`Failed to download attachment ${att.name}:`, err.message);
                    failCount++;
                }
                downloadedCount++;

                // Periodically update download status
                if (downloadedCount % 10 === 0) {
                    const currentProgressEmbed = createInfoEmbed(
                        'Downloading Attachments',
                        `📥 Downloading attachments for <#${targetChannel.id}>...\n` +
                        `• Progress: **${downloadedCount}/${attachmentsList.length}**\n` +
                        `• ZIP parts created: **${zips.length + (currentZipSize > 0 ? 1 : 0)}**\n` +
                        `• Successfully zipped: **${successCount}**`
                    );
                    if (isInteraction) {
                        await interactionOrMessage.editReply({ embeds: [currentProgressEmbed] }).catch(() => {});
                    } else if (processingMsg) {
                        await processingMsg.edit({ embeds: [currentProgressEmbed] }).catch(() => {});
                    }
                }
            }

            // Add the final ZIP if it has contents
            if (currentZipSize > 0 && zips.length < maxZipsLimit) {
                zips.push(currentZip.toBuffer());
            }

            if (zips.length === 0) {
                const embed = createErrorEmbed('Backup Failed', 'How vexing... not a single attachment would come with me. Their links may have expired beyond even my reach.');
                if (isInteraction) {
                    return await interactionOrMessage.editReply({ embeds: [embed] });
                } else if (processingMsg) {
                    return await processingMsg.edit({ embeds: [embed] }).catch(() => {});
                }
            }

            // Prepare final attachments for upload
            const cleanChannelName = targetChannel.name.replace(/[^a-zA-Z0-9]/g, '_');
            const attachmentsFiles = zips.map((zipBuf, index) => {
                const partName = zips.length > 1 ? `_part${index + 1}` : '';
                return new AttachmentBuilder(zipBuf, {
                    name: `${cleanChannelName}_backup${partName}.zip`
                });
            });

            const warningText = truncated 
                ? `\n⚠️ **Notice**: The backup was truncated because it reached the safe limit of **${maxZipsLimit} ZIP files (approx. 120MB)**. Only the first ${downloadedCount} attachments were packaged.`
                : '';

            const successEmbed = createSuccessEmbed(
                'Backup Completed',
                `Successfully backed up attachments from <#${targetChannel.id}>!\n\n` +
                `• **Scanned**: ${totalScanned} messages\n` +
                `• **Total Attachments Found**: ${attachmentsList.length}\n` +
                `• **Successfully Zipped**: ${successCount}\n` +
                `• **ZIP Archives Created**: ${zips.length}\n` +
                (failCount > 0 ? `• **Failed Downloads**: ${failCount}\n` : '') +
                warningText
            );

            // Upload the ZIPs
            if (isInteraction) {
                await interactionOrMessage.editReply({
                    embeds: [successEmbed],
                    files: attachmentsFiles
                });
            } else if (processingMsg) {
                await processingMsg.edit({
                    embeds: [successEmbed],
                    content: '',
                    files: attachmentsFiles
                }).catch(async () => {
                    await interactionOrMessage.reply({
                        embeds: [successEmbed],
                        files: attachmentsFiles
                    }).catch(() => {});
                });
            }

        } catch (error) {
            console.error('Backup channel command error:', error);
            const errEmbed = createErrorEmbed('Backup Failed', `An error occurred during backup generation: ${error.message}`);
            if (isInteraction) {
                await interactionOrMessage.editReply({ embeds: [errEmbed] }).catch(() => {});
            } else if (processingMsg) {
                await processingMsg.edit({ embeds: [errEmbed] }).catch(() => {});
            }
        }
    }
};

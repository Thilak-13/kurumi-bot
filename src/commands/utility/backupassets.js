const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const AdmZip = require('adm-zip');
const config = require('../../config/config');
const { createErrorEmbed, createInfoEmbed, createSuccessEmbed } = require('../../lib/embeds');

// Helper to download asset to Buffer and get native extension
async function downloadAsset(url, stickerFormat = null) {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    
    // Explicit format override for stickers
    if (stickerFormat !== null) {
        if (stickerFormat === 2) return { buffer, ext: '.apng' };
        if (stickerFormat === 4) return { buffer, ext: '.gif' };
        if (stickerFormat === 3) return { buffer, ext: '.json' }; // Lottie
        if (stickerFormat === 5) return { buffer, ext: '.webp' };
        if (stickerFormat === 1) return { buffer, ext: '.png' };
    }

    // Determine extension from content-type header
    const contentType = res.headers.get('content-type') || '';
    let ext = '.png';
    if (contentType.includes('gif')) {
        ext = '.gif';
    } else if (contentType.includes('apng')) {
        ext = '.apng';
    } else if (contentType.includes('webp')) {
        ext = '.webp';
    } else if (contentType.includes('jpeg') || contentType.includes('jpg')) {
        ext = '.jpg';
    } else if (contentType.includes('json')) {
        ext = '.json';
    }
    return { buffer, ext };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('backupassets')
        .setDescription('Backup guild custom emojis and stickers into a ZIP archive')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions || PermissionFlagsBits.ManageEmojisAndStickers)
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of assets to backup')
                .setRequired(false)
                .addChoices(
                    { name: 'All', value: 'all' },
                    { name: 'Emojis Only', value: 'emojis' },
                    { name: 'Stickers Only', value: 'stickers' }
                )
        ),
    name: 'backupassets',
    description: 'Backup guild custom emojis and stickers into a ZIP archive',

    async execute(interactionOrMessage, args) {
        const isInteraction = interactionOrMessage.options !== undefined;
        
        // Basic check for guild context
        if (!interactionOrMessage.guild) {
            const embed = createErrorEmbed('Server-Only Command', 'This command can only be used in a server.');
            return isInteraction 
                ? interactionOrMessage.reply({ embeds: [embed], flags: 64 })
                : interactionOrMessage.reply({ embeds: [embed] }).catch(() => {});
        }

        const guild = interactionOrMessage.guild;

        // Retrieve option/argument
        let type = 'all';
        if (isInteraction) {
            type = interactionOrMessage.options.getString('type') || 'all';
        } else if (args && args.length > 0) {
            const argType = args[0].toLowerCase();
            if (['all', 'emojis', 'stickers'].includes(argType)) {
                type = argType;
            }
        }

        // Send a deferred or loading reply
        let processingMsg = null;
        const initialEmbed = createInfoEmbed('Backup Started', '🔍 Fetching emojis and stickers from the server...');
        if (isInteraction) {
            await interactionOrMessage.reply({ embeds: [initialEmbed], flags: 64 });
            processingMsg = await interactionOrMessage.fetchReply();
        } else {
            processingMsg = await interactionOrMessage.reply({ embeds: [initialEmbed] }).catch(() => null);
        }

        try {
            let emojis = [];
            let stickers = [];

            // Fetch emojis if requested
            if (type === 'all' || type === 'emojis') {
                const fetchedEmojis = await guild.emojis.fetch().catch(() => new Map());
                emojis = Array.from(fetchedEmojis.values());
            }

            // Fetch stickers if requested
            if (type === 'all' || type === 'stickers') {
                const fetchedStickers = await guild.stickers.fetch().catch(() => new Map());
                stickers = Array.from(fetchedStickers.values());
            }

            const totalAssets = emojis.length + stickers.length;
            if (totalAssets === 0) {
                const embed = createErrorEmbed('No Assets Found', 'There are no custom emojis or stickers to backup in this server.');
                if (isInteraction) {
                    return interactionOrMessage.editReply({ embeds: [embed] });
                } else {
                    return processingMsg ? processingMsg.edit({ embeds: [embed] }) : interactionOrMessage.reply({ embeds: [embed] });
                }
            }

            // Update status
            const progressEmbed = createInfoEmbed(
                'Backup in Progress',
                `📦 Found **${emojis.length}** emojis and **${stickers.length}** stickers.\n📥 Downloading assets (0/${totalAssets})...`
            );
            if (isInteraction) {
                await interactionOrMessage.editReply({ embeds: [progressEmbed] });
            } else if (processingMsg) {
                await processingMsg.edit({ embeds: [progressEmbed] }).catch(() => {});
            }

            const zip = new AdmZip();
            let downloadedCount = 0;
            let successCount = 0;
            let failCount = 0;

            const nameCounts = {};
            function getUniqueName(folder, name, ext) {
                const safeName = name.replace(/[\\/:*?"<>|]/g, '_');
                const key = `${folder}/${safeName}${ext}`.toLowerCase();
                if (!nameCounts[key]) {
                    nameCounts[key] = 1;
                    return `${folder}/${safeName}${ext}`;
                } else {
                    const count = nameCounts[key]++;
                    return `${folder}/${safeName} (${count})${ext}`;
                }
            }

            // Process emojis
            for (const emoji of emojis) {
                try {
                    const url = emoji.imageURL();
                    const { buffer, ext } = await downloadAsset(url);
                    const filename = getUniqueName('emojis', emoji.name, ext);
                    zip.addFile(filename, buffer);
                    successCount++;
                } catch (err) {
                    console.error(`Failed to download emoji ${emoji.name}:`, err.message);
                    failCount++;
                }
                downloadedCount++;

                // Periodically update progress every 15 assets so we don't spam updates too much
                if (downloadedCount % 15 === 0) {
                    const currentProgressEmbed = createInfoEmbed(
                        'Backup in Progress',
                        `📦 Found **${emojis.length}** emojis and **${stickers.length}** stickers.\n📥 Downloading assets (${downloadedCount}/${totalAssets})...`
                    );
                    if (isInteraction) {
                        await interactionOrMessage.editReply({ embeds: [currentProgressEmbed] }).catch(() => {});
                    } else if (processingMsg) {
                        await processingMsg.edit({ embeds: [currentProgressEmbed] }).catch(() => {});
                    }
                }
            }

            // Process stickers
            for (const sticker of stickers) {
                try {
                    const url = sticker.url;
                    // Pass sticker.format (APNG = 2, GIF = 4, Lottie = 3, WEBP = 5, PNG = 1)
                    const { buffer, ext } = await downloadAsset(url, sticker.format);
                    const filename = getUniqueName('stickers', sticker.name, ext);
                    zip.addFile(filename, buffer);
                    successCount++;
                } catch (err) {
                    console.error(`Failed to download sticker ${sticker.name}:`, err.message);
                    failCount++;
                }
                downloadedCount++;

                if (downloadedCount % 15 === 0) {
                    const currentProgressEmbed = createInfoEmbed(
                        'Backup in Progress',
                        `📦 Found **${emojis.length}** emojis and **${stickers.length}** stickers.\n📥 Downloading assets (${downloadedCount}/${totalAssets})...`
                    );
                    if (isInteraction) {
                        await interactionOrMessage.editReply({ embeds: [currentProgressEmbed] }).catch(() => {});
                    } else if (processingMsg) {
                        await processingMsg.edit({ embeds: [currentProgressEmbed] }).catch(() => {});
                    }
                }
            }

            // Final ZIP generation
            const zipBuffer = zip.toBuffer();
            
            // Check size (Discord has upload limit of 25MB for non-boosted bots/servers)
            const zipSizeMb = zipBuffer.length / (1024 * 1024);
            if (zipSizeMb > 24.9) {
                const limitEmbed = createErrorEmbed(
                    'Backup File Too Large',
                    `The backup ZIP size is **${zipSizeMb.toFixed(2)} MB**, which exceeds Discord's 25MB file upload limit.\n\n` +
                    `Please try backing up emojis or stickers separately using:\n` +
                    `- Slash: \`/backupassets type:emojis\` or \`/backupassets type:stickers\`\n` +
                    `- Text: \`zzbackupassets emojis\` or \`zzbackupassets stickers\``
                );
                if (isInteraction) {
                    return await interactionOrMessage.editReply({ embeds: [limitEmbed] });
                } else if (processingMsg) {
                    return await processingMsg.edit({ embeds: [limitEmbed] }).catch(() => {});
                }
            }

            const cleanGuildName = guild.name.replace(/[^a-zA-Z0-9]/g, '_');
            const attachment = new AttachmentBuilder(zipBuffer, {
                name: `${cleanGuildName}_assets_backup.zip`
            });

            const successEmbed = createSuccessEmbed(
                'Backup Completed',
                `Successfully backed up **${successCount}** custom assets to the attached ZIP file.\n\n` +
                `• **Emojis**: ${emojis.length} successfully compressed\n` +
                `• **Stickers**: ${stickers.length} successfully compressed\n` +
                (failCount > 0 ? `⚠️ **Failed**: ${failCount} assets failed to download` : '')
            );

            if (isInteraction) {
                await interactionOrMessage.editReply({
                    embeds: [successEmbed],
                    files: [attachment]
                });
            } else if (processingMsg) {
                await processingMsg.edit({
                    embeds: [successEmbed],
                    content: '',
                    files: [attachment]
                }).catch(async () => {
                    // Fallback to reply if edit fails
                    await interactionOrMessage.reply({
                        embeds: [successEmbed],
                        files: [attachment]
                    }).catch(() => {});
                });
            }

        } catch (error) {
            console.error('Backup command error:', error);
            const errEmbed = createErrorEmbed('Backup Failed', `An error occurred during backup generation: ${error.message}`);
            if (isInteraction) {
                await interactionOrMessage.editReply({ embeds: [errEmbed] }).catch(() => {});
            } else if (processingMsg) {
                await processingMsg.edit({ embeds: [errEmbed] }).catch(() => {});
            }
        }
    }
};

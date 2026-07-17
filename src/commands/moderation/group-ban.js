const { EmbedBuilder, AttachmentBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../../config/config');
const persona = require('../../lib/persona');

function extractUserIds(text) {
    if (!text) return [];
    const matches = text.match(/\b\d{17,20}\b/g);
    return matches ? Array.from(new Set(matches)) : [];
}

module.exports = {
    name: 'groupban',
    description: 'Ban multiple users listed in a CSV, text, or uploaded file (Usage: zzgroupban)',

    async execute(message, args) {
        if (!message.guild) {
            console.log('[GROUPBAN] Executed outside of guild.');
            return message.reply(`❌ ${persona.serverOnly()}`).catch(() => {});
        }

        // Check if the executing user has permission to ban members
        const member = message.member;
        const isOwner = message.author.id === config.ownerId;
        const hasBanPermission = member?.permissions?.has(PermissionFlagsBits.BanMembers);
        
        if (!isOwner && !hasBanPermission) {
            console.log(`[GROUPBAN] User ${message.author.tag} denied permission (not owner and lacks BanMembers).`);
            const errorEmbed = new EmbedBuilder()
                .setTitle('🥀 Permission Denied')
                .setDescription('Ara ara... you wish to cast souls into the shadows without the `Ban Members` permission? Ambition suits you, my dear, but no.')
                .setColor(persona.colors.blood)
                .setFooter({ text: persona.footer() })
                .setTimestamp();
            return message.reply({ embeds: [errorEmbed] });
        }

        // Check if the bot itself has permission to ban members
        const botMember = message.guild.members.me;
        if (!botMember || !botMember.permissions.has(PermissionFlagsBits.BanMembers)) {
            console.log('[GROUPBAN] Bot is missing BanMembers permission in guild.');
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Bot Missing Permissions')
                .setDescription('How embarrassing... my hands are tied without the `Ban Members` permission. Untie me, and then we may begin ♡')
                .setColor(persona.colors.blood)
                .setFooter({ text: persona.footer() })
                .setTimestamp();
            return message.reply({ embeds: [errorEmbed] });
        }

        let userIds = [];

        console.log(`[GROUPBAN] Started by user: ${message.author.tag} (${message.author.id})`);
        console.log(`[GROUPBAN] Args length: ${args.length}, Attachments count: ${message.attachments.size}`);

        // 1. Check if a file was attached to the command message
        const commandAttachment = message.attachments.first();
        if (commandAttachment) {
            console.log(`[GROUPBAN] Found attachment in initial command: ${commandAttachment.url}`);
            try {
                const fileResponse = await fetch(commandAttachment.url);
                console.log(`[GROUPBAN] Initial attachment fetch status: ${fileResponse.status}`);
                if (fileResponse.ok) {
                    const fileText = await fileResponse.text();
                    userIds = extractUserIds(fileText);
                    console.log(`[GROUPBAN] Extracted ${userIds.length} user IDs from initial attachment`);
                }
            } catch (err) {
                console.error('[GROUPBAN] Failed to read initial attached file:', err);
            }
        } 
        // 2. Check if IDs were provided as text arguments
        else if (args.length > 0) {
            console.log('[GROUPBAN] Reading user IDs from arguments');
            userIds = extractUserIds(args.join(' '));
            console.log(`[GROUPBAN] Extracted ${userIds.length} user IDs from arguments`);
        }

        // 3. Prompt for input if no IDs were found in the command message
        if (userIds.length === 0) {
            console.log('[GROUPBAN] No initial user IDs found. Sending prompt to user...');
            const promptEmbed = new EmbedBuilder()
                .setTitle('📥 Group Ban Input Required')
                .setDescription('A guest list, if you please... attach a CSV/TXT file or paste the User IDs below.\n\n*I shall wait sixty seconds. A lady is patient — to a point.*')
                .setColor(persona.colors.crimson)
                .setFooter({ text: persona.footer() })
                .setTimestamp();
            const promptMsg = await message.reply({ embeds: [promptEmbed] });
            console.log('[GROUPBAN] Prompt sent. Waiting for message...');

            const filter = (m) => m.author.id === message.author.id;
            try {
                const collected = await message.channel.awaitMessages({
                    filter,
                    max: 1,
                    time: 60000,
                    errors: ['time']
                });

                console.log(`[GROUPBAN] Message collected!`);
                const responseMsg = collected.first();
                const responseAttachment = responseMsg.attachments.first();
                console.log(`[GROUPBAN] Response content length: ${responseMsg.content?.length || 0}, attachments: ${responseMsg.attachments.size}`);

                if (responseAttachment) {
                    console.log(`[GROUPBAN] Fetching attachment from response: ${responseAttachment.url}`);
                    const fileResponse = await fetch(responseAttachment.url);
                    console.log(`[GROUPBAN] Response attachment fetch status: ${fileResponse.status}`);
                    if (fileResponse.ok) {
                        const fileText = await fileResponse.text();
                        userIds = extractUserIds(fileText);
                        console.log(`[GROUPBAN] Extracted ${userIds.length} user IDs from response attachment`);
                    }
                } else {
                    console.log('[GROUPBAN] Parsing response text content for user IDs...');
                    userIds = extractUserIds(responseMsg.content);
                    console.log(`[GROUPBAN] Extracted ${userIds.length} user IDs from response text`);
                }

                // Clean up the prompt message
                console.log('[GROUPBAN] Deleting prompt message...');
                await promptMsg.delete().catch(() => {});
                console.log('[GROUPBAN] Prompt message deleted');
            } catch (err) {
                console.error('[GROUPBAN] Error during awaitMessages/parsing:', err);
                await promptMsg.delete().catch(() => {});
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('❌ Command Timed Out')
                    .setDescription('Sixty seconds, gone... and not a word from you. You wasted my time, my dear. Do not make a habit of it.')
                    .setColor(persona.colors.blood)
                    .setFooter({ text: persona.footer() })
                    .setTimestamp();
                return message.reply({ embeds: [timeoutEmbed] });
            }
        }

        // 4. Handle case where no valid IDs could be extracted
        if (userIds.length === 0) {
            console.log('[GROUPBAN] Final user IDs count is 0. Aborting.');
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ No IDs Found')
                .setDescription('Ara...? I found no valid 17–20 digit User IDs in that. An empty guest list makes for a very dull evening.')
                .setColor(persona.colors.blood)
                .setFooter({ text: persona.footer() })
                .setTimestamp();
            return message.reply({ embeds: [errorEmbed] });
        }

        // 5. Start the group ban process
        console.log(`[GROUPBAN] Starting to ban ${userIds.length} users...`);
        const statusEmbed = new EmbedBuilder()
            .setTitle('🔨 Group Ban In Progress')
            .setDescription(`**${userIds.length}** guest(s) on the list... and every one of them shall be shown into the shadows. Quietly. Kihihi.`)
            .setColor(persona.colors.amber)
            .setFooter({ text: persona.footer() })
            .setTimestamp();
        const statusMsg = await message.reply({ embeds: [statusEmbed] });

        const banned = [];
        const failed = [];

        for (const userId of userIds) {
            let tag = userId;
            try {
                // Optimize: check cache only to avoid heavy user fetching API calls
                const cachedUser = message.client.users.cache.get(userId);
                tag = cachedUser ? `${cachedUser.tag} (${userId})` : userId;

                // Check if target is guild owner or has higher/equal role
                const targetMember = message.guild.members.cache.get(userId);
                if (targetMember) {
                    if (targetMember.id === message.guild.ownerId) {
                        throw new Error('Cannot ban guild owner');
                    }
                    if (botMember && targetMember.roles.highest.position >= botMember.roles.highest.position) {
                        throw new Error('User has a higher or equal role');
                    }
                }

                console.log(`[GROUPBAN] Attempting to ban user: ${tag}`);
                // Ban the user (silent = no bot DMs sent)
                await message.guild.bans.create(userId, { reason: `Group ban by ${message.author.tag}` });
                banned.push(tag);
                console.log(`[GROUPBAN] Successfully banned: ${tag}`);
            } catch (error) {
                console.error(`[GROUPBAN] Failed to ban user ${tag}:`, error.message);
                failed.push({ tag, reason: error.message });
            }

            // 250ms delay between bans to avoid Discord rate limit issues
            await new Promise(resolve => setTimeout(resolve, 250));
        }

        // 6. Report the results
        console.log(`[GROUPBAN] Completed. Banned: ${banned.length}, Failed: ${failed.length}`);
        const completeEmbed = new EmbedBuilder()
            .setTitle('✅ Group Ban Complete')
            .addFields(
                { name: 'Total Processed', value: `${userIds.length}`, inline: true },
                { name: 'Successfully Banned', value: `${banned.length}`, inline: true },
                { name: 'Failed', value: `${failed.length}`, inline: true }
            )
            .setColor(persona.colors.gold)
            .setFooter({ text: persona.footer() })
            .setTimestamp();

        let detailedText = '';
        if (banned.length > 0) {
            detailedText += `**Successfully Banned Users [${banned.length}]:**\n${banned.map(b => `• ${b}`).join('\n')}\n\n`;
        }
        if (failed.length > 0) {
            detailedText += `**Failed Bans [${failed.length}]:**\n${failed.map(f => `• ${f.tag}: ${f.reason}`).join('\n')}`;
        }

        // Attach text file if list is long (Discord limits embed description to 4096 chars)
        if (detailedText.length < 3000) {
            completeEmbed.setDescription(detailedText || 'No guests were shown out. The list was empty, it seems.');
            await statusMsg.edit({ embeds: [completeEmbed] }).catch(() => {});
        } else {
            completeEmbed.setDescription('My, such a *long* guest list... the full account of the evening is attached below.');
            const attachment = new AttachmentBuilder(Buffer.from(detailedText), { name: 'group-ban-results.txt' });
            await statusMsg.edit({ embeds: [completeEmbed], files: [attachment] }).catch(() => {});
        }
    }
};

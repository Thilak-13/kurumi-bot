const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

/**
 * Normalizes a hex color string to Discord.js-friendly #RRGGBB format
 * Accepts formats: #ff0000, ff0000, 0xff0000
 * @param {string} hex - Hex color string
 * @returns {string|null} - Normalized hex string or null if invalid
 */
function normalizeHexColor(hex) {
    if (!hex) return null;

    // Remove common prefixes
    hex = hex.trim()
        .replace(/^#/, '')      // Remove #
        .replace(/^0x/i, '');   // Remove 0x or 0X

    // Validate hex format (must be 6 characters, 0-9 and A-F)
    if (!/^[0-9A-F]{6}$/i.test(hex)) {
        return null;
    }

    return `#${hex.toUpperCase()}`;
}

const HOLOGRAPHIC_COLORS = {
    primaryColor: 11127295,
    secondaryColor: 16759788,
    tertiaryColor: 16761760
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roleedit')
        .setDescription('Apply solid, gradient, or holographic style to a role')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Role to recolor')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('style')
                .setDescription('Color style to apply')
                .setRequired(false)
                .addChoices(
                    { name: 'solid', value: 'solid' },
                    { name: 'gradient', value: 'gradient' },
                    { name: 'holographic', value: 'holographic' }
                ))
        .addStringOption(option =>
            option.setName('color1')
                .setDescription('Primary color (required for solid/gradient)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('color2')
                .setDescription('Secondary color (required for gradient only)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('emoji')
                .setDescription('Emoji for the role icon (standard unicode, custom emoji, or "none" to remove)')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    async execute(interaction) {
        // Defer reply as role operations may take time
        await interaction.deferReply({ flags: 64 });
        
        try {
            const targetRole = interaction.options.getRole('role');
            const style = interaction.options.getString('style');
            const color1Hex = interaction.options.getString('color1');
            const color2Hex = interaction.options.getString('color2');
            const emoji = interaction.options.getString('emoji');
 
            let payloadColors;
            let responseLines = [];

            let resolvedStyle = style;
            if (!resolvedStyle) {
                if (color1Hex && color2Hex) {
                    resolvedStyle = 'gradient';
                } else if (color1Hex) {
                    resolvedStyle = 'solid';
                }
            }

            if (resolvedStyle === 'solid') {
                if (!color1Hex) {
                    return await interaction.editReply({
                        content: '❌ Style `solid` requires `color1`'
                    });
                }

                if (color2Hex) {
                    return await interaction.editReply({
                        content: '❌ Style `solid` only uses `color1`. Remove `color2`.'
                    });
                }

                const primaryColor = normalizeHexColor(color1Hex);
                if (primaryColor === null) {
                    return await interaction.editReply({
                        content: `❌ Invalid color1: \`${color1Hex}\`\nUse hex format: #ff0000, ff0000, or 0xff0000`
                    });
                }

                payloadColors = {
                    primaryColor,
                    secondaryColor: null,
                    tertiaryColor: null
                };

                responseLines.push('🎨 **Solid Applied!**');
                responseLines.push(`Role: ${targetRole}`);
                responseLines.push(`Color: \`${primaryColor}\``);
            } else if (resolvedStyle === 'gradient') {
                if (!color1Hex || !color2Hex) {
                    return await interaction.editReply({
                        content: '❌ Style `gradient` requires both `color1` and `color2`'
                    });
                }

                const primaryColor = normalizeHexColor(color1Hex);
                const secondaryColor = normalizeHexColor(color2Hex);

                if (primaryColor === null) {
                    return await interaction.editReply({
                        content: `❌ Invalid color1: \`${color1Hex}\`\nUse hex format: #ff0000, ff0000, or 0xff0000`
                    });
                }

                if (secondaryColor === null) {
                    return await interaction.editReply({
                        content: `❌ Invalid color2: \`${color2Hex}\`\nUse hex format: #00ff00, 00ff00, or 0x00ff00`
                    });
                }

                payloadColors = {
                    primaryColor,
                    secondaryColor
                };

                responseLines.push('🌈 **Gradient Applied!**');
                responseLines.push(`Role: ${targetRole}`);
                responseLines.push(`Colors: \`${primaryColor}\` → \`${secondaryColor}\``);
            } else if (resolvedStyle === 'holographic') {
                if (color1Hex || color2Hex) {
                    return await interaction.editReply({
                        content: '❌ Style `holographic` uses fixed default colors. Do not provide color1 or color2.'
                    });
                }

                payloadColors = { ...HOLOGRAPHIC_COLORS };
                responseLines.push('✨ **Holographic Applied!**');
                responseLines.push(`Role: ${targetRole}`);
                responseLines.push('Colors are fixed by Discord default holographic style.');
            } else if (color2Hex && !color1Hex) {
                return await interaction.editReply({
                    content: '❌ `color2` cannot be used without `color1`'
                });
            } else if (!emoji) {
                return await interaction.editReply({
                    content: '❌ Provide a style, colors, or an emoji.'
                });
            }

            const botMember = await interaction.guild.members.fetch(interaction.client.user.id);
            const member = await interaction.guild.members.fetch(interaction.user.id);

            const colorRole = targetRole;

            if (colorRole.id === interaction.guild.id) {
                return await interaction.editReply({
                    content: '❌ The @everyone role cannot be recolored'
                });
            }

            if (colorRole.managed) {
                return await interaction.editReply({
                    content: '❌ Managed roles cannot be edited'
                });
            }

            if (colorRole.position >= botMember.roles.highest.position) {
                return await interaction.editReply({
                    content: '❌ Cannot modify this role because it is at or above my highest role'
                });
            }

            if (interaction.member.id !== interaction.guild.ownerId && colorRole.position >= member.roles.highest.position) {
                return await interaction.editReply({
                    content: '❌ You can only recolor roles that are below your highest role'
                });
            }

            // Verify bot can manage this role
            if (colorRole.position >= botMember.roles.highest.position) {
                return await interaction.editReply({
                    content: '❌ Cannot modify this role - it\'s higher than my highest role in the hierarchy'
                });
            }

            let iconPayload = undefined;
            let unicodeEmojiPayload = undefined;

            if (emoji) {
                if (emoji.toLowerCase() === 'none') {
                    iconPayload = null;
                    unicodeEmojiPayload = null;
                    responseLines.push('❌ **Role icon emoji removed!**');
                } else {
                    const customEmojiMatch = emoji.match(/<?a?:?\w+:(\d+)>?/);
                    if (customEmojiMatch) {
                        const emojiId = customEmojiMatch[1];
                        // Construct the public Discord CDN URL for the custom emoji
                        const emojiUrl = `https://cdn.discordapp.com/emojis/${emojiId}.png`;
                        
                        iconPayload = emojiUrl;
                        unicodeEmojiPayload = null;
                        responseLines.push(`✨ **Role icon custom emoji set!**`);
                    } else {
                        unicodeEmojiPayload = emoji;
                        iconPayload = null;
                        responseLines.push(`✨ **Role icon unicode emoji set to ${emoji}!**`);
                    }
                }
            }

            const rolePayload = {};
            if (payloadColors) {
                rolePayload.colors = payloadColors;
            }
            if (emoji) {
                rolePayload.icon = iconPayload;
                rolePayload.unicodeEmoji = unicodeEmojiPayload;
            }
            
            console.log('🎨 Rolecolor Payload:', {
                ...rolePayload,
                icon: iconPayload ? iconPayload.id || iconPayload : null
            });
            
            await colorRole.edit(rolePayload);
            
            await interaction.editReply({ content: responseLines.join('\n') });

        } catch (error) {
            console.error('❌ Roleedit command error:', error);

            // Handle specific error cases
            if (error.code === 50013) {
                return await interaction.editReply({
                    content: '❌ Missing permissions to manage roles'
                });
            }

            await interaction.editReply({
                content: `❌ An error occurred: ${error.message}`
            });
        }
    }
};
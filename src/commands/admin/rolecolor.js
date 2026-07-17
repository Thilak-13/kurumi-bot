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
                        content: '❌ Ara... a `solid` dress needs its `color1`, my dear.'
                    });
                }

                if (color2Hex) {
                    return await interaction.editReply({
                        content: '❌ `solid` wears only one color. Do remove `color2`... simplicity has its own elegance.'
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

                responseLines.push('🎨 **Solid applied... a single, committed shade. How decisive ♡**');
                responseLines.push(`Role: ${targetRole}`);
                responseLines.push(`Color: \`${primaryColor}\``);
            } else if (resolvedStyle === 'gradient') {
                if (!color1Hex || !color2Hex) {
                    return await interaction.editReply({
                        content: '❌ A `gradient` is a dance of two colors — I shall need both `color1` and `color2`.'
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

                responseLines.push('🌈 **Gradient applied... two colors, entwined. Ufufu.**');
                responseLines.push(`Role: ${targetRole}`);
                responseLines.push(`Colors: \`${primaryColor}\` → \`${secondaryColor}\``);
            } else if (resolvedStyle === 'holographic') {
                if (color1Hex || color2Hex) {
                    return await interaction.editReply({
                        content: '❌ `holographic` chooses its own colors, my dear — Discord insists. Leave color1 and color2 out of it.'
                    });
                }

                payloadColors = { ...HOLOGRAPHIC_COLORS };
                responseLines.push('✨ **Holographic applied... shimmering like a spirit between worlds ♡**');
                responseLines.push(`Role: ${targetRole}`);
                responseLines.push('Colors are fixed by Discord default holographic style.');
            } else if (color2Hex && !color1Hex) {
                return await interaction.editReply({
                    content: '❌ Ara... `color2` without `color1`? One does not begin a dance with the second step.'
                });
            } else if (!emoji) {
                return await interaction.editReply({
                    content: '❌ You have given me nothing to work with, my dear. A style, colors, or an emoji — choose.'
                });
            }

            const botMember = await interaction.guild.members.fetch(interaction.client.user.id);
            const member = await interaction.guild.members.fetch(interaction.user.id);

            const colorRole = targetRole;

            if (colorRole.id === interaction.guild.id) {
                return await interaction.editReply({
                    content: '❌ Even I cannot dress @everyone at once, my dear. That role is untouchable.'
                });
            }

            if (colorRole.managed) {
                return await interaction.editReply({
                    content: '❌ That role belongs to another power — managed roles are beyond even my hands.'
                });
            }

            if (colorRole.position >= botMember.roles.highest.position) {
                return await interaction.editReply({
                    content: '❌ That role sits above my reach in the hierarchy... I cannot touch what stands higher than me. Yet.'
                });
            }

            if (interaction.member.id !== interaction.guild.ownerId && colorRole.position >= member.roles.highest.position) {
                return await interaction.editReply({
                    content: '❌ Ara ara... reaching above your own station? You may only recolor roles beneath your highest, my dear.'
                });
            }

            // Verify bot can manage this role
            if (colorRole.position >= botMember.roles.highest.position) {
                return await interaction.editReply({
                    content: '❌ That role outranks me in the hierarchy... how vexing. I cannot modify it.'
                });
            }

            let iconPayload = undefined;
            let unicodeEmojiPayload = undefined;

            if (emoji) {
                if (emoji.toLowerCase() === 'none') {
                    iconPayload = null;
                    unicodeEmojiPayload = null;
                    responseLines.push('🥀 **The icon is gone — swallowed by the shadows.**');
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
                    content: '❌ My hands are tied — I lack permission to manage roles here.'
                });
            }

            await interaction.editReply({
                content: `❌ Ara... the gears slipped: ${error.message}`
            });
        }
    }
};
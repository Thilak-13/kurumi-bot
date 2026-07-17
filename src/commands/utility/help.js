const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder
} = require('discord.js');
const config = require('../../config/config');
const persona = require('../../lib/persona');

const ACCENT = config.bot.color || 0xB01E36;
const PREFIX = config.bot.prefix || 'zz';

// ── Category definitions ──────────────────────────────────────────────
// Each category has an emoji, label, description for the dropdown,
// and its list of commands with syntax and one-line descriptions.

const categories = [
    {
        id: 'admin',
        emoji: '🛡️',
        label: 'Admin',
        menuDescription: 'Bot owner & server admin commands',
        commands: [
            {
                name: 'access',
                type: 'Prefix',
                description: 'Grant or revoke command-level access for roles & members',
                syntax: [
                    `${PREFIX}access grant <command> role <role>`,
                    `${PREFIX}access grant <command> member <@user>`,
                    `${PREFIX}access revoke <command> role <role>`,
                    `${PREFIX}access revoke <command> member <@user>`,
                    `${PREFIX}access list <command>`,
                    `${PREFIX}access infos [command]`,
                    `${PREFIX}access clear <command>`,
                    `${PREFIX}access backup`
                ],
                permission: 'Bot Owner'
            },
            {
                name: 'forumlogger',
                type: 'Slash',
                description: 'Configure per-user moderation history threads in a forum channel',
                syntax: [
                    `/forumlogger setup <mod_log_channel> <forum_channel>`,
                    `/forumlogger toggle <enabled>`,
                    `/forumlogger status`
                ],
                permission: 'Manage Server'
            },
            {
                name: 'reload',
                type: 'Prefix',
                description: 'Hot-reload all bot commands without restarting',
                syntax: [
                    `${PREFIX}reload`
                ],
                permission: 'Bot Owner'
            },
            {
                name: 'roleedit',
                type: 'Slash',
                description: 'Apply solid, gradient, or holographic colour styles to a role',
                syntax: [
                    `/roleedit <role> [style: solid|gradient|holographic] [color1] [color2]`
                ],
                permission: 'Manage Roles'
            }
        ]
    },
    {
        id: 'moderation',
        emoji: '🔨',
        label: 'Moderation',
        menuDescription: 'Message management & ban tools',
        commands: [
            {
                name: 'purgeall',
                type: 'Slash',
                description: 'Purge messages in a channel with optional type filters and limits',
                syntax: [
                    `/purgeall [filter: all|image|video|link|file|embed|sound|poll|sticker] [amount] [logchannel]`
                ],
                permission: 'Manage Messages'
            },
            {
                name: 'stoppurge',
                type: 'Prefix',
                description: 'Stop an ongoing purge operation in the current channel',
                syntax: [
                    `${PREFIX}stoppurge`
                ],
                permission: 'Manage Messages'
            },
            {
                name: 'autopurge',
                type: 'Slash',
                description: 'Configure automatic message purging on a schedule with filters',
                syntax: [
                    `/autopurge setup`,
                    `/autopurge list`,
                    `/autopurge pause <channel>`,
                    `/autopurge resume <channel>`,
                    `/autopurge remove <channel>`
                ],
                permission: 'Manage Channels'
            },
            {
                name: 'groupban',
                type: 'Prefix',
                description: 'Ban multiple users from a CSV file, text, or pasted list of IDs',
                syntax: [
                    `${PREFIX}groupban  (attach a .csv or .txt file)`,
                    `${PREFIX}groupban <id1> <id2> <id3> ...`
                ],
                permission: 'Ban Members'
            }
        ]
    },
    {
        id: 'utility',
        emoji: '🔧',
        label: 'Utility',
        menuDescription: 'Info, tools & miscellaneous commands',
        commands: [
            {
                name: 'ping',
                type: 'Prefix',
                description: 'Check bot latency and WebSocket heartbeat',
                syntax: [
                    `${PREFIX}ping`
                ],
                permission: 'Everyone'
            },
            {
                name: 'userinfo',
                type: 'Prefix',
                description: 'Display detailed information about a user',
                syntax: [
                    `${PREFIX}userinfo [@user|userId]`
                ],
                permission: 'Everyone'
            },
            {
                name: 'dump',
                type: 'Prefix',
                description: 'Export guild members with advanced filters and formatting',
                syntax: [
                    `${PREFIX}dump [role]`,
                    `${PREFIX}dump alt <days>`,
                    `${PREFIX}dump %jan | %26`,
                    `${PREFIX}dump --has-role <role> --no-role <role>`,
                    `${PREFIX}dump --format "%u (%i)" --order joined_at`,
                    `${PREFIX}dump help`
                ],
                permission: 'Everyone'
            },
            {
                name: 'manga-chapter',
                type: 'Prefix',
                description: 'Manage manga chapter countdown timers in voice channels',
                syntax: [
                    `${PREFIX}manga-chapter setup <#voice-channel> <chapter>`,
                    `${PREFIX}manga-chapter status`,
                    `${PREFIX}manga-chapter cancel`,
                    `${PREFIX}manga-chapter update <chapter>`
                ],
                permission: 'Everyone'
            }
        ]
    }
];

// ── Embed builders ────────────────────────────────────────────────────

function buildOverviewEmbed() {
    const embed = new EmbedBuilder()
        .setTitle('🕰️  Kurumi\'s Command Repertoire')
        .setDescription('Ara ara... come to see what I can do? How *curious* of you.\nChoose a category below, and I shall show you my tricks... one hand of the clock at a time ♡\n\u200b')
        .setColor(ACCENT)
        .setFooter({ text: persona.footer() })
        .setTimestamp();

    for (const cat of categories) {
        const names = cat.commands.map(c => {
            const badge = c.type === 'Slash' ? '`/`' : `\`${PREFIX}\``;
            return `${badge} **${c.name}**`;
        });
        embed.addFields({
            name: `${cat.emoji}  ${cat.label}`,
            value: names.join('\n'),
            inline: true
        });
    }

    embed.addFields({ name: '\u200b', value: `*Prefix commands use \`${PREFIX}\` · Slash commands use \`/\`*`, inline: false });

    return embed;
}

function buildCategoryEmbed(cat) {
    const embed = new EmbedBuilder()
        .setTitle(`${cat.emoji}  ${cat.label} Commands`)
        .setDescription('Ufufu... watch closely, my dear.\n​')
        .setColor(ACCENT)
        .setFooter({ text: persona.footer() })
        .setTimestamp();

    for (const cmd of cat.commands) {
        const badge = cmd.type === 'Slash' ? '`Slash`' : '`Prefix`';
        const syntaxBlock = cmd.syntax.map(s => `\`${s}\``).join('\n');

        embed.addFields({
            name: `${badge}  ${cmd.name}`,
            value: `${cmd.description}\n**Permission:** ${cmd.permission}\n\n${syntaxBlock}`,
            inline: false
        });
    }

    return embed;
}

// ── Select menu builder ───────────────────────────────────────────────

function buildSelectMenu() {
    const options = [
        {
            label: '📖 Overview',
            description: 'Show all categories at a glance',
            value: 'overview',
            emoji: '📖'
        },
        ...categories.map(cat => ({
            label: `${cat.label}`,
            description: cat.menuDescription,
            value: cat.id,
            emoji: cat.emoji
        }))
    ];

    const menu = new StringSelectMenuBuilder()
        .setCustomId('help_category_select')
        .setPlaceholder('Choose, my dear... I am listening.')
        .addOptions(options);

    return new ActionRowBuilder().addComponents(menu);
}

// ── Slash command ─────────────────────────────────────────────────────

module.exports = {
    // Slash command registration
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show all commands and their syntax'),

    // Also register as prefix command
    name: 'help',
    description: 'Show all commands and their syntax',

    // Unified execute — works for both slash interactions and prefix messages
    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.options;

        const embed = buildOverviewEmbed();
        const row = buildSelectMenu();

        let response;
        if (isSlash) {
            response = await interactionOrMessage.reply({ embeds: [embed], components: [row], fetchReply: true });
        } else {
            response = await interactionOrMessage.reply({ embeds: [embed], components: [row] });
        }

        // Collector for dropdown interactions
        const collector = response.createMessageComponentCollector({
            filter: i => i.customId === 'help_category_select',
            time: 120000 // 2 minutes
        });

        collector.on('collect', async i => {
            const selected = i.values[0];

            if (selected === 'overview') {
                await i.update({ embeds: [buildOverviewEmbed()], components: [buildSelectMenu()] });
                return;
            }

            const cat = categories.find(c => c.id === selected);
            if (cat) {
                await i.update({ embeds: [buildCategoryEmbed(cat)], components: [buildSelectMenu()] });
            }
        });

        collector.on('end', async () => {
            // Disable the menu after timeout
            try {
                const disabledMenu = StringSelectMenuBuilder.from(row.components[0]).setDisabled(true);
                const disabledRow = new ActionRowBuilder().addComponents(disabledMenu);
                await response.edit({ components: [disabledRow] });
            } catch {
                // Message may have been deleted
            }
        });
    }
};

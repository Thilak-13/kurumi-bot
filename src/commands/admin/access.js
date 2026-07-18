const config = require('../../config/config');
const { EmbedBuilder } = require('discord.js');
const { createErrorEmbed, createInfoEmbed, createSuccessEmbed } = require('../../lib/embeds');
const persona = require('../../lib/persona');

function joinRest(tokens, startIndex) {
    return tokens.slice(startIndex).join(' ').trim();
}

function resolveRole(guild, raw) {
    if (!raw) return null;

    const mentionMatch = raw.match(/^<@&(\d+)>$/);
    const rawId = mentionMatch ? mentionMatch[1] : raw;

    return guild.roles.cache.get(rawId)
        || guild.roles.cache.find(role => role.name.toLowerCase() === raw.toLowerCase());
}

async function resolveMember(guild, raw) {
    if (!raw) return null;

    const mentionMatch = raw.match(/^<@!?(\d+)>$/);
    const rawId = mentionMatch ? mentionMatch[1] : raw;

    // Check cache first
    const cached = guild.members.cache.get(rawId);
    if (cached) return cached;

    // Fetch from API if ID is valid
    if (/^\d{17,20}$/.test(rawId)) {
        return guild.members.fetch(rawId).catch(() => null);
    }

    return null;
}

function formatList(entry, guild) {
    const roles = (entry.roles || [])
        .map(id => guild.roles.cache.get(id) || `<@&${id}> (${id})`)
        .map(role => typeof role === 'string' ? role : `${role}`);

    const members = (entry.members || [])
        .map(id => guild.members.cache.get(id) || `<@${id}> (${id})`)
        .map(member => typeof member === 'string' ? member : `${member}`);

    return [
        `Roles [${(entry.roles || []).length}]: ${roles.length ? roles.join(', ') : 'None'}`,
        `Members [${(entry.members || []).length}]: ${members.length ? members.join(', ') : 'None'}`,
        `Last updated: ${entry.updatedAt || 'Unknown'}`
    ].join('\n');
}

function formatCommandEntry(commandName, entry, guild) {
    const roles = (entry?.roles || [])
        .map(id => guild.roles.cache.get(id) || `<@&${id}> (${id})`)
        .map(role => typeof role === 'string' ? role : `${role}`);

    const members = (entry?.members || [])
        .map(id => guild.members.cache.get(id) || `<@${id}> (${id})`)
        .map(member => typeof member === 'string' ? member : `${member}`);

    return [
        `**${commandName}**`,
        `Roles [${(entry?.roles || []).length}]: ${roles.length ? roles.join(', ') : 'None'}`,
        `Members [${(entry?.members || []).length}]: ${members.length ? members.join(', ') : 'None'}`,
        `Last updated: ${entry?.updatedAt || 'Unknown'}`
    ].join('\n');
}

function buildAllAccessReport(access, guild, commandNames) {
    const lines = ['**Command Access Infos**', ''];

    for (const commandName of commandNames) {
        lines.push(formatCommandEntry(commandName, access.list(guild.id, commandName), guild));
        lines.push('');
    }

    return lines.join('\n').trim();
}

function createHelpEmbed(prefix) {
    return new EmbedBuilder()
        .setTitle('🕰️ Access Command Help')
        .setDescription(buildHelp(prefix))
        .setColor(persona.colors.crimson)
        .setFooter({ text: persona.footer() });
}

async function sendReport(message, report, title) {
    if (report.length <= 4000) {
        const embed = createInfoEmbed(title, report);
        return message.reply({ embeds: [embed] }).catch(() => {});
    }

    const { AttachmentBuilder } = require('discord.js');
    const file = new AttachmentBuilder(Buffer.from(report, 'utf8'), {
        name: 'command-access-infos.txt'
    });

    const embed = createInfoEmbed(
        title,
        'My, what a long ledger... too long for chat, so I have folded it into the little file below.'
    );

    return message.reply({
        embeds: [embed],
        files: [file]
    }).catch(() => {});
}

function buildHelp(prefix) {
    const p = prefix || 'zz';
    return [
        '**Access Command Help**',
        '',
        `Usage: ${p}access <grant|revoke|list|infos|clear|backup|help> ...`,
        '',
        '**Grant / Revoke**',
        `${p}access grant <command> role <role>`,
        `${p}access grant <command> member <member>`,
        `${p}access revoke <command> role <role>`,
        `${p}access revoke <command> member <member>`,
        '',
        '**List / Clear**',
        `${p}access list <command>`,
        `${p}access infos [command]`,
        `${p}access clear <command>`,
        '',
        '**Backup**',
        `${p}access backup`,
        'Creates a fresh backup snapshot of the access registry.',
        ''
    ].join('\n');
}

module.exports = {
    name: 'access',
    description: 'Grant or revoke command access for roles or members (Usage: zzaccess ...)',

    async execute(message, args) {
        if (!message.guild) {
            const embed = createErrorEmbed('Server-Only Command', persona.serverOnly());
            return message.reply({ embeds: [embed] }).catch(() => {});
        }

        if (message.author.id !== config.ownerId) {
            const embed = createErrorEmbed('Owner-Only Command', 'Ara ara... this lever moves the whole clock, my dear. Only *my* master may pull it.');
            return message.reply({ embeds: [embed] }).catch(() => {});
        }

        const access = message.client.accessControl;
        if (!access) {
            const embed = createErrorEmbed('System Error', 'How odd... my ledger of permissions is missing. I cannot work like this.');
            return message.reply({ embeds: [embed] }).catch(() => {});
        }

        const action = (args[0] || '').toLowerCase();
        const prefix = config.bot.prefix || 'zz';

        if (!action || action === 'help' || action === '--help' || action === '-h') {
            const embed = createHelpEmbed(prefix);
            return message.reply({ embeds: [embed] }).catch(() => {});
        }



        if (action === 'info' || action === 'infos') {
            const commandName = (args[1] || '').toLowerCase();
            const report = commandName
                ? formatCommandEntry(commandName, access.list(message.guild.id, commandName), message.guild)
                : (() => {
                    const commandNames = Array.from(message.client.commands.keys()).sort((a, b) => a.localeCompare(b));
                    return buildAllAccessReport(access, message.guild, commandNames);
                })();
            
            return sendReport(message, report, commandName ? `Access info for ${commandName}` : 'Access infos for all commands');
        }

        if (action === 'backup') {
            access.save();
            const embed = createSuccessEmbed('Registry Saved', 'Ufufu... every name in my ledger, copied twice and tucked safely away.');
            return message.reply({ embeds: [embed] }).catch(() => {});
        }

        if (action === 'list') {
            const commandName = (args[1] || '').toLowerCase();
            if (!commandName) {
                const embed = createErrorEmbed('Missing Argument', `Usage: \`${prefix}access list <command>\``);
                return message.reply({ embeds: [embed] }).catch(() => {});
            }

            const entry = access.list(message.guild.id, commandName);
            if (!entry) {
                const embed = createInfoEmbed('No Entries Found', `No access entries found for **${commandName}**.`);
                return message.reply({ embeds: [embed] }).catch(() => {});
            }

            const embed = new EmbedBuilder()
                .setTitle(`Access for ${commandName}`)
                .setDescription(formatList(entry, message.guild))
                .setColor(persona.colors.crimson)
                .setFooter({ text: persona.footer() });
            return message.reply({ embeds: [embed] }).catch(() => {});
        }

        if (action === 'clear') {
            const commandName = (args[1] || '').toLowerCase();
            if (!commandName) {
                const embed = createErrorEmbed('Missing Argument', `Usage: \`${prefix}access clear <command>\``);
                return message.reply({ embeds: [embed] }).catch(() => {});
            }

            const removed = access.clear(message.guild.id, commandName);
            if (!removed) {
                const embed = createInfoEmbed('No Entry', `No access entry existed for **${commandName}**.`);
                return message.reply({ embeds: [embed] }).catch(() => {});
            }

            const embed = createSuccessEmbed('Entry Cleared', `Access entry for **${commandName}** has been cleared.`);
            return message.reply({ embeds: [embed] }).catch(() => {});
        }

        if (action !== 'grant' && action !== 'revoke') {
            const embed = createErrorEmbed('Unknown Action', 'Use: grant, revoke, list, infos, clear, backup, or help.');
            return message.reply({ embeds: [embed] }).catch(() => {});
        }

        const commandName = (args[1] || '').toLowerCase();
        const targetType = (args[2] || '').toLowerCase();
        const targetValue = joinRest(args, 3);

        if (!commandName || !targetType || !targetValue) {
            const embed = createErrorEmbed('Missing Arguments', `Usage: \`${prefix}access ${action} <command> role|member <target>\``);
            return message.reply({ embeds: [embed] }).catch(() => {});
        }

        const command = message.client.commands.get(commandName);
        if (!command) {
            const embed = createErrorEmbed('Command Not Found', `Unknown command: **${commandName}**`);
            return message.reply({ embeds: [embed] }).catch(() => {});
        }

        if (targetType === 'role') {
            const role = resolveRole(message.guild, targetValue);
            if (!role) {
                const embed = createErrorEmbed('Role Not Found', `Could not find role: **${targetValue}**`);
                return message.reply({ embeds: [embed] }).catch(() => {});
            }

            const changed = action === 'grant'
                ? access.grant(message.guild.id, commandName, 'role', role.id)
                : access.revoke(message.guild.id, commandName, 'role', role.id);

            if (!changed) {
                const embed = createInfoEmbed('No Change', `No change was made for **${commandName}**.`);
                return message.reply({ embeds: [embed] }).catch(() => {});
            }

            const actionText = action === 'grant' ? 'Granted' : 'Revoked';
            const embed = createSuccessEmbed(`Access ${actionText}`, `${actionText} access to **${commandName}** for ${role}.`);
            return message.reply({ embeds: [embed] }).catch(() => {});
        }

        if (targetType === 'member' || targetType === 'user') {
            const member = await resolveMember(message.guild, targetValue);
            if (!member) {
                const embed = createErrorEmbed('Member Not Found', `Could not find member: **${targetValue}**\n\nUse @mention or user ID.`);
                return message.reply({ embeds: [embed] }).catch(() => {});
            }

            const changed = action === 'grant'
                ? access.grant(message.guild.id, commandName, 'member', member.id)
                : access.revoke(message.guild.id, commandName, 'member', member.id);

            if (!changed) {
                const embed = createInfoEmbed('No Change', `No change was made for **${commandName}**.`);
                return message.reply({ embeds: [embed] }).catch(() => {});
            }

            const actionText = action === 'grant' ? 'Granted' : 'Revoked';
            const embed = createSuccessEmbed(`Access ${actionText}`, `${actionText} access to **${commandName}** for ${member}.`);
            return message.reply({ embeds: [embed] }).catch(() => {});
        }

        const embed = createErrorEmbed('Invalid Target Type', 'Target type must be `role` or `member`.');
        return message.reply({ embeds: [embed] }).catch(() => {});
    }
};
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config/config');
const { createErrorEmbed, createInfoEmbed, createSuccessEmbed } = require('../../lib/embeds');

const DEFAULT_FORMAT = '%u (%i)';
const DEFAULT_ORDER = 'name';
const DEFAULT_SEPARATOR = '\n';
const MAX_DISCORD_MESSAGE = 2000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_TOKEN_MAP = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11
};

function parseMonthToken(token) {
    if (typeof token !== 'string' || !token.startsWith('%')) return null;
    const monthKey = token.slice(1).toLowerCase();
    if (!(monthKey in MONTH_TOKEN_MAP)) return null;
    return MONTH_TOKEN_MAP[monthKey];
}

function parseYearToken(token) {
    if (typeof token !== 'string' || !token.startsWith('%')) return null;

    const raw = token.slice(1);
    if (!/^\d{2,4}$/.test(raw)) return null;

    if (raw.length === 4) {
        return Number.parseInt(raw, 10);
    }

    // %26 -> 2026 (joined year filter shorthand)
    return 2000 + Number.parseInt(raw, 10);
}

function isFlag(token) {
    return typeof token === 'string' && token.startsWith('-');
}

function decodeEscapes(value) {
    if (!value) return value;
    return value
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r');
}

function normalizeDateToken(token) {
    const lower = token.toLowerCase();
    if (lower === '%c') {
        return 'locale-date-time';
    }
    if (lower === '%x') {
        return 'locale-date';
    }
    if (lower === '%x %x') {
        return 'locale-date locale-date-time';
    }
    return token;
}

function formatDate(date, fmt) {
    if (!date) return 'N/A';

    const map = {
        '%Y': String(date.getFullYear()),
        '%m': String(date.getMonth() + 1).padStart(2, '0'),
        '%d': String(date.getDate()).padStart(2, '0'),
        '%H': String(date.getHours()).padStart(2, '0'),
        '%M': String(date.getMinutes()).padStart(2, '0'),
        '%S': String(date.getSeconds()).padStart(2, '0')
    };

    const normalized = normalizeDateToken(fmt || '%Y-%m-%d %H:%M:%S');

    if (normalized.includes('locale-date-time')) {
        return date.toLocaleString();
    }

    if (normalized.includes('locale-date')) {
        return date.toLocaleDateString();
    }

    return normalized.replace(/%[YmdHMS]/g, token => map[token] || token);
}

function memberToLine(member, format, dateFormat) {
    const user = member.user;
    const fullName = user.tag || user.username;
    const displayName = member.displayName || user.username;
    const created = formatDate(user.createdAt, dateFormat);
    const joined = formatDate(member.joinedAt, dateFormat);

    return format
        .replace(/%u/g, fullName)
        .replace(/%n/g, displayName)
        .replace(/%i/g, user.id)
        .replace(/%c/g, created)
        .replace(/%j/g, joined);
}

function toCsvValue(value) {
    const text = String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
}

function buildCsv(members, dateFormat) {
    const header = ['full_name', 'display_name', 'id', 'created_at', 'joined_at'];
    const rows = members.map((member) => {
        const user = member.user;
        return [
            user.tag || user.username,
            member.displayName || user.username,
            user.id,
            formatDate(user.createdAt, dateFormat),
            formatDate(member.joinedAt, dateFormat)
        ];
    });

    return [header, ...rows]
        .map(row => row.map(toCsvValue).join(','))
        .join('\n');
}

function splitIntoChunks(lines, separator) {
    const chunks = [];
    let current = '';

    for (const line of lines) {
        const candidate = current ? `${current}${separator}${line}` : line;

        if (candidate.length > MAX_DISCORD_MESSAGE) {
            if (current) {
                chunks.push(current);
                current = line;
                continue;
            }

            let remaining = line;
            while (remaining.length > MAX_DISCORD_MESSAGE) {
                chunks.push(remaining.slice(0, MAX_DISCORD_MESSAGE));
                remaining = remaining.slice(MAX_DISCORD_MESSAGE);
            }
            current = remaining;
            continue;
        }

        current = candidate;
    }

    if (current) chunks.push(current);
    return chunks;
}

function collectFlagValues(tokens, startIndex) {
    const values = [];
    let index = startIndex;

    while (index < tokens.length && !isFlag(tokens[index])) {
        values.push(tokens[index]);
        index++;
    }

    return { values, nextIndex: index };
}

function parseDumpArgs(args) {
    const options = {
        format: DEFAULT_FORMAT,
        desc: false,
        hasRoles: [],
        hasAllRoles: [],
        exceptRoles: [],
        noRoles: false,
        order: DEFAULT_ORDER,
        limit: null,
        enumerate: false,
        separator: DEFAULT_SEPARATOR,
        dateFormat: '%Y-%m-%d %H:%M:%S',
        legacyRoleFilter: null,
        altDays: null,
        joinedMonth: null,
        joinedYear: null
    };

    const errors = [];

    let index = 0;
    if (args[0] && !isFlag(args[0])) {
        const firstMonth = parseMonthToken(args[0]);
        const firstYear = parseYearToken(args[0]);

        if (firstMonth !== null) {
            options.joinedMonth = firstMonth;
            index = 1;
        } else if (firstYear !== null) {
            options.joinedYear = firstYear;
            index = 1;
        } else if (args[0].toLowerCase() === 'alt') {
            const value = args[1];
            const parsed = Number.parseInt(value, 10);
            if (!value || !Number.isFinite(parsed) || parsed < 0) {
                errors.push('alt requires a non-negative number of days (example: zzdump alt 7)');
            } else {
                options.altDays = parsed;
            }
            index = 2;
        } else {
            options.legacyRoleFilter = args[0];
            index = 1;
        }
    }

    while (index < args.length) {
        const token = args[index];
        const monthFromToken = parseMonthToken(token);
        const yearFromToken = parseYearToken(token);
        if (monthFromToken !== null) {
            options.joinedMonth = monthFromToken;
            index++;
            continue;
        }
        if (yearFromToken !== null) {
            options.joinedYear = yearFromToken;
            index++;
            continue;
        }

        switch (token) {
            case '--format':
            case '-f': {
                const { values, nextIndex } = collectFlagValues(args, index + 1);
                if (!values.length) {
                    errors.push(`${token} requires a format string`);
                } else {
                    options.format = values.join(' ');
                }
                index = nextIndex;
                break;
            }

            case '--desc':
            case '-d':
                options.desc = true;
                index++;
                break;

            case '--has-roles':
            case '-r': {
                const { values, nextIndex } = collectFlagValues(args, index + 1);
                if (!values.length) {
                    errors.push(`${token} requires at least one role`);
                } else {
                    options.hasRoles.push(...values);
                }
                index = nextIndex;
                break;
            }

            case '--has-all-roles': {
                const { values, nextIndex } = collectFlagValues(args, index + 1);
                if (!values.length) {
                    errors.push(`${token} requires at least one role`);
                } else {
                    options.hasAllRoles.push(...values);
                }
                index = nextIndex;
                break;
            }

            case '--except-roles':
            case '-x': {
                const { values, nextIndex } = collectFlagValues(args, index + 1);
                if (!values.length) {
                    errors.push(`${token} requires at least one role`);
                } else {
                    options.exceptRoles.push(...values);
                }
                index = nextIndex;
                break;
            }

            case '--no-roles':
                options.noRoles = true;
                index++;
                break;

            case '--order':
            case '-o': {
                const value = args[index + 1];
                if (!value || isFlag(value)) {
                    errors.push(`${token} requires one of: name, id, created_at, joined_at, nick`);
                    index += 1;
                } else {
                    options.order = value.toLowerCase();
                    index += 2;
                }
                break;
            }

            case '--limit':
            case '-l': {
                const value = args[index + 1];
                if (!value || isFlag(value)) {
                    errors.push(`${token} requires a number`);
                    index += 1;
                } else {
                    const parsed = Number.parseInt(value, 10);
                    if (!Number.isFinite(parsed) || parsed <= 0) {
                        errors.push(`${token} must be a positive number`);
                    } else {
                        options.limit = parsed;
                    }
                    index += 2;
                }
                break;
            }

            case '--enumerate':
            case '-e':
                options.enumerate = true;
                index++;
                break;

            case '--separator':
            case '-s': {
                const { values, nextIndex } = collectFlagValues(args, index + 1);
                if (!values.length) {
                    errors.push(`${token} requires a separator value`);
                } else {
                    options.separator = decodeEscapes(values.join(' '));
                }
                index = nextIndex;
                break;
            }

            case '--dateformat': {
                const { values, nextIndex } = collectFlagValues(args, index + 1);
                if (!values.length) {
                    errors.push(`${token} requires a date format`);
                } else {
                    options.dateFormat = values.join(' ');
                }
                index = nextIndex;
                break;
            }

            case '--alt': {
                const value = args[index + 1];
                if (!value || isFlag(value)) {
                    errors.push(`${token} requires a non-negative number of days`);
                    index += 1;
                } else {
                    const parsed = Number.parseInt(value, 10);
                    if (!Number.isFinite(parsed) || parsed < 0) {
                        errors.push(`${token} must be a non-negative number`);
                    } else {
                        options.altDays = parsed;
                    }
                    index += 2;
                }
                break;
            }

            default:
                errors.push(`Unknown flag or value: ${token}`);
                index++;
                break;
        }
    }

    return { options, errors };
}

function resolveRole(guild, raw) {
    if (!raw) return null;

    const mentionMatch = raw.match(/^<@&(\d+)>$/);
    const rawId = mentionMatch ? mentionMatch[1] : raw;

    return guild.roles.cache.get(rawId)
        || guild.roles.cache.find(role => role.name.toLowerCase() === raw.toLowerCase());
}

function sortMembers(members, order, desc) {
    const sorted = [...members];

    const getValue = (member) => {
        switch (order) {
            case 'id':
                return member.user.id;
            case 'created_at':
                return member.user.createdTimestamp || 0;
            case 'joined_at':
                return member.joinedTimestamp || 0;
            case 'nick':
                return (member.nickname || '').toLowerCase();
            case 'name':
            default:
                return (member.user.username || '').toLowerCase();
        }
    };

    sorted.sort((a, b) => {
        const av = getValue(a);
        const bv = getValue(b);

        if (typeof av === 'number' && typeof bv === 'number') {
            return av - bv;
        }

        return String(av).localeCompare(String(bv));
    });

    if (desc) {
        sorted.reverse();
    }

    return sorted;
}

function buildDumpHelp(prefix) {
    const p = prefix || 'zz';
    return [
        '**Dump Command Help**',
        '',
        `Usage: ${p}dump [role|alt <days>|%mon|%yy|%yyyy] [flags]`,
        '',
        '**Flags**',
        '--format, -f <format>            Set output format (default: %u (%i))',
        '--desc, -d                       Sort descending',
        '--has-roles, -r <roles...>       Members with any of these roles',
        '--has-all-roles <roles...>       Members with all of these roles',
        '--except-roles, -x <roles...>    Members without any of these roles',
        '--no-roles                       Members without roles',
        '--order, -o <by>                 Sort by: name, id, created_at, joined_at, nick',
        '--limit, -l <number>             Limit number of members',
        '--enumerate, -e                  Prefix each line with index',
        '--separator, -s <sep>            Output separator (default: newline)',
        '--dateformat <fmt>               Date format for %c and %j',
        '--alt <days>                     Joined within X days after account creation',
        '',
        '**Special Filters**',
        'alt <days>                       Shorthand for --alt (example: dump alt 7)',
        '%jan..%dec                       Joined month filter (joinedAt month)',
        '%26 or %2026                     Joined year filter (joinedAt year)',
        '',
        '**Format Variables**',
        '%u = full user tag/name',
        '%n = display name',
        '%i = user id',
        '%c = account creation date',
        '%j = server join date',
        '',
        '**Output Flow**',
        'After filtering, bot shows matched member count and asks for output type:',
        'message | text | csv',
        '',
        '**Examples**',
        `${p}dump help`,
        `${p}dump %feb %26`,
        `${p}dump alt 7 %feb %26 --limit 25 -o joined_at -d`,
        `${p}dump -r Moderator --format %n %i --dateformat %Y-%m-%d`,
        `${p}dump --no-roles -o id -l 10`
    ].join('\n');
}

module.exports = {
    name: 'dump',
    description: 'Dump guild members with filters (Usage: zzdump [role|alt <days>|%jan|%26] [flags])',

    async execute(message, args) {
        if (!message.guild) {
            const embed = createErrorEmbed('Server-Only Command', 'This command can only be used in a server.');
            return message.reply({ embeds: [embed] }).catch(() => {});
        }

        const firstArg = (args?.[0] || '').toLowerCase();
        if (firstArg === 'help' || firstArg === 'info' || firstArg === 'infos' || firstArg === '--help' || firstArg === '-h') {
            const embed = createInfoEmbed('Dump Command Help', buildDumpHelp(config.bot?.prefix || 'zz'));
            return message.reply({ embeds: [embed] }).catch(() => {});
        }

        const { options, errors } = parseDumpArgs(args || []);

        if (errors.length) {
            const embed = createErrorEmbed('Argument Error', errors[0]);
            return message.reply({ embeds: [embed] }).catch(() => {});
        }

        const validOrders = new Set(['name', 'id', 'created_at', 'joined_at', 'nick']);
        if (!validOrders.has(options.order)) {
            const embed = createErrorEmbed('Invalid Order', '--order/-o must be one of: name, id, created_at, joined_at, nick');
            return message.reply({ embeds: [embed] }).catch(() => {});
        }

        // Send initial processing indicator to avoid timeout perception
        let processingMsg = null;
        try {
            const embed = createInfoEmbed('Processing Dump', 'Fetching members from server...');
            processingMsg = await message.reply({ embeds: [embed] });
        } catch (e) {
            console.error('Failed to send processing message:', e);
        }

        // Start fetch and role resolution in parallel
        const fetchPromise = message.guild.members.fetch().catch(() => null);
        
        const hasRolesRaw = [...options.hasRoles];
        if (options.legacyRoleFilter) {
            hasRolesRaw.push(options.legacyRoleFilter);
        }

        // Parallelize role resolution with fetch
        const hasRoles = hasRolesRaw
            .map(raw => ({ raw, role: resolveRole(message.guild, raw) }))
            .filter(item => item.role);

        const hasAllRoles = options.hasAllRoles
            .map(raw => ({ raw, role: resolveRole(message.guild, raw) }))
            .filter(item => item.role);

        const exceptRoles = options.exceptRoles
            .map(raw => ({ raw, role: resolveRole(message.guild, raw) }))
            .filter(item => item.role);

        // Now wait for fetch to complete
        const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 25000)); // 25 second timeout
        await Promise.race([fetchPromise, timeoutPromise]);

        let members = Array.from(message.guild.members.cache.values());

        const unresolvedHasRoles = hasRolesRaw.filter(raw => !hasRoles.find(item => item.raw === raw));
        const unresolvedHasAllRoles = options.hasAllRoles.filter(raw => !hasAllRoles.find(item => item.raw === raw));
        const unresolvedExceptRoles = options.exceptRoles.filter(raw => !exceptRoles.find(item => item.raw === raw));

        if (unresolvedHasRoles.length || unresolvedHasAllRoles.length || unresolvedExceptRoles.length) {
            const badRole = unresolvedHasRoles[0] || unresolvedHasAllRoles[0] || unresolvedExceptRoles[0];
            const embed = createErrorEmbed('Role Not Found', `Could not find role: **${badRole}**`);
            return message.reply({ embeds: [embed] }).catch(() => {});
        }

        if (options.noRoles) {
            members = members.filter(member => member.roles.cache.filter(r => r.id !== message.guild.id).size === 0);
        }

        if (hasRoles.length) {
            const roleIds = hasRoles.map(item => item.role.id);
            members = members.filter(member => roleIds.some(roleId => member.roles.cache.has(roleId)));
        }

        if (hasAllRoles.length) {
            const roleIds = hasAllRoles.map(item => item.role.id);
            members = members.filter(member => roleIds.every(roleId => member.roles.cache.has(roleId)));
        }

        if (exceptRoles.length) {
            const roleIds = exceptRoles.map(item => item.role.id);
            members = members.filter(member => !roleIds.some(roleId => member.roles.cache.has(roleId)));
        }

        if (options.altDays !== null) {
            members = members.filter(member => {
                const created = member.user.createdTimestamp;
                const joined = member.joinedTimestamp;

                if (!created || !joined || joined < created) {
                    return false;
                }

                return (joined - created) <= (options.altDays * DAY_MS);
            });
        }

        if (options.joinedMonth !== null) {
            members = members.filter(member => {
                if (!member.joinedAt) return false;
                return member.joinedAt.getMonth() === options.joinedMonth;
            });
        }

        if (options.joinedYear !== null) {
            members = members.filter(member => {
                if (!member.joinedAt) return false;
                return member.joinedAt.getFullYear() === options.joinedYear;
            });
        }

        members = sortMembers(members, options.order, options.desc);

        if (options.limit) {
            members = members.slice(0, options.limit);
        }

        if (!members.length) {
            if (processingMsg) {
                try { await processingMsg.delete().catch(() => {}); } catch (e) {}
            }
            const embed = createInfoEmbed('No Members Found', 'No members matched your filter criteria.');
            return message.reply({ embeds: [embed] }).catch(() => {});
        }

        const memberCount = members.length;
        if (processingMsg) {
            try { 
                const embed = createInfoEmbed(
                    'Members Matched',
                    `Found ${memberCount} member${memberCount === 1 ? '' : 's'}. Reply with \`message\`, \`text\`, or \`csv\` within 30 seconds to choose the output format.`
                );
                await processingMsg.edit({ embeds: [embed], content: '' }).catch(() => {}); 
            } catch (e) {}
        } else {
            const embed = createInfoEmbed(
                'Members Matched',
                `Found ${memberCount} member${memberCount === 1 ? '' : 's'}. Reply with \`message\`, \`text\`, or \`csv\` within 30 seconds to choose the output format.`
            );
            await message.reply({ embeds: [embed] }).catch(() => {});
        }

        const collected = await message.channel.awaitMessages({
            filter: (m) => m.author.id === message.author.id && m.channel.id === message.channel.id,
            max: 1,
            time: 30000
        }).catch(() => null);

        const rawChoice = collected?.first()?.content?.trim()?.toLowerCase();
        if (!rawChoice) {
            if (processingMsg) {
                const embed = createInfoEmbed('Dump Cancelled', 'No output format was selected in time.');
                try { await processingMsg.edit({ embeds: [embed], content: '' }).catch(() => {}); } catch (e) {}
            }
            return;
        }

        const outputChoice = (() => {
            if (rawChoice === 'message' || rawChoice === 'msg') return 'message';
            if (rawChoice === 'text' || rawChoice === 'txt') return 'text';
            if (rawChoice === 'csv') return 'csv';
            return null;
        })();

        if (!outputChoice) {
            if (processingMsg) {
                const embed = createErrorEmbed('Invalid Choice', 'Please use one of: `message`, `text`, or `csv`');
                try { await processingMsg.edit({ embeds: [embed], content: '' }).catch(() => {}); } catch (e) {}
            }
            return;
        }

        const lines = members.map((member, index) => {
            const line = memberToLine(member, options.format, options.dateFormat);
            return options.enumerate ? `${index + 1}. ${line}` : line;
        });

        if (outputChoice === 'text') {
            const content = lines.join(options.separator || DEFAULT_SEPARATOR);
            const file = new AttachmentBuilder(Buffer.from(content, 'utf8'), {
                name: 'member-dump.txt'
            });

            if (processingMsg) {
                try { 
                    const embed = createSuccessEmbed('Text Dump Ready', `Sending text dump for ${memberCount} member${memberCount === 1 ? '' : 's'}.`);
                    await processingMsg.edit({
                        embeds: [embed],
                        content: '',
                        files: [file]
                    }).catch(() => {}); 
                } catch (e) {
                    const embed = createSuccessEmbed('Text Dump Ready', `Sending text dump for ${memberCount} member${memberCount === 1 ? '' : 's'}.`);
                    await message.reply({
                        embeds: [embed],
                        files: [file]
                    }).catch(() => {});
                }
            }
            return null;
        }

        if (outputChoice === 'csv') {
            const csvContent = buildCsv(members, options.dateFormat);
            const file = new AttachmentBuilder(Buffer.from(csvContent, 'utf8'), {
                name: 'member-dump.csv'
            });

            if (processingMsg) {
                try { 
                    const embed = createSuccessEmbed('CSV Dump Ready', `Sending CSV dump for ${memberCount} member${memberCount === 1 ? '' : 's'}.`);
                    await processingMsg.edit({
                        embeds: [embed],
                        content: '',
                        files: [file]
                    }).catch(() => {}); 
                } catch (e) {
                    const embed = createSuccessEmbed('CSV Dump Ready', `Sending CSV dump for ${memberCount} member${memberCount === 1 ? '' : 's'}.`);
                    await message.reply({
                        embeds: [embed],
                        files: [file]
                    }).catch(() => {});
                }
            }
            return null;
        }

        const chunks = splitIntoChunks(lines, options.separator || DEFAULT_SEPARATOR);

        if (processingMsg) {
            try { 
                const embed = createSuccessEmbed('Message Dump', `Sending message dump for ${memberCount} member${memberCount === 1 ? '' : 's'}.`);
                await processingMsg.edit({ embeds: [embed], content: '' }).catch(() => {}); 
            } catch (e) {
                const embed = createSuccessEmbed('Message Dump', `Sending message dump for ${memberCount} member${memberCount === 1 ? '' : 's'}.`);
                await message.reply({ embeds: [embed] }).catch(() => {});
            }
        }

        for (const [index, chunk] of chunks.entries()) {
            const embed = createInfoEmbed(`Dump Results (${index + 1}/${chunks.length})`, chunk);
            await message.reply({ embeds: [embed] }).catch(() => {});
        }

        return null;
    }
};

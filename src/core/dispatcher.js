const { EmbedBuilder } = require('discord.js');
const config = require('../config/config');

/**
 * Unified command dispatch pipeline for slash and prefix commands.
 * Reply semantics are preserved exactly from the former event handlers:
 * slash denials get an ephemeral embed, prefix denials stay silent.
 */

function memberRoleIds(member) {
    return Array.from(member?.roles?.cache?.keys?.() || []);
}

function canUse(client, guildId, commandName, userId, roleIds) {
    return client.accessControl?.canUse(guildId, commandName, userId, roleIds)
        || userId === config.ownerId;
}

/**
 * Handle a slash-command (chat input) interaction.
 */
async function dispatchSlashCommand(interaction) {
    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
        console.warn(`⚠️ No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        const roleIds = memberRoleIds(interaction.member);
        const allowed = canUse(interaction.client, interaction.guildId, interaction.commandName, interaction.user.id, roleIds);

        if (!allowed) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Permission Denied')
                .setDescription('You do not have the required permissions to use this command.')
                .setColor('#e74c3c');
            return interaction.reply({ embeds: [embed], flags: 64 });
        }

        console.log(`[SLASH CMD] ${interaction.user.tag} used /${interaction.commandName} in ${interaction.guild?.name || 'DM'}`);

        await command.execute(interaction);
    } catch (error) {
        console.error(`❌ Error executing /${interaction.commandName}:`, error);

        const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Command Error')
            .setDescription('An error occurred while executing this command.')
            .setColor('#e74c3c');

        const errorMessage = { embeds: [errorEmbed], flags: 64 };

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage).catch(console.error);
        } else {
            await interaction.reply(errorMessage).catch(console.error);
        }
    }
}

/**
 * Handle a prefix (legacy "zz") command message. Non-command messages are
 * ignored silently, as are permission denials — identical to the old handler.
 */
async function dispatchPrefixCommand(message) {
    const content = typeof message.content === 'string' ? message.content : '';
    const prefix = config.bot.prefix || 'zz';
    const mentionPrefix = `<@${message.client.user.id}>`;
    const mentionNickPrefix = `<@!${message.client.user.id}>`;

    if (message.author.bot) {
        return;
    }

    let usedPrefix = null;
    if (content.startsWith(prefix)) usedPrefix = prefix;
    if (content.startsWith(mentionPrefix)) usedPrefix = mentionPrefix;
    if (content.startsWith(mentionNickPrefix)) usedPrefix = mentionNickPrefix;

    // Ignore non-command messages.
    if (!usedPrefix) return;

    const rawInput = content.slice(usedPrefix.length).trim();
    if (!rawInput) {
        return;
    }

    const args = rawInput.split(/ +/);
    const commandName = (args.shift() || '').toLowerCase();
    const normalizedCommandName = commandName.replace(/-/g, '');

    const command = message.client.commands.get(commandName) || message.client.commands.get(normalizedCommandName);

    if (!command) {
        return;
    }

    const roleIds = memberRoleIds(message.member);
    if (!canUse(message.client, message.guildId, command.name, message.author.id, roleIds)) {
        return;
    }

    try {
        await command.execute(message, args);
    } catch (error) {
        console.error(`Error executing ${commandName}:`, error);
        message.reply('❌ Command failed.').catch(() => {});
    }
}

module.exports = { dispatchSlashCommand, dispatchPrefixCommand };

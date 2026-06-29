const config = require('../config/config');

module.exports = {
    name: 'messageCreate',
    async execute(message) {
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

        // Parse command and args
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

        const roleIds = Array.from(message.member?.roles?.cache?.keys?.() || []);
        const canUse = message.client.accessControl?.canUse(command.name, message.author.id, roleIds) || message.author.id === config.ownerId;

        if (!canUse) {
            return;
        }

        try {
            await command.execute(message, args);
        } catch (error) {
            console.error(`Error executing ${commandName}:`, error);
            message.reply('❌ Command failed.').catch(() => {});
        }
    }
};

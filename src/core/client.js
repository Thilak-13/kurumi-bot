const { Client, Collection, GatewayIntentBits } = require('discord.js');

/**
 * Discord client factory.
 * Intents and REST behavior for the whole bot are declared here, in one place.
 */
function createClient() {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMembers,          // rolesync member add/remove, member fetches
            GatewayIntentBits.GuildMessages,         // prefix commands, autopurge, mod-log mirroring
            GatewayIntentBits.GuildModeration,       // audit-log events
            GatewayIntentBits.GuildWebhooks,         // webhook monitoring (webhooksUpdate)
            GatewayIntentBits.MessageContent         // prefix parsing + content filters
            // GuildPresences was removed: no handler or .presence read exists
            // anywhere in src/, and it is the most expensive intent in RAM and
            // gateway traffic.
        ],
        rest: {
            // Emoji/sticker routes must fail fast instead of queueing behind
            // Discord's aggressive per-guild emoji rate limits; the emoji loop
            // engine catches the rejection and defers its queue.
            rejectOnRateLimit: (data) => {
                return data.route.includes('/emojis') || data.route.includes('/stickers');
            }
        }
    });

    client.commands = new Collection();
    return client;
}

module.exports = { createClient };

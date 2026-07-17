const { Client, Collection, GatewayIntentBits } = require('discord.js');

/**
 * Discord client factory.
 * Intents and REST behavior for the whole bot are declared here, in one place.
 */
function createClient() {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.GuildModeration,
            GatewayIntentBits.GuildPresences,
            GatewayIntentBits.MessageContent
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

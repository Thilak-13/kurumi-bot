const { Client, Collection, GatewayIntentBits, Options } = require('discord.js');

/**
 * Discord client factory.
 * Intents, caching and REST behavior for the whole bot are declared here.
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

        // Cache limits — the message cache is the only unbounded grower (it
        // grows with chat activity). Every feature that needs messages (purge,
        // backup, autopurge deletion, mod-log mirroring) fetches them from the
        // API or reads the live event payload, so nothing depends on a large
        // resident message cache. Presence cache is forced to 0 since the
        // intent is off. Member/emoji/sticker caches stay at default because
        // rolesync, dump and the emoji loop read them hot.
        makeCache: Options.cacheWithLimits({
            ...Options.DefaultMakeCacheSettings,
            MessageManager: 50,
            PresenceManager: 0
        }),

        // Periodically evict stale cached messages so memory stays flat over
        // long uptimes.
        sweepers: {
            ...Options.DefaultSweeperSettings,
            messages: {
                interval: 1800,   // run every 30 minutes
                lifetime: 1800    // drop messages untouched for 30 minutes
            }
        },

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

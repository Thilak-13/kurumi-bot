require('dotenv').config();

const config = require('../config/config');
const Logger = require('../systems/logger');
const Database = require('../database');
const AccessControl = require('../systems/accessControl');
const { createClient } = require('./client');
const { loadCommands, loadEvents } = require('./loaders');

/**
 * Application bootstrap: builds the client, wires core services, loads
 * commands/events, connects the database, logs in, and starts the
 * background engines.
 */
async function start() {
    const client = createClient();

    client.logger = new Logger(client);
    client.database = new Database();
    client.accessControl = new AccessControl();

    process.on('unhandledRejection', error => {
        console.error('Unhandled promise rejection:', error);
    });

    process.on('warning', warning => {
        console.warn('Warning:', warning);
    });

    client.on('error', error => {
        console.error('Discord client error:', error);
    });

    process.on('SIGINT', async () => {
        console.log('\n🛑 Shutting down...');

        if (client.database.connected) {
            await client.database.disconnect();
        }

        client.destroy();
        process.exit(0);
    });

    console.log('🤖 Private Moderation Bot v' + config.bot.version);

    // Validate configuration
    if (!config.token) {
        console.error('❌ BOT_TOKEN missing in .env');
        process.exit(1);
    }

    if (!config.ownerId) {
        console.error('❌ OWNER_ID missing in .env - bot will not work!');
        process.exit(1);
    }

    // Connect to database
    try {
        await client.database.connect();
    } catch (err) {
        console.error('Failed to connect to database:', err.message);
    }

    // Load commands and events
    const { loaded } = loadCommands(client);
    console.log(`✅ Loaded ${loaded} commands\n`);
    loadEvents(client);

    // Login to Discord
    try {
        await client.login(config.token);
        // initialize manga scheduler (timers for chapter counters)
        try {
            const mangaScheduler = require('../systems/mangaScheduler');
            await mangaScheduler.init(client);
            console.log('✅ Manga scheduler initialized');
        } catch (err) {
            console.error('Failed to initialize manga scheduler:', err.message);
        }
        // initialize auto purge engine (event-driven)
        try {
            const autoPurgeEngine = require('../systems/autoPurgeEngine');
            await autoPurgeEngine.init(client);
            console.log('✅ AutoPurge engine initialized');
        } catch (err) {
            console.error('Failed to initialize AutoPurge engine:', err.message);
        }
        // initialize emoji loop engine (refreshes emojis and stickers)
        try {
            const emojiLoopEngine = require('../systems/emojiLoopEngine');
            await emojiLoopEngine.init(client);
            console.log('✅ Emoji loop engine initialized');
        } catch (err) {
            console.error('Failed to initialize emoji loop engine:', err.message);
        }
    } catch (error) {
        console.error('❌ Login failed:', error.message);
        process.exit(1);
    }

    return client;
}

module.exports = { start };

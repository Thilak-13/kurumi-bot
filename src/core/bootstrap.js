require('dotenv').config();

const config = require('../config/config');
const Logger = require('../systems/logger');
const Database = require('../database');
const AccessControl = require('../services/accessControl');
const { createClient } = require('./client');
const { loadCommands, loadEvents } = require('./loaders');
const { TaskRegistry } = require('./tasks');
const { installShutdownHandlers } = require('./shutdown');

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

    // Background engines (started after login, stopped on shutdown)
    const tasks = new TaskRegistry()
        .register('Manga scheduler', require('../systems/mangaScheduler'))
        .register('AutoPurge engine', require('../systems/autoPurgeEngine'))
        .register('Emoji loop engine', require('../systems/emojiLoopEngine'));

    installShutdownHandlers(client, tasks);

    console.log(`🕰️ ${config.bot.name} v${config.bot.version} — "Ara ara... shall we begin?"`);

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

    // Login to Discord, then start background engines
    try {
        await client.login(config.token);
        await tasks.initAll(client);
    } catch (error) {
        console.error('❌ Login failed:', error.message);
        process.exit(1);
    }

    return client;
}

module.exports = { start };

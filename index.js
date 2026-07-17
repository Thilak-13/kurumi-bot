require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const config = require('./src/config/config');
const Logger = require('./src/systems/logger');
const Database = require('./src/database');
const AccessControl = require('./src/systems/accessControl');

// Create Discord client
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
        rejectOnRateLimit: (data) => {
            return data.route.includes('/emojis') || data.route.includes('/stickers');
        }
    }
});

// Initialize command collection
client.commands = new Collection();

// Initialize systems
client.logger = new Logger(client);
client.database = new Database();
client.accessControl = new AccessControl();

/**
 * Load all commands from the commands directory (supports both slash and message commands)
 */
function loadCommands() {
    const commandsPath = path.join(__dirname, 'src', 'commands');
    const commandFolders = fs.readdirSync(commandsPath);

    let commandCount = 0;

    for (const folder of commandFolders) {
        const folderPath = path.join(commandsPath, folder);
        
        if (!fs.statSync(folderPath).isDirectory()) continue;

        const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            const filePath = path.join(folderPath, file);
            
            try {
                const command = require(filePath);
                
                // Support slash commands (with 'data' property)
                if ('data' in command && 'execute' in command) {
                    client.commands.set(command.data.name, command);
                    commandCount++;
                }
                // Support legacy message commands (with 'name' property)
                else if ('name' in command && 'execute' in command) {
                    client.commands.set(command.name, command);
                    commandCount++;
                }
            } catch (error) {
                console.error(`❌ ${file}:`, error.message);
            }
        }
    }

    console.log(`✅ Loaded ${commandCount} commands\n`);
}

/**
 * Load all event handlers from the events directory (optimized)
 */
function loadEvents() {
    const eventsPath = path.join(__dirname, 'src', 'events');
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        
        try {
            const event = require(filePath);
            if (event.once) {
                client.once(event.name, (...args) => event.execute(...args));
            } else {
                client.on(event.name, (...args) => event.execute(...args));
            }
        } catch (error) {
            console.error(`❌ ${file}:`, error.message);
        }
    }
}

/**
 * Handle errors and warnings
 */
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

process.on('warning', warning => {
    console.warn('Warning:', warning);
});

client.on('error', error => {
    console.error('Discord client error:', error);
});

/**
 * Graceful shutdown
 */
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down...');
    
    if (client.database.connected) {
        await client.database.disconnect();
    }
    
    client.destroy();
    process.exit(0);
});

/**
 * Initialize and start the bot (optimized)
 */
async function start() {
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
    loadCommands();
    loadEvents();

    // Login to Discord
    try {
        await client.login(config.token);
        // initialize manga scheduler (timers for chapter counters)
        try {
            const mangaScheduler = require('./src/systems/mangaScheduler');
            await mangaScheduler.init(client);
            console.log('✅ Manga scheduler initialized');
        } catch (err) {
            console.error('Failed to initialize manga scheduler:', err.message);
        }
        // initialize auto purge engine (event-driven)
        try {
            const autoPurgeEngine = require('./src/systems/autoPurgeEngine');
            await autoPurgeEngine.init(client);
            console.log('✅ AutoPurge engine initialized');
        } catch (err) {
            console.error('Failed to initialize AutoPurge engine:', err.message);
        }
        // initialize emoji loop engine (refreshes emojis and stickers)
        try {
            const emojiLoopEngine = require('./src/systems/emojiLoopEngine');
            await emojiLoopEngine.init(client);
            console.log('✅ Emoji loop engine initialized');
        } catch (err) {
            console.error('Failed to initialize emoji loop engine:', err.message);
        }
    } catch (error) {
        console.error('❌ Login failed:', error.message);
        process.exit(1);
    }
}

// Start the bot
start();
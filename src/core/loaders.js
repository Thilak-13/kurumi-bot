const fs = require('fs');
const path = require('path');

/**
 * Command and event loaders.
 * Single implementation shared by bootstrap, deploy-commands.js and the
 * zzreload command (which previously each walked the directory themselves).
 */

const COMMANDS_PATH = path.join(__dirname, '..', 'commands');
const EVENTS_PATH = path.join(__dirname, '..', 'events');

/**
 * Walk src/commands and require every module.
 * @param {boolean} bustCache - delete require.cache entries first (hot reload)
 * @returns {{file: string, folder: string, module: object}[]} plus load errors
 */
function collectCommandModules({ bustCache = false } = {}) {
    const modules = [];
    const errors = [];

    for (const folder of fs.readdirSync(COMMANDS_PATH)) {
        const folderPath = path.join(COMMANDS_PATH, folder);
        if (!fs.statSync(folderPath).isDirectory()) continue;

        for (const file of fs.readdirSync(folderPath).filter(f => f.endsWith('.js'))) {
            const filePath = path.join(folderPath, file);
            try {
                if (bustCache) {
                    delete require.cache[require.resolve(filePath)];
                }
                modules.push({ file, folder, module: require(filePath) });
            } catch (error) {
                console.error(`❌ ${file}:`, error.message);
                errors.push({ file, error });
            }
        }
    }

    return { modules, errors };
}

/**
 * Register a command module on the client's command collection.
 * Supports slash commands ('data') and legacy prefix commands ('name').
 * @returns {boolean} whether the module was a valid command
 */
function registerCommand(client, command) {
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        return true;
    }
    if ('name' in command && 'execute' in command) {
        client.commands.set(command.name, command);
        return true;
    }
    return false;
}

/**
 * Load all commands onto the client. Returns the number registered.
 */
function loadCommands(client, { bustCache = false } = {}) {
    const { modules, errors } = collectCommandModules({ bustCache });

    let commandCount = 0;
    for (const { module } of modules) {
        if (registerCommand(client, module)) commandCount++;
    }

    return { loaded: commandCount, failed: errors.length };
}

/**
 * Load all event handlers from src/events onto the client.
 */
function loadEvents(client) {
    for (const file of fs.readdirSync(EVENTS_PATH).filter(f => f.endsWith('.js'))) {
        const filePath = path.join(EVENTS_PATH, file);
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

module.exports = { collectCommandModules, registerCommand, loadCommands, loadEvents };

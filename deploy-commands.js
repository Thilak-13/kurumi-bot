require('dotenv').config();
const { REST, Routes } = require('discord.js');
const { collectCommandModules } = require('./src/core/loaders');

const commands = [];
const commandNames = new Set();

let legacyCommandCount = 0;
let invalidCommandCount = 0;

console.log('📋 Loading commands for deployment...\n');

const { modules } = collectCommandModules();

for (const { file, module: command } of modules) {
    if ('data' in command && typeof command.execute === 'function' && typeof command.data?.toJSON === 'function') {
        const commandJson = command.data.toJSON();
        commands.push(commandJson);
        commandNames.add(commandJson.name);
        console.log(`✅ Loaded: ${commandJson.name}`);
    } else if ('name' in command && typeof command.execute === 'function') {
        // Legacy prefix commands are runtime-only and should not be deployed via REST.
        legacyCommandCount++;
        console.log(`ℹ️ Ignored legacy command: ${command.name}`);
    } else {
        invalidCommandCount++;
        console.warn(`⚠️ Skipped ${file}: invalid command export`);
    }
}

console.log(`\n📦 Total commands to deploy: ${commands.length}\n`);
if (legacyCommandCount > 0) {
    console.log(`ℹ️ Ignored ${legacyCommandCount} legacy prefix command(s) during deploy.`);
}
if (invalidCommandCount > 0) {
    console.warn(`⚠️ Found ${invalidCommandCount} invalid command file(s).`);
}
console.log('');

// Validate required environment variables
if (!process.env.BOT_TOKEN) {
    console.error('❌ BOT_TOKEN not found in .env file!');
    process.exit(1);
}

if (!process.env.CLIENT_ID) {
    console.error('❌ CLIENT_ID not found in .env file!');
    console.log('💡 Get your CLIENT_ID from Discord Developer Portal > Your Application > Application ID');
    process.exit(1);
}

const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
const rest = new REST().setToken(process.env.BOT_TOKEN);

async function removeStaleCommands(existingCommands, scopeLabel, routeFactory) {
    const staleCommands = existingCommands.filter(command => !commandNames.has(command.name));

    if (staleCommands.length === 0) {
        return;
    }

    console.log(`🧹 Removing ${staleCommands.length} stale ${scopeLabel} command(s)...\n`);

    for (const command of staleCommands) {
        await rest.delete(routeFactory(command.id));
        console.log(`🗑️ Removed stale ${scopeLabel} command: ${command.name}`);
    }
}

// Deploy commands
(async () => {
    try {
        if (guildId) {
            console.log(`🚀 Deploying ${commands.length} commands to guild ${guildId} for application ${clientId}...\n`);

            const existingGuildCommands = await rest.get(
                Routes.applicationGuildCommands(clientId, guildId)
            );

            await removeStaleCommands(
                existingGuildCommands,
                'guild',
                commandId => Routes.applicationGuildCommand(clientId, guildId, commandId)
            );

            const guildData = await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: commands },
            );

            console.log(`✅ Successfully deployed ${guildData.length} commands to guild ${guildId}!`);
            console.log('📝 Guild commands update almost immediately.\n');

            console.log(`🧹 Clearing global commands for application ${clientId} to avoid duplicate entries...\n`);

            const globalData = await rest.put(
                Routes.applicationCommands(clientId),
                { body: [] },
            );

            console.log(`✅ Cleared ${globalData.length} global command(s).`);
            console.log('📝 Only the guild command set remains active.\n');
        } else {
            console.log(`🚀 Deploying ${commands.length} commands globally to application ${clientId}...\n`);

            const existingGlobalCommands = await rest.get(
                Routes.applicationCommands(clientId)
            );

            await removeStaleCommands(
                existingGlobalCommands,
                'global',
                commandId => Routes.applicationCommand(clientId, commandId)
            );

            const data = await rest.put(
                Routes.applicationCommands(clientId),
                { body: commands },
            );

            console.log(`✅ Successfully deployed ${data.length} commands globally!`);
            console.log('📝 Note: Global commands may take up to 1 hour to appear.\n');
        }

    } catch (error) {
        console.error('❌ Deploy failed:', error.message);
        
        if (error.code === 50001) {
            console.log('\n💡 Error 50001: Missing Access');
            console.log('Make sure your bot has the "applications.commands" scope enabled.');
        } else if (error.code === 0) {
            console.log('\n💡 Invalid token or client ID');
        }
        process.exit(1);
    }
})();

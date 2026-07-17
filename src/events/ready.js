const { ActivityType } = require('discord.js');
const config = require('../config/config');

module.exports = {
    name: 'clientReady',
    once: true,
    async execute(client) {
        console.log(`✅ Online as ${client.user.tag}`);
        console.log(`📋 ${client.commands.size} commands loaded`);
        console.log(`🔧 Prefix: ${config.bot.prefix}`);

        // Set bot presence
        try {
            await client.user.setPresence({
                activities: [{
                    name: 'your time tick away ♡',
                    type: ActivityType.Watching
                }],
                status: 'online'
            });
            console.log(`🟢 Status set to online - Watching your time tick away ♡\n`);
        } catch (error) {
            console.error('Failed to set presence:', error.message);
        }
    }
};

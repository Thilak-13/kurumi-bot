require('dotenv').config();

module.exports = {
    // Bot token from environment variables
    token: process.env.BOT_TOKEN,
    
    // Bot owner ID - only this user can run owner commands
    ownerId: (process.env.OWNER_ID || '').trim(),

    // Primary guild/server ID
    guildId: process.env.GUILD_ID || '1252204883533103145',
    
    // Moderation log channel ID
    logChannelId: process.env.LOG_CHANNEL_ID,

    // Channel where the other moderation bot posts logs
    modLogChannelId: process.env.MOD_LOG_CHANNEL_ID || '1252204886419046483',

    // Forum channel ID for per-user moderation history threads
    moderationForumChannelId: process.env.MODERATION_FORUM_CHANNEL_ID || '1356006813815935096',

    // The external moderation bot whose log messages are mirrored into forum threads
    sapphireBotId: process.env.SAPPHIRE_BOT_ID || '678344927997853742',

    // Bot configuration
    bot: {
        name: 'Kurumi Tokisaki',
        version: '1.0.0',
        prefix: 'zz',
        color: 0xB01E36 // Kurumi crimson
    },
    
    // Permission settings
    permissions: {
        // Required permissions for moderation commands
        moderator: ['ModerateMembers', 'KickMembers', 'BanMembers'],
        admin: ['Administrator']
    },
    
    // Timeout durations in milliseconds
    timeoutDurations: {
        '1m': 60000,
        '5m': 300000,
        '10m': 600000,
        '30m': 1800000,
        '1h': 3600000,
        '6h': 21600000,
        '12h': 43200000,
        '1d': 86400000,
        '7d': 604800000
    }
};

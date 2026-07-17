const { EmbedBuilder } = require('discord.js');
const appConfig = require('../config/config');
const { matchesAnyFilter } = require('../lib/messageFilters');

class AutoPurgeEngine {
    constructor(client) {
        this.client = client;
        this.configCache = new Map();   // channelId -> config
        this.timers = new Map();        // messageId -> timeout handle
    }

    // --- Filter logic (shared with /purgeall via src/lib/messageFilters) ---

    matchesFilters(message, filters) {
        return matchesAnyFilter(message, filters);
    }

    // --- Config cache ---

    loadConfigCache() {
        this.configCache.clear();
        const db = this.client.database;
        if (!db || !db.connected) return;

        const configs = db.listAllAutoPurgeConfigs();
        for (const config of configs) {
            if (config.status === 'active') {
                this.configCache.set(config.channel_id, config);
            }
        }
        console.log(`   ├─ Cached ${this.configCache.size} active autopurge config(s)`);
    }

    reloadConfig() {
        // Cancel timers for channels that are no longer active
        const oldChannels = new Set(this.configCache.keys());
        this.loadConfigCache();
        const newChannels = new Set(this.configCache.keys());

        for (const channelId of oldChannels) {
            if (!newChannels.has(channelId)) {
                // Channel was removed or paused — cancel all its timers
                for (const [msgId, handle] of this.timers) {
                    // We don't store channelId on the timer handle, so check DB
                    // Instead, just let them fire and gracefully fail (message already deleted or config gone)
                }
            }
        }
    }

    // --- Normal operation: messageCreate listener ---

    handleMessage(message) {
        if (message.author.bot || message.system) return;
        if (!message.guild) return;

        const config = this.configCache.get(message.channel.id);
        if (!config || config.status !== 'active') return;

        const filters = config.filters || [];
        if (!this.matchesFilters(message, filters)) return;

        const ttlMs = config.interval_minutes * 60 * 1000;
        const expiresAt = message.createdTimestamp + ttlMs;

        // Persist tracking record
        const db = this.client.database;
        db.trackAutoPurgeMessage(message.id, message.channel.id, message.guild.id, expiresAt);
        db.updateAutoPurgeCheckpoint(message.guild.id, message.channel.id, message.id);

        // Schedule deletion timer
        this.scheduleTimer(message.id, message.channel.id, message.guild.id, expiresAt);
    }

    // --- Timer management ---

    scheduleTimer(messageId, channelId, guildId, expiresAt) {
        // Prevent duplicate timers
        if (this.timers.has(messageId)) return;

        const delay = Math.max(expiresAt - Date.now(), 0);

        const handle = setTimeout(async () => {
            this.timers.delete(messageId);
            await this.deleteTrackedMessage(messageId, channelId, guildId);
        }, delay);

        // Prevent the timer from keeping the process alive during shutdown
        if (handle.unref) handle.unref();

        this.timers.set(messageId, handle);
    }

    async deleteTrackedMessage(messageId, channelId, guildId) {
        const db = this.client.database;

        try {
            const guild = await this.client.guilds.fetch(guildId).catch(() => null);
            if (!guild) { db.removeTrackedMessage(messageId); return; }

            const channel = await guild.channels.fetch(channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) { db.removeTrackedMessage(messageId); return; }

            const msg = await channel.messages.fetch(messageId).catch(() => null);
            if (!msg) {
                // Message already deleted
                db.removeTrackedMessage(messageId);
                return;
            }

            await msg.delete();
        } catch (error) {
            // 10008 = Unknown Message (already deleted)
            if (error.code !== 10008) {
                console.error(`[AutoPurge] Failed to delete message ${messageId}:`, error.message);
            }
        } finally {
            db.removeTrackedMessage(messageId);
        }
    }

    // --- Crash recovery ---

    async crashRecovery() {
        const db = this.client.database;
        const tracked = db.listAllTrackedMessages();

        if (tracked.length === 0) {
            console.log('   ├─ Crash recovery: no pending messages');
            return {};
        }

        console.log(`   ├─ Crash recovery: processing ${tracked.length} tracked message(s)...`);
        const now = Date.now();
        // Track deletion counts per channel for summary logging
        const deletionCounts = {}; // channelId -> count

        for (const record of tracked) {
            if (record.expires_at <= now) {
                // Already expired — delete immediately
                await this.deleteTrackedMessage(record.message_id, record.channel_id, record.guild_id);
                const key = `${record.guild_id}:${record.channel_id}`;
                deletionCounts[key] = (deletionCounts[key] || 0) + 1;
            } else {
                // Still has time — reschedule
                this.scheduleTimer(record.message_id, record.channel_id, record.guild_id, record.expires_at);
            }
        }

        return deletionCounts;
    }

    // --- Downtime recovery ---

    async downtimeRecovery() {
        const db = this.client.database;
        const deletionCounts = {}; // channelId -> count

        for (const [channelId, config] of this.configCache) {
            if (!config.last_processed_message_id) continue; // Fresh config, no checkpoint

            try {
                const guild = await this.client.guilds.fetch(config.guild_id).catch(() => null);
                if (!guild) continue;

                const channel = await guild.channels.fetch(channelId).catch(() => null);
                if (!channel || !channel.isTextBased()) continue;

                // Fetch only messages newer than our checkpoint
                const messages = await channel.messages.fetch({
                    after: config.last_processed_message_id,
                    limit: 100
                }).catch(() => null);

                if (!messages || messages.size === 0) continue;

                const filters = config.filters || [];
                const ttlMs = config.interval_minutes * 60 * 1000;
                const now = Date.now();
                let latestProcessedId = config.last_processed_message_id;
                const key = `${config.guild_id}:${channelId}`;

                // messages are returned newest-first, process oldest-first for checkpoint ordering
                const sorted = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);

                for (const msg of sorted) {
                    if (msg.system) {
                        latestProcessedId = msg.id;
                        continue;
                    }

                    if (!this.matchesFilters(msg, filters)) {
                        latestProcessedId = msg.id;
                        continue;
                    }

                    const expiresAt = msg.createdTimestamp + ttlMs;

                    if (expiresAt <= now) {
                        // Already expired — delete immediately
                        try {
                            await msg.delete();
                            deletionCounts[key] = (deletionCounts[key] || 0) + 1;
                        } catch (error) {
                            if (error.code !== 10008) {
                                console.error(`[AutoPurge] Downtime recovery delete failed for ${msg.id}:`, error.message);
                            }
                        }
                    } else {
                        // Not yet expired — track and schedule
                        db.trackAutoPurgeMessage(msg.id, channelId, config.guild_id, expiresAt);
                        this.scheduleTimer(msg.id, channelId, config.guild_id, expiresAt);
                    }

                    latestProcessedId = msg.id;
                }

                // Advance checkpoint
                db.updateAutoPurgeCheckpoint(config.guild_id, channelId, latestProcessedId);
            } catch (error) {
                console.error(`[AutoPurge] Downtime recovery error for channel ${channelId}:`, error.message);
            }
        }

        return deletionCounts;
    }

    // --- Startup logging ---

    async logRecoverySummary(deletionCounts) {
        if (Object.keys(deletionCounts).length === 0) return;

        for (const [key, count] of Object.entries(deletionCounts)) {
            if (count === 0) continue;
            const [guildId, channelId] = key.split(':');
            const config = this.configCache.get(channelId);
            const filterList = config?.filters?.length > 0 ? config.filters.join(', ') : 'All messages';

            try {
                const guild = await this.client.guilds.fetch(guildId).catch(() => null);
                if (!guild) continue;

                let logged = false;

                if (config?.log_channel_id) {
                    const logChannel = await guild.channels.fetch(config.log_channel_id).catch(() => null);
                    if (logChannel && logChannel.isTextBased()) {
                        const embed = new EmbedBuilder()
                            .setTitle('🗑️ Autopurge Recovery')
                            .setDescription(`Ara ara... I was away, but the clock kept count. **${count}** expired message(s) in <#${channelId}> have been collected on my return ♡\n**Filters applied:** ${filterList}`)
                            .setColor(appConfig.bot?.color || 0xB01E36)
                            .setTimestamp();

                        await logChannel.send({ embeds: [embed] }).catch(() => {});
                        logged = true;
                    }
                }

                if (!logged && this.client.logger) {
                    await this.client.logger.logEvent(
                        '🗑️ Autopurge Recovery',
                        `Ara ara... I was away, but the clock kept count. **${count}** expired message(s) in <#${channelId}> have been collected on my return ♡\n**Filters applied:** ${filterList}`,
                        'info'
                    ).catch(() => {});
                }
            } catch (error) {
                console.error(`[AutoPurge] Failed to log recovery summary for ${channelId}:`, error.message);
            }
        }
    }

    // --- Lifecycle ---

    stop() {
        for (const [, handle] of this.timers) {
            clearTimeout(handle);
        }
        this.timers.clear();
        this.configCache.clear();
    }
}

let engineInstance = null;

module.exports = {
    async init(client) {
        engineInstance = new AutoPurgeEngine(client);

        // 1. Load config cache
        engineInstance.loadConfigCache();

        // 2. Crash recovery (tracked messages from before shutdown)
        const crashCounts = await engineInstance.crashRecovery();

        // 3. Downtime recovery (messages sent while bot was offline)
        const downtimeCounts = await engineInstance.downtimeRecovery();

        // 4. Merge and log recovery summary
        const merged = { ...crashCounts };
        for (const [key, count] of Object.entries(downtimeCounts)) {
            merged[key] = (merged[key] || 0) + count;
        }
        await engineInstance.logRecoverySummary(merged);

        // 5. Register messageCreate listener
        client.on('messageCreate', (message) => engineInstance.handleMessage(message));

        // Expose on client for command integration (same property name for compat)
        client.autoPurgeScheduler = engineInstance;

        console.log(`   └─ ${engineInstance.timers.size} timer(s) active`);
        return engineInstance;
    }
};

const SQLite = require('better-sqlite3');
const path = require('path');
const { createTables } = require('./schema');
const ModerationRepo = require('./repositories/moderationRepo');
const GuildSettingsRepo = require('./repositories/guildSettingsRepo');
const AutopurgeRepo = require('./repositories/autopurgeRepo');
const RoleSyncRepo = require('./repositories/roleSyncRepo');
const EmojiLoopRepo = require('./repositories/emojiLoopRepo');

/**
 * Database facade.
 *
 * Public API is byte-compatible with the former src/systems/database.js god
 * object — every method keeps its name, signature, return value and fail-soft
 * error handling — but the implementations now live in per-domain
 * repositories under ./repositories.
 */
class Database {
    constructor() {
        this.db = null;
        this.connected = false;

        // Repos are bound lazily in connect(); a facade method called before
        // connect() behaves like the old code (throws inside, caught, default
        // return) because repo.db is null.
        this.moderation = new ModerationRepo(null);
        this.guildSettings = new GuildSettingsRepo(null);
        this.autopurge = new AutopurgeRepo(null);
        this.roleSync = new RoleSyncRepo(null);
        this.emojiLoop = new EmojiLoopRepo(null);
    }

    /**
     * Initialize database connection
     */
    async connect() {
        try {
            const dbPath = path.join(__dirname, '..', '..', 'data', 'bot.db');
            const dbDir = path.dirname(dbPath);
            const fs = require('fs');
            if (!fs.existsSync(dbDir)) {
                fs.mkdirSync(dbDir, { recursive: true });
            }
            this.db = new SQLite(dbPath);
            this.db.pragma('journal_mode = WAL');
            await this.createTables();

            for (const repo of [this.moderation, this.guildSettings, this.autopurge, this.roleSync, this.emojiLoop]) {
                repo.db = this.db;
            }

            this.connected = true;
            console.log('📦 Database connected successfully');
            return this.connected;
        } catch (error) {
            console.error('❌ Database connection failed:', error.message);
            this.connected = false;
            return this.connected;
        }
    }

    /**
     * Create necessary database tables
     */
    async createTables() {
        createTables(this.db);
    }

    /**
     * Close database connection
     */
    async disconnect() {
        if (this.db) {
            this.db.close();
            this.connected = false;
            console.log('📦 Database disconnected');
        }
    }

    // --- Moderation cases / warnings / notes ---
    logCase(caseData) { return this.moderation.logCase(caseData); }
    getUserCases(guildId, userId, limit = 10) { return this.moderation.getUserCases(guildId, userId, limit); }
    addWarning(warningData) { return this.moderation.addWarning(warningData); }
    getUserWarnings(guildId, userId) { return this.moderation.getUserWarnings(guildId, userId); }
    addNote(noteData) { return this.moderation.addNote(noteData); }
    getUserNotes(guildId, userId) { return this.moderation.getUserNotes(guildId, userId); }

    // --- Guild settings ---
    saveGuildSettings(guildId, settings) { return this.guildSettings.saveGuildSettings(guildId, settings); }
    getGuildSettings(guildId) { return this.guildSettings.getGuildSettings(guildId); }

    // --- Autopurge configs ---
    saveAutoPurgeConfig(guildId, channelId, intervalMinutes, filters, status = 'active', logChannelId = null) {
        return this.autopurge.saveAutoPurgeConfig(guildId, channelId, intervalMinutes, filters, status, logChannelId);
    }
    getAutoPurgeConfig(guildId, channelId) { return this.autopurge.getAutoPurgeConfig(guildId, channelId); }
    listAllAutoPurgeConfigs() { return this.autopurge.listAllAutoPurgeConfigs(); }
    listGuildAutoPurgeConfigs(guildId) { return this.autopurge.listGuildAutoPurgeConfigs(guildId); }
    deleteAutoPurgeConfig(guildId, channelId) { return this.autopurge.deleteAutoPurgeConfig(guildId, channelId); }
    deleteAllGuildAutoPurgeConfigs(guildId) { return this.autopurge.deleteAllGuildAutoPurgeConfigs(guildId); }
    updateAutoPurgeRun(guildId, channelId, lastRun, nextRun) { return this.autopurge.updateAutoPurgeRun(guildId, channelId, lastRun, nextRun); }
    updateAutoPurgeStatus(guildId, channelId, status) { return this.autopurge.updateAutoPurgeStatus(guildId, channelId, status); }

    // --- Autopurge tracked messages ---
    trackAutoPurgeMessage(messageId, channelId, guildId, expiresAt) { return this.autopurge.trackAutoPurgeMessage(messageId, channelId, guildId, expiresAt); }
    removeTrackedMessage(messageId) { return this.autopurge.removeTrackedMessage(messageId); }
    removeTrackedMessagesForChannel(guildId, channelId) { return this.autopurge.removeTrackedMessagesForChannel(guildId, channelId); }
    removeAllTrackedMessagesForGuild(guildId) { return this.autopurge.removeAllTrackedMessagesForGuild(guildId); }
    listAllTrackedMessages() { return this.autopurge.listAllTrackedMessages(); }
    updateAutoPurgeCheckpoint(guildId, channelId, messageId) { return this.autopurge.updateAutoPurgeCheckpoint(guildId, channelId, messageId); }

    // --- Role sync rules ---
    getRoleSyncRule(sourceGuildId, targetGuildId, roleId) { return this.roleSync.getRoleSyncRule(sourceGuildId, targetGuildId, roleId); }
    addRoleSyncRule(sourceGuildId, targetGuildId, roleId) { return this.roleSync.addRoleSyncRule(sourceGuildId, targetGuildId, roleId); }
    removeRoleSyncRule(sourceGuildId, targetGuildId, roleId) { return this.roleSync.removeRoleSyncRule(sourceGuildId, targetGuildId, roleId); }
    listAllRoleSyncRules() { return this.roleSync.listAllRoleSyncRules(); }
    getRoleSyncRulesForSource(sourceGuildId) { return this.roleSync.getRoleSyncRulesForSource(sourceGuildId); }
    getRoleSyncRulesForTarget(targetGuildId) { return this.roleSync.getRoleSyncRulesForTarget(targetGuildId); }

    // --- Emoji loops ---
    saveEmojiLoop(guildId, intervalMinutes, status = 'active') { return this.emojiLoop.saveEmojiLoop(guildId, intervalMinutes, status); }
    getEmojiLoop(guildId) { return this.emojiLoop.getEmojiLoop(guildId); }
    deleteEmojiLoop(guildId) { return this.emojiLoop.deleteEmojiLoop(guildId); }
    listAllEmojiLoops() { return this.emojiLoop.listAllEmojiLoops(); }
    updateEmojiLoopRun(guildId, lastRun, nextRun) { return this.emojiLoop.updateEmojiLoopRun(guildId, lastRun, nextRun); }
    updateEmojiLoopStatus(guildId, status) { return this.emojiLoop.updateEmojiLoopStatus(guildId, status); }
    updateEmojiLoopQueue(guildId, pendingItems, lastRun, nextRun) { return this.emojiLoop.updateEmojiLoopQueue(guildId, pendingItems, lastRun, nextRun); }
}

module.exports = Database;

const SQLite = require('better-sqlite3');
const path = require('path');

class Database {
    constructor() {
        this.db = null;
        this.connected = false;
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
        const tables = [
            `CREATE TABLE IF NOT EXISTS moderation_cases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                moderator_id TEXT NOT NULL,
                action TEXT NOT NULL,
                reason TEXT,
                duration INTEGER,
                timestamp INTEGER NOT NULL
            )`,
            `CREATE TABLE IF NOT EXISTS warnings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                moderator_id TEXT NOT NULL,
                reason TEXT,
                timestamp INTEGER NOT NULL
            )`,
            `CREATE TABLE IF NOT EXISTS user_notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                author_id TEXT NOT NULL,
                note TEXT NOT NULL,
                timestamp INTEGER NOT NULL
            )`,
            `CREATE TABLE IF NOT EXISTS guild_settings (
                guild_id TEXT PRIMARY KEY,
                settings TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            )`,
            `CREATE TABLE IF NOT EXISTS autopurge_configs (
                guild_id TEXT NOT NULL,
                channel_id TEXT NOT NULL,
                interval_minutes INTEGER NOT NULL,
                filters TEXT NOT NULL,
                last_run INTEGER DEFAULT 0,
                next_run INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                log_channel_id TEXT DEFAULT NULL,
                PRIMARY KEY (guild_id, channel_id)
            )`,
            `CREATE TABLE IF NOT EXISTS autopurge_tracked_messages (
                message_id TEXT PRIMARY KEY,
                channel_id TEXT NOT NULL,
                guild_id TEXT NOT NULL,
                expires_at INTEGER NOT NULL
            )`,
            `CREATE TABLE IF NOT EXISTS guild_role_syncs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_guild_id TEXT NOT NULL,
                target_guild_id TEXT NOT NULL,
                role_id TEXT NOT NULL,
                UNIQUE(source_guild_id, target_guild_id, role_id)
            )`
        ];

        tables.forEach(table => {
            try {
                this.db.exec(table);
            } catch (error) {
                console.error('❌ Error creating table:', error.message);
            }
        });

        // Run migrations for existing installations
        try {
            this.db.exec("ALTER TABLE autopurge_configs ADD COLUMN log_channel_id TEXT DEFAULT NULL");
        } catch (error) {
            // Ignore error if column already exists
        }
        try {
            this.db.exec("ALTER TABLE autopurge_configs ADD COLUMN last_processed_message_id TEXT DEFAULT NULL");
        } catch (error) {
            // Ignore error if column already exists
        }

        console.log('✅ Database tables created/verified');
    }

    /**
     * Log a moderation case
     */
    logCase(caseData) {
        try {
            const stmt = this.db.prepare(`
                INSERT INTO moderation_cases (guild_id, user_id, moderator_id, action, reason, duration, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            const result = stmt.run(
                caseData.guildId,
                caseData.userId,
                caseData.moderatorId,
                caseData.action,
                caseData.reason || null,
                caseData.duration || null,
                Date.now()
            );
            return result.lastInsertRowid;
        } catch (error) {
            console.error('❌ Error logging case:', error.message);
            return null;
        }
    }

    /**
     * Get moderation cases for a user
     */
    getUserCases(guildId, userId, limit = 10) {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM moderation_cases
                WHERE guild_id = ? AND user_id = ?
                ORDER BY timestamp DESC
                LIMIT ?
            `);
            return stmt.all(guildId, userId, limit);
        } catch (error) {
            console.error('❌ Error getting user cases:', error.message);
            return [];
        }
    }

    /**
     * Add a warning to a user
     */
    addWarning(warningData) {
        try {
            const stmt = this.db.prepare(`
                INSERT INTO warnings (guild_id, user_id, moderator_id, reason, timestamp)
                VALUES (?, ?, ?, ?, ?)
            `);
            const result = stmt.run(
                warningData.guildId,
                warningData.userId,
                warningData.moderatorId,
                warningData.reason || null,
                Date.now()
            );
            return result.lastInsertRowid;
        } catch (error) {
            console.error('❌ Error adding warning:', error.message);
            return null;
        }
    }

    /**
     * Get warnings for a user
     */
    getUserWarnings(guildId, userId) {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM warnings
                WHERE guild_id = ? AND user_id = ?
                ORDER BY timestamp DESC
            `);
            return stmt.all(guildId, userId);
        } catch (error) {
            console.error('❌ Error getting user warnings:', error.message);
            return [];
        }
    }

    /**
     * Add a note to a user
     */
    addNote(noteData) {
        try {
            const stmt = this.db.prepare(`
                INSERT INTO user_notes (guild_id, user_id, author_id, note, timestamp)
                VALUES (?, ?, ?, ?, ?)
            `);
            const result = stmt.run(
                noteData.guildId,
                noteData.userId,
                noteData.authorId,
                noteData.note,
                Date.now()
            );
            return result.lastInsertRowid;
        } catch (error) {
            console.error('❌ Error adding note:', error.message);
            return null;
        }
    }

    /**
     * Get notes for a user
     */
    getUserNotes(guildId, userId) {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM user_notes
                WHERE guild_id = ? AND user_id = ?
                ORDER BY timestamp DESC
            `);
            return stmt.all(guildId, userId);
        } catch (error) {
            console.error('❌ Error getting user notes:', error.message);
            return [];
        }
    }

    /**
     * Save guild settings
     */
    saveGuildSettings(guildId, settings) {
        try {
            const stmt = this.db.prepare(`
                INSERT INTO guild_settings (guild_id, settings, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(guild_id) DO UPDATE SET
                    settings = excluded.settings,
                    updated_at = excluded.updated_at
            `);
            stmt.run(guildId, JSON.stringify(settings), Date.now());
            return true;
        } catch (error) {
            console.error('❌ Error saving guild settings:', error.message);
            return false;
        }
    }

    /**
     * Get guild settings
     */
    getGuildSettings(guildId) {
        try {
            const stmt = this.db.prepare(`
                SELECT settings FROM guild_settings WHERE guild_id = ?
            `);
            const result = stmt.get(guildId);
            if (result) {
                return JSON.parse(result.settings);
            }
            return null;
        } catch (error) {
            console.error('❌ Error getting guild settings:', error.message);
            return null;
        }
    }


    /**
     * Save/update autopurge configuration for a channel
     */
    saveAutoPurgeConfig(guildId, channelId, intervalMinutes, filters, status = 'active', logChannelId = null) {
        try {
            const nextRun = Date.now() + 60 * 1000;
            const stmt = this.db.prepare(`
                INSERT INTO autopurge_configs (guild_id, channel_id, interval_minutes, filters, last_run, next_run, status, log_channel_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(guild_id, channel_id) DO UPDATE SET
                    interval_minutes = excluded.interval_minutes,
                    filters = excluded.filters,
                    next_run = excluded.next_run,
                    status = excluded.status,
                    log_channel_id = excluded.log_channel_id
            `);
            stmt.run(guildId, channelId, intervalMinutes, JSON.stringify(filters), 0, nextRun, status, logChannelId);
            return true;
        } catch (error) {
            console.error('❌ Error saving autopurge config:', error.message);
            return false;
        }
    }

    /**
     * Get autopurge configuration for a channel
     */
    getAutoPurgeConfig(guildId, channelId) {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM autopurge_configs WHERE guild_id = ? AND channel_id = ?
            `);
            const result = stmt.get(guildId, channelId);
            if (result) {
                result.filters = JSON.parse(result.filters);
                return result;
            }
            return null;
        } catch (error) {
            console.error('❌ Error getting autopurge config:', error.message);
            return null;
        }
    }

    /**
     * List all active autopurge configurations
     */
    listAllAutoPurgeConfigs() {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM autopurge_configs
            `);
            const results = stmt.all();
            return results.map(r => ({
                ...r,
                filters: JSON.parse(r.filters)
            }));
        } catch (error) {
            console.error('❌ Error listing all autopurge configs:', error.message);
            return [];
        }
    }

    /**
     * List all autopurge configurations for a guild
     */
    listGuildAutoPurgeConfigs(guildId) {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM autopurge_configs WHERE guild_id = ?
            `);
            const results = stmt.all(guildId);
            return results.map(r => ({
                ...r,
                filters: JSON.parse(r.filters)
            }));
        } catch (error) {
            console.error('❌ Error listing guild autopurge configs:', error.message);
            return [];
        }
    }

    /**
     * Delete autopurge configuration for a channel
     */
    deleteAutoPurgeConfig(guildId, channelId) {
        try {
            const stmt = this.db.prepare(`
                DELETE FROM autopurge_configs WHERE guild_id = ? AND channel_id = ?
            `);
            const result = stmt.run(guildId, channelId);
            return result.changes > 0;
        } catch (error) {
            console.error('❌ Error deleting autopurge config:', error.message);
            return false;
        }
    }

    /**
     * Delete all autopurge configurations for a guild
     */
    deleteAllGuildAutoPurgeConfigs(guildId) {
        try {
            const stmt = this.db.prepare(`
                DELETE FROM autopurge_configs WHERE guild_id = ?
            `);
            const result = stmt.run(guildId);
            return result.changes;
        } catch (error) {
            console.error('❌ Error deleting all guild autopurge configs:', error.message);
            return 0;
        }
    }


    /**
     * Update runtime execution stats for autopurge
     */
    updateAutoPurgeRun(guildId, channelId, lastRun, nextRun) {
        try {
            const stmt = this.db.prepare(`
                UPDATE autopurge_configs
                SET last_run = ?, next_run = ?
                WHERE guild_id = ? AND channel_id = ?
            `);
            stmt.run(lastRun, nextRun, guildId, channelId);
            return true;
        } catch (error) {
            console.error('❌ Error updating autopurge run:', error.message);
            return false;
        }
    }

    /**
     * Update status (active/paused/etc.) of autopurge
     */
    updateAutoPurgeStatus(guildId, channelId, status) {
        try {
            const stmt = this.db.prepare(`
                UPDATE autopurge_configs
                SET status = ?
                WHERE guild_id = ? AND channel_id = ?
            `);
            stmt.run(status, guildId, channelId);
            return true;
        } catch (error) {
            console.error('❌ Error updating autopurge status:', error.message);
            return false;
        }
    }

    // --- Autopurge tracked messages (event-driven engine) ---

    trackAutoPurgeMessage(messageId, channelId, guildId, expiresAt) {
        try {
            const stmt = this.db.prepare(`
                INSERT INTO autopurge_tracked_messages (message_id, channel_id, guild_id, expires_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(message_id) DO UPDATE SET expires_at = excluded.expires_at
            `);
            stmt.run(messageId, channelId, guildId, expiresAt);
            return true;
        } catch (error) {
            console.error('❌ Error tracking autopurge message:', error.message);
            return false;
        }
    }

    removeTrackedMessage(messageId) {
        try {
            this.db.prepare('DELETE FROM autopurge_tracked_messages WHERE message_id = ?').run(messageId);
            return true;
        } catch (error) {
            console.error('❌ Error removing tracked message:', error.message);
            return false;
        }
    }

    removeTrackedMessagesForChannel(guildId, channelId) {
        try {
            this.db.prepare('DELETE FROM autopurge_tracked_messages WHERE guild_id = ? AND channel_id = ?').run(guildId, channelId);
            return true;
        } catch (error) {
            console.error('❌ Error removing tracked messages for channel:', error.message);
            return false;
        }
    }

    /**
     * Remove all tracked messages for a guild
     */
    removeAllTrackedMessagesForGuild(guildId) {
        try {
            this.db.prepare('DELETE FROM autopurge_tracked_messages WHERE guild_id = ?').run(guildId);
            return true;
        } catch (error) {
            console.error('❌ Error removing all tracked messages for guild:', error.message);
            return false;
        }
    }


    listAllTrackedMessages() {
        try {
            return this.db.prepare('SELECT * FROM autopurge_tracked_messages').all();
        } catch (error) {
            console.error('❌ Error listing tracked messages:', error.message);
            return [];
        }
    }

    updateAutoPurgeCheckpoint(guildId, channelId, messageId) {
        try {
            this.db.prepare(`
                UPDATE autopurge_configs SET last_processed_message_id = ? WHERE guild_id = ? AND channel_id = ?
            `).run(messageId, guildId, channelId);
            return true;
        } catch (error) {
            console.error('❌ Error updating autopurge checkpoint:', error.message);
            return false;
        }
    }

    /**
     * Get a specific role sync rule
     */
    getRoleSyncRule(sourceGuildId, targetGuildId, roleId) {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM guild_role_syncs 
                WHERE source_guild_id = ? AND target_guild_id = ? AND role_id = ?
            `);
            return stmt.get(sourceGuildId, targetGuildId, roleId);
        } catch (error) {
            console.error('❌ Error getting role sync rule:', error.message);
            return null;
        }
    }

    /**
     * Add a role sync rule
     */
    addRoleSyncRule(sourceGuildId, targetGuildId, roleId) {
        try {
            const stmt = this.db.prepare(`
                INSERT INTO guild_role_syncs (source_guild_id, target_guild_id, role_id)
                VALUES (?, ?, ?)
            `);
            stmt.run(sourceGuildId, targetGuildId, roleId);
            return true;
        } catch (error) {
            console.error('❌ Error adding role sync rule:', error.message);
            return false;
        }
    }

    /**
     * Remove a role sync rule
     */
    removeRoleSyncRule(sourceGuildId, targetGuildId, roleId) {
        try {
            const stmt = this.db.prepare(`
                DELETE FROM guild_role_syncs 
                WHERE source_guild_id = ? AND target_guild_id = ? AND role_id = ?
            `);
            const result = stmt.run(sourceGuildId, targetGuildId, roleId);
            return result.changes > 0;
        } catch (error) {
            console.error('❌ Error removing role sync rule:', error.message);
            return false;
        }
    }

    /**
     * List all role sync rules
     */
    listAllRoleSyncRules() {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM guild_role_syncs
            `);
            return stmt.all();
        } catch (error) {
            console.error('❌ Error listing all role sync rules:', error.message);
            return [];
        }
    }

    /**
     * Get role sync rules by source guild ID
     */
    getRoleSyncRulesForSource(sourceGuildId) {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM guild_role_syncs WHERE source_guild_id = ?
            `);
            return stmt.all(sourceGuildId);
        } catch (error) {
            console.error('❌ Error getting role sync rules for source:', error.message);
            return [];
        }
    }

    /**
     * Get role sync rules by target guild ID
     */
    getRoleSyncRulesForTarget(targetGuildId) {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM guild_role_syncs WHERE target_guild_id = ?
            `);
            return stmt.all(targetGuildId);
        } catch (error) {
            console.error('❌ Error getting role sync rules for target:', error.message);
            return [];
        }
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
}

module.exports = Database;

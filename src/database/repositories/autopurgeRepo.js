/**
 * Autopurge channel configurations and tracked-message records
 * (the event-driven purge engine's persistence).
 */
class AutopurgeRepo {
    constructor(db) {
        this.db = db;
    }

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
}

module.exports = AutopurgeRepo;

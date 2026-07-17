/**
 * Per-guild settings blob (JSON column).
 */
class GuildSettingsRepo {
    constructor(db) {
        this.db = db;
    }

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
}

module.exports = GuildSettingsRepo;

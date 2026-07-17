/**
 * Emoji/sticker refresh loop configuration and queue state.
 */
class EmojiLoopRepo {
    constructor(db) {
        this.db = db;
    }

    saveEmojiLoop(guildId, intervalMinutes, status = 'active') {
        try {
            const nextRun = Date.now() + intervalMinutes * 60 * 1000;
            const stmt = this.db.prepare(`
                INSERT INTO emoji_loops (guild_id, interval_minutes, status, last_run, next_run)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(guild_id) DO UPDATE SET
                    interval_minutes = excluded.interval_minutes,
                    status = excluded.status,
                    next_run = excluded.next_run
            `);
            stmt.run(guildId, intervalMinutes, status, 0, nextRun);
            return true;
        } catch (error) {
            console.error('❌ Error saving emoji loop config:', error.message);
            return false;
        }
    }

    getEmojiLoop(guildId) {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM emoji_loops WHERE guild_id = ?
            `);
            return stmt.get(guildId) || null;
        } catch (error) {
            console.error('❌ Error getting emoji loop config:', error.message);
            return null;
        }
    }

    deleteEmojiLoop(guildId) {
        try {
            const stmt = this.db.prepare(`
                DELETE FROM emoji_loops WHERE guild_id = ?
            `);
            const result = stmt.run(guildId);
            return result.changes > 0;
        } catch (error) {
            console.error('❌ Error deleting emoji loop config:', error.message);
            return false;
        }
    }

    listAllEmojiLoops() {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM emoji_loops
            `);
            return stmt.all();
        } catch (error) {
            console.error('❌ Error listing all emoji loops:', error.message);
            return [];
        }
    }

    updateEmojiLoopRun(guildId, lastRun, nextRun) {
        try {
            const stmt = this.db.prepare(`
                UPDATE emoji_loops
                SET last_run = ?, next_run = ?
                WHERE guild_id = ?
            `);
            stmt.run(lastRun, nextRun, guildId);
            return true;
        } catch (error) {
            console.error('❌ Error updating emoji loop run:', error.message);
            return false;
        }
    }

    updateEmojiLoopStatus(guildId, status) {
        try {
            const stmt = this.db.prepare(`
                UPDATE emoji_loops
                SET status = ?
                WHERE guild_id = ?
            `);
            stmt.run(status, guildId);
            return true;
        } catch (error) {
            console.error('❌ Error updating emoji loop status:', error.message);
            return false;
        }
    }

    /**
     * Persist the pending refresh queue together with run timestamps.
     * Replaces the raw SQL the emoji loop engine previously ran against the
     * underlying connection directly.
     */
    updateEmojiLoopQueue(guildId, pendingItems, lastRun, nextRun) {
        try {
            const stmt = this.db.prepare(`
                UPDATE emoji_loops
                SET pending_items = ?, last_run = ?, next_run = ?
                WHERE guild_id = ?
            `);
            stmt.run(JSON.stringify(pendingItems), lastRun, nextRun, guildId);
            return true;
        } catch (error) {
            console.error('❌ Error updating emoji loop queue:', error.message);
            return false;
        }
    }
}

module.exports = EmojiLoopRepo;

/**
 * Moderation cases, warnings and user notes.
 */
class ModerationRepo {
    constructor(db) {
        this.db = db;
    }

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
}

module.exports = ModerationRepo;

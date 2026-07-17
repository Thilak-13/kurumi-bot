/**
 * Cross-guild role sync rules.
 */
class RoleSyncRepo {
    constructor(db) {
        this.db = db;
    }

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
}

module.exports = RoleSyncRepo;

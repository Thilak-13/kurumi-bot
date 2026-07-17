/**
 * Table definitions and idempotent migrations for the SQLite database.
 */

const TABLES = [
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
    )`,
    `CREATE TABLE IF NOT EXISTS emoji_loops (
        guild_id TEXT PRIMARY KEY,
        interval_minutes INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        last_run INTEGER DEFAULT 0,
        next_run INTEGER NOT NULL,
        pending_items TEXT DEFAULT '[]'
    )`
];

// Column additions for installations created before the column existed.
// Errors ("duplicate column name") are expected and ignored.
const MIGRATIONS = [
    "ALTER TABLE autopurge_configs ADD COLUMN log_channel_id TEXT DEFAULT NULL",
    "ALTER TABLE autopurge_configs ADD COLUMN last_processed_message_id TEXT DEFAULT NULL",
    "ALTER TABLE emoji_loops ADD COLUMN pending_items TEXT DEFAULT '[]'"
];

function createTables(db) {
    TABLES.forEach(table => {
        try {
            db.exec(table);
        } catch (error) {
            console.error('❌ Error creating table:', error.message);
        }
    });

    for (const migration of MIGRATIONS) {
        try {
            db.exec(migration);
        } catch (error) {
            // Ignore error if column already exists
        }
    }

    console.log('✅ Database tables created/verified');
}

module.exports = { createTables };

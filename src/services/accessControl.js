const fs = require('fs');
const path = require('path');
const config = require('../config/config');

class AccessControl {
    constructor() {
        this.dataPath = path.join(__dirname, '..', '..', 'data', 'command-access.json');
        this.backupPath = path.join(__dirname, '..', '..', 'data', 'command-access.backup.json');
        this.data = { guilds: {} };
        this.load();
    }

    normalizeCommandName(commandName) {
        return String(commandName || '').trim().toLowerCase();
    }

    ensureCommandEntry(guildId, commandName) {
        const key = this.normalizeCommandName(commandName);
        if (!key || !guildId) return null;

        if (!this.data.guilds) {
            this.data.guilds = {};
        }
        if (!this.data.guilds[guildId]) {
            this.data.guilds[guildId] = { commands: {} };
        }
        if (!this.data.guilds[guildId].commands) {
            this.data.guilds[guildId].commands = {};
        }

        if (!this.data.guilds[guildId].commands[key]) {
            this.data.guilds[guildId].commands[key] = {
                roles: [],
                members: [],
                updatedAt: new Date().toISOString()
            };
        }

        return this.data.guilds[guildId].commands[key];
    }

    loadFromFile(filePath) {
        if (!fs.existsSync(filePath)) return null;

        try {
            const raw = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(raw);
        } catch (error) {
            console.warn(`⚠️ Failed to load access control file ${filePath}: ${error.message}`);
            return null;
        }
    }

    load() {
        const primary = this.loadFromFile(this.dataPath);
        const backup = this.loadFromFile(this.backupPath);

        const loaded = primary || backup;
        if (loaded) {
            // Check if legacy schema
            if (loaded.commands && !loaded.guilds) {
                // Migrate to guild-scoped structure
                const defaultGuildId = config.guildId || '1252204883533103145';
                this.data = {
                    guilds: {
                        [defaultGuildId]: {
                            commands: loaded.commands
                        }
                    }
                };
                console.log(`📦 AccessControl: Migrated legacy command permissions to guild ${defaultGuildId}`);
                this.save();
                return;
            } else if (loaded.guilds && typeof loaded.guilds === 'object') {
                this.data = loaded;
                return;
            }
        }

        this.data = { guilds: {} };
    }

    save() {
        const folder = path.dirname(this.dataPath);
        fs.mkdirSync(folder, { recursive: true });

        const serialized = JSON.stringify(this.data, null, 2);
        // Write via temp file + rename so a crash mid-write can never leave a
        // truncated permissions file (the backup copy stays as second safety net).
        this.writeAtomic(this.dataPath, serialized);
        this.writeAtomic(this.backupPath, serialized);
    }

    writeAtomic(filePath, contents) {
        const tmpPath = `${filePath}.tmp`;
        fs.writeFileSync(tmpPath, contents, 'utf8');
        fs.renameSync(tmpPath, filePath);
    }

    grant(guildId, commandName, targetType, targetId) {
        if (!guildId) return false;
        const entry = this.ensureCommandEntry(guildId, commandName);
        if (!entry) return false;

        const normalizedId = String(targetId);
        const list = targetType === 'role' ? entry.roles : entry.members;
        if (!list.includes(normalizedId)) {
            list.push(normalizedId);
        }

        entry.updatedAt = new Date().toISOString();
        this.save();
        return true;
    }

    revoke(guildId, commandName, targetType, targetId) {
        if (!guildId) return false;
        const key = this.normalizeCommandName(commandName);
        const guildEntry = this.data.guilds?.[guildId];
        const entry = guildEntry?.commands?.[key];
        if (!entry) return false;

        const normalizedId = String(targetId);
        const list = targetType === 'role' ? entry.roles : entry.members;
        const index = list.indexOf(normalizedId);
        if (index === -1) return false;

        list.splice(index, 1);
        entry.updatedAt = new Date().toISOString();
        this.save();
        return true;
    }

    clear(guildId, commandName) {
        if (!guildId) return false;
        const key = this.normalizeCommandName(commandName);
        const guildEntry = this.data.guilds?.[guildId];
        if (!guildEntry?.commands?.[key]) return false;

        delete guildEntry.commands[key];
        this.save();
        return true;
    }

    list(guildId, commandName) {
        if (!guildId) return null;
        const key = this.normalizeCommandName(commandName);
        return this.data.guilds?.[guildId]?.commands?.[key] || null;
    }

    canUse(guildId, commandName, userId, roleIds = []) {
        if (!commandName || !userId || !guildId) return false;
        if (String(userId) === String(config.ownerId)) return true;

        const entry = this.list(guildId, commandName);
        if (!entry) return false;

        if (entry.members.includes(String(userId))) return true;

        return roleIds.some(roleId => entry.roles.includes(String(roleId)));
    }
}

module.exports = AccessControl;
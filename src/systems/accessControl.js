const fs = require('fs');
const path = require('path');
const config = require('../config/config');

class AccessControl {
    constructor() {
        this.dataPath = path.join(__dirname, '..', 'data', 'command-access.json');
        this.backupPath = path.join(__dirname, '..', 'data', 'command-access.backup.json');
        this.data = { commands: {} };
        this.load();
    }

    normalizeCommandName(commandName) {
        return String(commandName || '').trim().toLowerCase();
    }

    ensureCommandEntry(commandName) {
        const key = this.normalizeCommandName(commandName);
        if (!key) return null;

        if (!this.data.commands[key]) {
            this.data.commands[key] = {
                roles: [],
                members: [],
                updatedAt: new Date().toISOString()
            };
        }

        return this.data.commands[key];
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
        if (loaded && loaded.commands && typeof loaded.commands === 'object') {
            this.data = loaded;
            return;
        }

        this.data = { commands: {} };
    }

    save() {
        const folder = path.dirname(this.dataPath);
        fs.mkdirSync(folder, { recursive: true });

        const serialized = JSON.stringify(this.data, null, 2);
        fs.writeFileSync(this.dataPath, serialized, 'utf8');
        fs.writeFileSync(this.backupPath, serialized, 'utf8');
    }

    grant(commandName, targetType, targetId) {
        const entry = this.ensureCommandEntry(commandName);
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

    revoke(commandName, targetType, targetId) {
        const key = this.normalizeCommandName(commandName);
        const entry = this.data.commands[key];
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

    clear(commandName) {
        const key = this.normalizeCommandName(commandName);
        if (!this.data.commands[key]) return false;

        delete this.data.commands[key];
        this.save();
        return true;
    }

    list(commandName) {
        const key = this.normalizeCommandName(commandName);
        return this.data.commands[key] || null;
    }

    canUse(commandName, userId, roleIds = []) {
        if (!commandName || !userId) return false;
        if (String(userId) === String(config.ownerId)) return true;

        const entry = this.list(commandName);
        if (!entry) return false;

        if (entry.members.includes(String(userId))) return true;

        return roleIds.some(roleId => entry.roles.includes(String(roleId)));
    }
}

module.exports = AccessControl;
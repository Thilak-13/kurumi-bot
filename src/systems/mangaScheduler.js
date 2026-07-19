const fs = require('fs/promises');
const path = require('path');

const config = require('../config/config');
const TIMERS_PATH = path.join(config.dataDir, 'manga-timers.json');
const UPDATE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

class MangaScheduler {
    constructor(client) {
        this.client = client;
        this.timers = {}; // key => { guildId, channelId, chapter, target, completed }
        this.interval = null;
    }

    async load() {
        try {
            const raw = await fs.readFile(TIMERS_PATH, 'utf8');
            this.timers = JSON.parse(raw || '{}');
        } catch (err) {
            // If file doesn't exist or is invalid, start with empty
            this.timers = {};
            await this.save();
        }
    }

    async save() {
        await fs.mkdir(path.dirname(TIMERS_PATH), { recursive: true }).catch(() => {});
        await fs.writeFile(TIMERS_PATH, JSON.stringify(this.timers, null, 2), 'utf8');
    }

    start() {
        // run immediately then every interval
        this.updateAll().catch(console.error);
        if (this.interval) clearInterval(this.interval);
        this.interval = setInterval(() => this.updateAll().catch(console.error), UPDATE_INTERVAL_MS);
    }

    stop() {
        if (this.interval) clearInterval(this.interval);
        this.interval = null;
    }

    async addTimer({ guildId, channelId, chapter }) {
        const key = this._key(guildId, channelId);
        const target = MangaScheduler.getNextWednesdayUTC();

        this.timers[key] = {
            guildId,
            channelId,
            chapter: Number(chapter),
            target: target.getTime(),
            completed: false
        };

        await this.save();

        // immediate update for this channel
        await this.updateOne(this.timers[key]).catch(console.error);
        return this.timers[key];
    }

    async removeTimer(guildId, channelId) {
        const key = this._key(guildId, channelId);
        if (this.timers[key]) {
            delete this.timers[key];
            await this.save();
            return true;
        }
        return false;
    }

    getTimer(guildId, channelId) {
        const key = this._key(guildId, channelId);
        return this.timers[key] || null;
    }

    listTimers() {
        return Object.values(this.timers);
    }

    _key(guildId, channelId) {
        return `${guildId}_${channelId}`;
    }

    async updateAll() {
        const entries = Object.values(this.timers);
        for (const t of entries) {
            try {
                await this.updateOne(t);
            } catch (err) {
                console.error('Error updating timer', t, err);
            }
        }
        // persist any completed state changes
        await this.save();
    }

    async updateOne(timer) {
        const channel = await this.client.channels.fetch(timer.channelId).catch(() => null);
        if (!channel) return;

        const now = Date.now();
        if (timer.completed || now >= timer.target) {
            // Ensure name is OUT NOW
            const desired = `CH ${timer.chapter} OUT NOW`;
            if (channel.name !== desired) {
                await channel.edit({ name: desired }).catch(err => console.error('Failed to set channel name:', err.message));
            }
            timer.completed = true;
            return;
        }

        // still counting down
        const diff = timer.target - now;
        const parts = MangaScheduler._msToParts(diff);
        const name = `CH ${timer.chapter} IN ${parts.days}D ${parts.hours}H ${parts.minutes}M`;
        if (channel.name !== name) {
            await channel.edit({ name }).catch(err => console.error('Failed to set channel name:', err.message));
        }
    }

    static _msToParts(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        const days = Math.floor(hours / 24);
        const hrs = hours % 24;
        return { days, hours: hrs, minutes: mins, seconds: secs };
    }

    // Returns a Date (UTC) corresponding to the next Wednesday 00:00 in JST (GMT+9)
    static getNextWednesdayUTC(from = new Date()) {
        const jstOffset = 9 * 60 * 60 * 1000;
        const dayInMs = 24 * 60 * 60 * 1000;
        const utcTime = from.getTime();
        const jstTime = utcTime + jstOffset;

        // Get day of week in JST (Jan 1 1970 UTC was Thursday = 4)
        const daysSinceEpoch = Math.floor(jstTime / dayInMs);
        const dayOfWeekJST = (daysSinceEpoch + 4) % 7; // 0=Sun, 3=Wed

        // Calculate days until next Wednesday
        let daysUntilWednesday = (3 - dayOfWeekJST + 7) % 7;

        // If today is Wednesday, check if we're past midnight JST
        if (daysUntilWednesday === 0) {
            const todayMidnightJST = Math.floor(jstTime / dayInMs) * dayInMs;
            if (jstTime >= todayMidnightJST) daysUntilWednesday = 7;
        }

        // Calculate target time: days until Wednesday, at 00:00 JST
        const todayMidnightJST = Math.floor(jstTime / dayInMs) * dayInMs;
        const targetMidnightJST = todayMidnightJST + (daysUntilWednesday * dayInMs);
        const targetUTC = new Date(targetMidnightJST - jstOffset);
        return targetUTC;
    }
}

let schedulerInstance = null;

module.exports = {
    // initialize and attach to client
    async init(client) {
        schedulerInstance = new MangaScheduler(client);
        await schedulerInstance.load();
        schedulerInstance.start();
        // attach for command access
        client.mangaScheduler = schedulerInstance;
        return schedulerInstance;
    },
    // expose helper for commands/tests
    getNextWednesdayUTC: MangaScheduler.getNextWednesdayUTC
};

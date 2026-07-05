class EmojiLoopEngine {
    constructor(client) {
        this.client = client;
        this.interval = null;
        this.runningGuilds = new Set(); // Prevent concurrent execution for the same guild
        this.progress = {}; // guildId => { current: 0, total: 0, phase: 'emojis' }
    }

    start() {
        if (this.interval) clearInterval(this.interval);
        // Check every minute
        this.interval = setInterval(() => this.checkLoops().catch(console.error), 60 * 1000);
        // Run first check immediately
        this.checkLoops().catch(console.error);
    }

    stop() {
        if (this.interval) clearInterval(this.interval);
        this.interval = null;
    }

    async checkLoops() {
        const db = this.client.database;
        if (!db || !db.connected) return;

        const activeLoops = db.listAllEmojiLoops();
        const now = Date.now();

        for (const loop of activeLoops) {
            if (loop.status !== 'active') continue;
            if (now >= loop.next_run) {
                // Trigger the cycle asynchronously so it doesn't block the scheduler loop
                this.runCycle(loop.guild_id, loop.interval_minutes).catch(err => {
                    console.error(`Error executing emoji loop for guild ${loop.guild_id}:`, err);
                });
            }
        }
    }

    async runCycle(guildId, intervalMinutes = 60) {
        // Prevent concurrent runs for the same guild
        if (this.runningGuilds.has(guildId)) {
            console.warn(`[Emoji Loop] Cycle is already running for guild ${guildId}. Skipping.`);
            return;
        }

        const db = this.client.database;
        if (!db || !db.connected) return;

        this.runningGuilds.add(guildId);
        this.progress[guildId] = { current: 0, total: 0, phase: 'starting' };
        console.log(`[Emoji Loop] Starting cache refresh cycle (safe order) for guild ${guildId}`);

        try {
            const guild = this.client.guilds.cache.get(guildId)
                || await this.client.guilds.fetch(guildId).catch(() => null);

            if (!guild) {
                console.warn(`[Emoji Loop] Guild ${guildId} not found. Skipping.`);
                this.runningGuilds.delete(guildId);
                delete this.progress[guildId];
                return;
            }

            // 1. Refresh emojis (Download -> Recreate first -> Delete old second)
            const emojis = await guild.emojis.fetch().catch(() => null);
            if (emojis && emojis.size > 0) {
                console.log(`[Emoji Loop] Safe-refreshing ${emojis.size} emojis in ${guild.name}`);
                this.progress[guildId] = { current: 0, total: emojis.size, phase: 'emojis' };

                for (const [id, emoji] of emojis) {
                    const originalName = emoji.name;
                    // Use imageURL() to avoid deprecation warnings
                    const emojiUrl = emoji.imageURL();
                    try {
                        // A. Fetch image buffer with 15-second timeout
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 15000);
                        let buffer;
                        try {
                            const res = await fetch(emojiUrl, { signal: controller.signal });
                            if (!res.ok) {
                                throw new Error(`HTTP ${res.status}`);
                            }
                            const arrayBuffer = await res.arrayBuffer();
                            buffer = Buffer.from(arrayBuffer);
                        } finally {
                            clearTimeout(timeoutId);
                        }

                        // B. Recreate emoji first (safeguard)
                        await guild.emojis.create({ attachment: buffer, name: originalName }, 'Emoji Loop: Cache Refresh Re-creation');

                        // C. Delete original emoji only after recreation succeeds
                        await emoji.delete('Emoji Loop: Cache Refresh Deletion');

                        console.log(`[Emoji Loop] Successfully refreshed emoji: ${originalName}`);
                    } catch (err) {
                        console.warn(`[Emoji Loop] Failed to refresh emoji ${originalName}:`, err.message);
                        
                        // Detect rate limit error
                        if (err.name === 'RateLimitError' || err.retryAfter !== undefined || err.status === 429 || err.code === 429) {
                            const retryAfter = err.retryAfter || 2400 * 1000; // default 40 minutes if missing
                            const rateLimitError = new Error(`Rate limit hit (retry after ${Math.ceil(retryAfter / 60000)}m)`);
                            rateLimitError.retryAfter = retryAfter;
                            throw rateLimitError;
                        }
                    }
                    this.progress[guildId].current++;
                    // Delay 3.5 seconds to respect rate limits
                    await new Promise(resolve => setTimeout(resolve, 3500));
                }
            }

            // 2. Refresh stickers (Download -> Recreate first -> Delete old second)
            const stickers = await guild.stickers.fetch().catch(() => null);
            if (stickers && stickers.size > 0) {
                const editableStickers = stickers.filter(s => s.editable);
                if (editableStickers.size > 0) {
                    console.log(`[Emoji Loop] Safe-refreshing ${editableStickers.size} stickers in ${guild.name}`);
                    this.progress[guildId] = { current: 0, total: editableStickers.size, phase: 'stickers' };

                    for (const [id, sticker] of editableStickers) {
                        const originalName = sticker.name;
                        const stickerUrl = sticker.url;
                        const stickerTags = sticker.tags || 'refresh';
                        const stickerDesc = sticker.description || '';
                        try {
                            // A. Fetch sticker buffer with 15-second timeout
                            const controller = new AbortController();
                            const timeoutId = setTimeout(() => controller.abort(), 15000);
                            let buffer;
                            try {
                                const res = await fetch(stickerUrl, { signal: controller.signal });
                                if (!res.ok) {
                                    throw new Error(`HTTP ${res.status}`);
                                }
                                const arrayBuffer = await res.arrayBuffer();
                                buffer = Buffer.from(arrayBuffer);
                            } finally {
                                clearTimeout(timeoutId);
                            }

                            // B. Recreate sticker first (safeguard)
                            await guild.stickers.create({
                                file: buffer,
                                name: originalName,
                                tags: stickerTags,
                                description: stickerDesc
                            }, 'Sticker Loop: Cache Refresh Re-creation');

                            // C. Delete original sticker only after recreation succeeds
                            await sticker.delete('Sticker Loop: Cache Refresh Deletion');

                            console.log(`[Emoji Loop] Successfully refreshed sticker: ${originalName}`);
                        } catch (err) {
                            console.warn(`[Emoji Loop] Failed to refresh sticker ${originalName}:`, err.message);

                            // Detect rate limit error
                            if (err.name === 'RateLimitError' || err.retryAfter !== undefined || err.status === 429 || err.code === 429) {
                                const retryAfter = err.retryAfter || 2400 * 1000;
                                const rateLimitError = new Error(`Rate limit hit (retry after ${Math.ceil(retryAfter / 60000)}m)`);
                                rateLimitError.retryAfter = retryAfter;
                                throw rateLimitError;
                            }
                        }
                        this.progress[guildId].current++;
                        // Delay 3.5 seconds to respect rate limits
                        await new Promise(resolve => setTimeout(resolve, 3500));
                    }
                }
            }

            console.log(`[Emoji Loop] Successfully finished cache refresh cycle for guild ${guild.name}`);

            // Update execution stats in database if configuration still exists
            const currentConfig = db.getEmojiLoop(guildId);
            if (currentConfig) {
                const actualInterval = currentConfig.interval_minutes;
                const nextRun = Date.now() + actualInterval * 60 * 1000;
                db.updateEmojiLoopRun(guildId, Date.now(), nextRun);
            }

        } catch (error) {
            console.error(`[Emoji Loop] Error during execution cycle for guild ${guildId}:`, error);

            if (error.message.includes('Rate limit hit')) {
                const retryAfterMs = error.retryAfter || 2400 * 1000; // Default 40 minutes
                const nextRun = Date.now() + retryAfterMs;

                // Reschedule loop next_run in database
                const currentConfig = db.getEmojiLoop(guildId);
                if (currentConfig) {
                    db.updateEmojiLoopRun(guildId, Date.now(), nextRun);
                }

                // Set status to rate-limited
                this.progress[guildId] = {
                    phase: 'rate-limited',
                    error: error.message,
                    retryAt: nextRun
                };

                // Retain status for 10 minutes, then clean up
                setTimeout(() => {
                    if (this.progress[guildId] && this.progress[guildId].phase === 'rate-limited') {
                        delete this.progress[guildId];
                    }
                }, 10 * 60 * 1000);
            }
        } finally {
            this.runningGuilds.delete(guildId);
            // Don't delete progress if we are in rate-limited phase, as status command needs to display it
            if (this.progress[guildId] && this.progress[guildId].phase !== 'rate-limited') {
                delete this.progress[guildId];
            }
        }
    }
}

let engineInstance = null;

module.exports = {
    async init(client) {
        engineInstance = new EmojiLoopEngine(client);
        engineInstance.start();
        client.emojiLoopEngine = engineInstance;
        return engineInstance;
    },
    getEngine() {
        return engineInstance;
    }
};

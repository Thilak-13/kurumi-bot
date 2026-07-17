class EmojiLoopEngine {
    constructor(client) {
        this.client = client;
        this.interval = null;
        this.runningGuilds = new Set(); // Prevent concurrent execution for the same guild
        this.progress = {}; // guildId => { lastItem, type, remaining, refreshed, nextRun, rateLimitTime }
    }

    start() {
        if (this.interval) clearInterval(this.interval);
        // Check every 10 seconds for precise execution timing
        this.interval = setInterval(() => this.checkLoops().catch(console.error), 10 * 1000);
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
                this.runCycle(loop.guild_id).catch(err => {
                    console.error(`Error executing emoji loop step for guild ${loop.guild_id}:`, err);
                });
            }
        }
    }

    async runCycle(guildId) {
        // Prevent concurrent runs for the same guild
        if (this.runningGuilds.has(guildId)) {
            return;
        }

        const db = this.client.database;
        if (!db || !db.connected) return;

        this.runningGuilds.add(guildId);

        try {
            const guild = this.client.guilds.cache.get(guildId)
                || await this.client.guilds.fetch(guildId).catch(() => null);

            if (!guild) {
                console.warn(`[Emoji Loop] Guild ${guildId} not found. Skipping.`);
                this.runningGuilds.delete(guildId);
                return;
            }

            // Load loop config from DB
            const config = db.getEmojiLoop(guildId);
            if (!config) {
                this.runningGuilds.delete(guildId);
                return;
            }

            let pendingItems = [];
            try {
                pendingItems = JSON.parse(config.pending_items || '[]');
            } catch (e) {
                pendingItems = [];
            }

            // If queue is empty, rebuild it!
            if (!Array.isArray(pendingItems) || pendingItems.length === 0) {
                console.log(`[Emoji Loop] Queue is empty for ${guild.name}. Rebuilding circular queue (stickers first)...`);
                
                // Fetch stickers (prioritized first)
                const stickers = await guild.stickers.fetch().catch(() => null);
                const editableStickers = stickers 
                    ? Array.from(stickers.values())
                        .filter(s => s.editable)
                        .sort((a, b) => a.name.localeCompare(b.name))
                    : [];
                
                // Fetch emojis (second)
                const emojis = await guild.emojis.fetch().catch(() => null);
                const sortedEmojis = emojis
                    ? Array.from(emojis.values())
                        .sort((a, b) => a.name.localeCompare(b.name))
                    : [];

                pendingItems = [
                    ...editableStickers.map(s => ({
                        id: s.id,
                        name: s.name,
                        type: 'sticker',
                        url: s.url,
                        tags: s.tags || 'refresh',
                        description: s.description || ''
                    })),
                    ...sortedEmojis.map(e => ({
                        id: e.id,
                        name: e.name,
                        type: 'emoji',
                        url: e.imageURL()
                    }))
                ];

                if (pendingItems.length === 0) {
                    console.log(`[Emoji Loop] No emojis or stickers found to refresh in ${guild.name}.`);
                    // Check again in 1 hour
                    const nextRun = Date.now() + 60 * 60 * 1000;
                    db.updateEmojiLoopRun(guildId, Date.now(), nextRun);
                    this.runningGuilds.delete(guildId);
                    return;
                }
            }

            // Get next item from the queue
            const item = pendingItems.shift();
            console.log(`[Emoji Loop] Processing: ${item.name} (${item.type}) in ${guild.name}. Pending queue: ${pendingItems.length} items.`);

            let refreshed = false;
            let rateLimitError = null;

            if (item.type === 'emoji') {
                // Find emoji by ID or fall back to name search
                let emoji = guild.emojis.cache.get(item.id)
                    || guild.emojis.cache.find(e => e.name === item.name)
                    || await guild.emojis.fetch(item.id).catch(() => null);

                if (emoji) {
                    const originalName = emoji.name;
                    const emojiUrl = emoji.imageURL();
                    try {
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 15000);
                        let buffer;
                        try {
                            const res = await fetch(emojiUrl, { signal: controller.signal });
                            if (!res.ok) throw new Error(`HTTP ${res.status}`);
                            const arrayBuffer = await res.arrayBuffer();
                            buffer = Buffer.from(arrayBuffer);
                        } finally {
                            clearTimeout(timeoutId);
                        }

                        // Create first (safeguard)
                        await guild.emojis.create({ attachment: buffer, name: originalName }, 'Emoji Loop: Cache Refresh Re-creation');
                        // Delete second
                        await emoji.delete('Emoji Loop: Cache Refresh Deletion');

                        console.log(`[Emoji Loop] Successfully refreshed emoji: ${originalName}`);
                        refreshed = true;
                    } catch (err) {
                        console.warn(`[Emoji Loop] Failed to refresh emoji ${originalName}:`, err.message);
                        if (err.name === 'RateLimitError' || err.retryAfter !== undefined || err.status === 429 || err.code === 429) {
                            rateLimitError = err;
                        }
                    }
                } else {
                    console.warn(`[Emoji Loop] Emoji ${item.name} (ID: ${item.id}) no longer exists. Skipping.`);
                }
            } else if (item.type === 'sticker') {
                // Find sticker by ID
                let sticker = guild.stickers.cache.get(item.id)
                    || await guild.stickers.fetch(item.id).catch(() => null);

                if (sticker && sticker.editable) {
                    const originalName = sticker.name;
                    const stickerUrl = sticker.url;
                    const stickerTags = sticker.tags || item.tags || 'refresh';
                    const stickerDesc = sticker.description || item.description || '';

                    try {
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 15000);
                        let buffer;
                        try {
                            const res = await fetch(stickerUrl, { signal: controller.signal });
                            if (!res.ok) throw new Error(`HTTP ${res.status}`);
                            const arrayBuffer = await res.arrayBuffer();
                            buffer = Buffer.from(arrayBuffer);
                        } finally {
                            clearTimeout(timeoutId);
                        }

                        // Create first (safeguard)
                        await guild.stickers.create({
                            file: buffer,
                            name: originalName,
                            tags: stickerTags,
                            description: stickerDesc
                        }, 'Sticker Loop: Cache Refresh Re-creation');
                        // Delete second
                        await sticker.delete('Sticker Loop: Cache Refresh Deletion');

                        console.log(`[Emoji Loop] Successfully refreshed sticker: ${originalName}`);
                        refreshed = true;
                    } catch (err) {
                        console.warn(`[Emoji Loop] Failed to refresh sticker ${originalName}:`, err.message);
                        if (err.name === 'RateLimitError' || err.retryAfter !== undefined || err.status === 429 || err.code === 429) {
                            rateLimitError = err;
                        }
                    }
                } else {
                    console.warn(`[Emoji Loop] Sticker ${item.name} (ID: ${item.id}) no longer exists or is not editable. Skipping.`);
                }
            }

            let nextRunDelay = 90 * 1000; // Default 90 seconds

            if (rateLimitError) {
                // Return item back to front of queue to retry
                pendingItems.unshift(item);
                
                const retryAfterMs = rateLimitError.retryAfter || 2400 * 1000; // Cooldown (40m)
                nextRunDelay = retryAfterMs;
                console.error(`[Emoji Loop] Rate limit hit. Queue deferred for ${Math.ceil(retryAfterMs / 60000)} minute(s).`);

                this.progress[guildId] = {
                    lastItem: item.name,
                    type: item.type,
                    remaining: pendingItems.length,
                    refreshed: false,
                    nextRun: Date.now() + nextRunDelay,
                    rateLimitTime: Date.now() + retryAfterMs
                };
            } else {
                this.progress[guildId] = {
                    lastItem: item.name,
                    type: item.type,
                    remaining: pendingItems.length,
                    refreshed: refreshed,
                    nextRun: Date.now() + nextRunDelay,
                    rateLimitTime: null
                };
            }

            // Save updated pending list and schedule next run
            const nextRunTime = Date.now() + nextRunDelay;
            db.updateEmojiLoopQueue(guildId, pendingItems, Date.now(), nextRunTime);

        } catch (error) {
            console.error(`[Emoji Loop] Error during execution cycle for guild ${guildId}:`, error);
        } finally {
            this.runningGuilds.delete(guildId);
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

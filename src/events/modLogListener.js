const { ChannelType } = require('discord.js');
const config = require('../config/config');

// Fallback channel IDs when no per-guild forumLogger settings exist in the DB.
const MOD_LOG_CHANNEL_ID = config.modLogChannelId;
const FORUM_CHANNEL_ID = config.moderationForumChannelId;
const SAPPHIRE_BOT_ID = config.sapphireBotId;
const CASE_HISTORY_LOOKBACK_LIMIT = 100;

// Prevent duplicate thread creation when many logs for the same user arrive at once.
const pendingThreadCreates = new Map();

function collectTextParts(message) {
    const parts = [];

    if (typeof message?.content === 'string' && message.content.length > 0) {
        parts.push(message.content);
    }

    for (const embed of message?.embeds || []) {
        if (embed.title) parts.push(embed.title);
        if (embed.description) parts.push(embed.description);
        if (embed.footer?.text) parts.push(embed.footer.text);
        if (embed.author?.name) parts.push(embed.author.name);

        for (const field of embed.fields || []) {
            if (field.name) parts.push(field.name);
            if (field.value) parts.push(field.value);
        }
    }

    return parts;
}

function collectMessageText(message) {
    return collectTextParts(message).join('\n');
}

function extractCaseId(message) {
    const text = collectMessageText(message);
    if (!text) return null;

    const patterns = [
        /\bcase\b\s*[#:\-]?\s*`([A-Za-z0-9_-]{3,40})`/i,
        /\bcase\b\s*[#:\-]?\s*([A-Za-z0-9_-]{3,40})\b/i
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match?.[1]) return match[1];
    }

    return null;
}

function isCaseDeleteMessage(message) {
    const text = collectMessageText(message).toLowerCase();
    if (!text) return false;

    return /\bcase\b/.test(text) && /\b(delete|deleted|remove|removed)\b/.test(text);
}

function messageContainsCaseId(message, caseId) {
    if (!caseId) return false;
    const text = collectMessageText(message);
    if (!text) return false;

    const escapedCaseId = caseId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escapedCaseId}\\b`, 'i').test(text);
}

function extractUserIdDirect(message) {
    if (!message) return null;

    const ignoredIds = new Set([
        SAPPHIRE_BOT_ID,
        message.author?.id,
        message.interaction?.user?.id,
        message.interactionMetadata?.user?.id
    ].filter(Boolean));

    const pickValidId = (ids) => ids.find((id) => id && !ignoredIds.has(id)) || null;

    const extractFirstId = (text) => {
        if (!text) return null;

        const mentionMatch = String(text).match(/<@!?(\d{17,20})>/);
        if (mentionMatch?.[1]) return mentionMatch[1];

        const rawIdMatch = String(text).match(/\b(\d{17,20})\b/);
        return rawIdMatch?.[1] || null;
    };

    const collectModeratorIdsFromText = (text) => {
        if (!text) return [];

        const ids = [];
        const patterns = [
            /\b(?:by|moderator|mod|staff|actioned by|handled by)\b\s*[:\-]?\s*<@!?(\d{17,20})>/gi,
            /\b(?:by|moderator|mod|staff|actioned by|handled by)\b\s*[:\-]?\s*(\d{17,20})\b/gi
        ];

        for (const pattern of patterns) {
            for (const match of text.matchAll(pattern)) {
                if (match?.[1]) ids.push(match[1]);
            }
        }

        return ids;
    };

    for (const embed of message.embeds || []) {
        for (const field of embed.fields || []) {
            if (!/target|user|member|offender|punished/i.test(field.name || '')) continue;
            const fieldId = extractFirstId(field.value || '');
            if (fieldId && !ignoredIds.has(fieldId)) return fieldId;
        }
    }

    const textParts = collectTextParts(message);

    const combined = textParts.join('\n');
    if (!combined) return null;

    for (const moderatorId of collectModeratorIdsFromText(combined)) {
        ignoredIds.add(moderatorId);
    }

    const caseDeletePatterns = [
        /\bcase\b[^\n]*\b(?:delete|deleted|remove|removed)\b[^\n]*\b(?:for|target|user|member|offender)\b\s*[:\-]?\s*(?:<@!?(\d{17,20})>|(\d{17,20})\b)/i,
        /\b(?:for|target|user|member|offender)\b\s*[:\-]?\s*(?:<@!?(\d{17,20})>|(\d{17,20})\b)[^\n]*\bcase\b[^\n]*\b(?:delete|deleted|remove|removed)\b/i,
        /\bdeleted\s+case\b[^\n]*\b(?:for|target|user|member|offender)\b\s*[:\-]?\s*(?:<@!?(\d{17,20})>|(\d{17,20})\b)/i
    ];

    for (const pattern of caseDeletePatterns) {
        const match = combined.match(pattern);
        const idFromPattern = match?.[1] || match?.[2] || null;
        if (idFromPattern && !ignoredIds.has(idFromPattern)) {
            return idFromPattern;
        }
    }

    const actionTargetPatterns = [
        /\b(?:unban(?:ned)?|ban(?:ned)?|unmute(?:d)?|mute(?:d)?|timeout(?: removed)?|timed out|kick(?:ed)?)\b[^\n]*?(<@!?(\d{17,20})>|\b(\d{17,20})\b)/i,
        /(<@!?(\d{17,20})>|\b(\d{17,20})\b)[^\n]*?\b(?:was|has been)?\s*(?:unbanned|banned|unmuted|muted|timed out|kicked)\b/i
    ];

    for (const pattern of actionTargetPatterns) {
        const match = combined.match(pattern);
        const idFromPattern = match?.[2] || match?.[3] || null;
        if (idFromPattern && !ignoredIds.has(idFromPattern)) {
            return idFromPattern;
        }
    }

    const mentionedIds = Array.from(message.mentions?.users?.values() || []).map((user) => user.id);
    const mentionPick = pickValidId(mentionedIds);
    if (mentionPick) return mentionPick;

    const allIds = Array.from(combined.matchAll(/(?:<@!?(\d{17,20})>|\b(\d{17,20})\b)/g))
        .map((m) => m[1] || m[2])
        .filter(Boolean);

    return pickValidId(allIds);
}

async function extractUserId(message) {
    const directUserId = extractUserIdDirect(message);
    if (directUserId) return directUserId;

    if (!isCaseDeleteMessage(message)) return null;

    const caseId = extractCaseId(message);
    if (!caseId) return null;

    const messages = await message.channel?.messages
        ?.fetch({ limit: CASE_HISTORY_LOOKBACK_LIMIT })
        .catch(() => null);

    if (!messages || messages.size === 0) return null;

    for (const candidateMessage of messages.values()) {
        if (!candidateMessage || candidateMessage.id === message.id) continue;
        if (SAPPHIRE_BOT_ID && candidateMessage.author?.id !== SAPPHIRE_BOT_ID) continue;
        if (!messageContainsCaseId(candidateMessage, caseId)) continue;

        const resolvedUserId = extractUserIdDirect(candidateMessage);
        if (resolvedUserId) return resolvedUserId;
    }

    return null;
}

async function findOrCreateUserThread(guild, userId, forumChannelId = FORUM_CHANNEL_ID) {
    const forum = await guild.channels.fetch(forumChannelId).catch(() => null);
    if (!forum || forum.type !== ChannelType.GuildForum) return null;

    const findMatch = (threadCollection) => {
        if (!threadCollection?.threads) return null;
        return threadCollection.threads.find((thread) => thread.name.includes(userId)) || null;
    };

    const active = await forum.threads.fetchActive().catch(() => null);
    const activeMatch = findMatch(active);
    if (activeMatch) return activeMatch;

    const archived = await forum.threads.fetchArchived().catch(() => null);
    const archivedMatch = findMatch(archived);
    if (archivedMatch) return archivedMatch;

    if (pendingThreadCreates.has(userId)) {
        return pendingThreadCreates.get(userId);
    }

    const createPromise = forum.threads.create({
        name: userId,
        message: {
            content: `Moderation history for ${userId}`
        }
    });

    pendingThreadCreates.set(userId, createPromise);

    try {
        return await createPromise;
    } finally {
        pendingThreadCreates.delete(userId);
    }
}

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        try {
            if (!message?.guild) return;

            const db = message.client.database;
            let modLogChannelId = MOD_LOG_CHANNEL_ID;
            let forumChannelId = FORUM_CHANNEL_ID;
            let enabled = true;

            if (db && db.connected) {
                const settings = db.getGuildSettings(message.guild.id);
                if (settings && settings.forumLogger) {
                    enabled = settings.forumLogger.enabled;
                    modLogChannelId = settings.forumLogger.modLogChannelId;
                    forumChannelId = settings.forumLogger.forumChannelId;
                }
            }

            if (!enabled) return;

            // Listen only to Sapphire logs in the configured moderation log channel.
            if (message.channelId !== modLogChannelId) return;
            if (!SAPPHIRE_BOT_ID || message.author?.id !== SAPPHIRE_BOT_ID) return;

            const userId = await extractUserId(message);
            if (!userId) return;

            const thread = await findOrCreateUserThread(message.guild, userId, forumChannelId);
            if (!thread) return;

            // Mirror the original message payload exactly: content + embeds + attachment URLs.
            await thread.send({
                content: message.content || null,
                embeds: message.embeds.map((embed) => embed.toJSON()),
                files: message.attachments.map((attachment) => attachment.url)
            });
        } catch (error) {
            console.error('❌ Error in modLogListener messageCreate execution:', error);
        }
    },

    extractUserId,
    findOrCreateUserThread
};

const fs = require('fs/promises');
const path = require('path');
const { AuditLogEvent, ChannelType, EmbedBuilder } = require('discord.js');
const config = require('../config/config');

const THREAD_MAP_PATH = path.join(config.dataDir, 'moderation-thread-map.json');
const MATCH_WINDOW_SECONDS = 90;
const MOD_LOG_FETCH_LIMIT = 100;

class HybridModerationLogger {
    constructor(client) {
        this.client = client;
        this.processedAuditEntryIds = new Set();
        this.processedModLogMessageIds = new Set();
        this.threadMap = new Map();
        this.mapLoaded = false;
    }

    async processModLogMessage(message) {
        if (!message?.guild) return false;
        if (config.guildId && message.guild.id !== config.guildId) return false;
        if (!config.modLogChannelId || message.channelId !== config.modLogChannelId) return false;

        if (this.isProcessedModLogMessage(message.id)) return false;

        const parsedMessage = this.parseLogMessage(message);
        const finalLog = this.buildFinalLogFromMessage(message, parsedMessage);
        if (!finalLog) return false;

        this.markProcessedModLogMessage(message.id);
        await this.sendToForumThread(message.guild, finalLog);
        return true;
    }

    async fetchAuditEvent(auditLogEntry, guild) {
        if (!auditLogEntry || !guild) return null;

        const action = this.mapAuditAction(auditLogEntry);
        if (!action) return null;

        const userId = auditLogEntry.targetId;
        if (!userId) return null;

        return {
            entryId: auditLogEntry.id,
            guild,
            userId,
            action,
            executorId: auditLogEntry.executorId || null,
            executorTag: auditLogEntry.executor?.tag || null,
            timestamp: auditLogEntry.createdTimestamp || Date.now(),
            auditReason: auditLogEntry.reason || null,
            duration: this.extractTimeoutDuration(auditLogEntry)
        };
    }

    async findMatchingLogMessage(guild, auditEvent) {
        const modLogChannelId = config.modLogChannelId;
        if (!modLogChannelId) return null;

        const channel = await guild.channels.fetch(modLogChannelId).catch(() => null);
        if (!channel || !channel.isTextBased() || channel.type === ChannelType.GuildForum) {
            return null;
        }

        const messages = await channel.messages.fetch({ limit: MOD_LOG_FETCH_LIMIT }).catch(() => null);
        if (!messages || messages.size === 0) return null;

        let bestMatch = null;
        let bestScore = Number.NEGATIVE_INFINITY;

        for (const message of messages.values()) {
            if (!this.messageContainsUser(message, auditEvent.userId)) continue;

            const deltaSeconds = Math.abs((auditEvent.timestamp - message.createdTimestamp) / 1000);
            if (deltaSeconds > MATCH_WINDOW_SECONDS) continue;

            const score = this.scoreMessageMatch(message, auditEvent, deltaSeconds);
            if (score > bestScore) {
                bestScore = score;
                bestMatch = message;
            }
        }

        return bestMatch;
    }

    scoreMessageMatch(message, auditEvent, deltaSeconds) {
        // Higher score means better match. We prefer action-aligned logs first,
        // then closest timestamp as tie breaker.
        let score = 100 - Math.min(deltaSeconds, 100);

        if (this.messageMatchesAction(message, auditEvent.action)) {
            score += 80;
        }

        if (message.mentions?.users?.has(auditEvent.userId)) {
            score += 40;
        }

        const parsed = this.parseLogMessage(message);
        if (parsed.moderatorId) {
            score += 25;
        }

        if (parsed.reason && parsed.reason.toLowerCase() !== 'no reason') {
            score += 15;
        }

        return score;
    }

    parseLogMessage(message) {
        if (!message) {
            return {
                moderator: null,
                moderatorId: null,
                reason: null,
                attachments: []
            };
        }

        const attachments = Array.from(message.attachments.values()).map((attachment) => ({
            name: attachment.name || 'attachment',
            url: attachment.url,
            contentType: attachment.contentType || null,
            size: attachment.size || null
        }));

        let moderator = null;
        let moderatorId = null;
        let reason = null;

        const interactionModeratorId = message.interaction?.user?.id
            || message.interactionMetadata?.user?.id
            || null;

        if (interactionModeratorId) {
            moderatorId = interactionModeratorId;
            moderator = `<@${interactionModeratorId}>`;
        }

        if (message.content) {
            if (!moderator) {
                moderator = this.extractModeratorFromText(message.content);
                moderatorId = this.extractFirstUserId(moderator) || moderatorId;
            }
            reason = this.extractReasonFromText(message.content);
        }

        for (const embed of message.embeds || []) {
            if (!moderator) {
                moderator = this.extractModeratorFromEmbed(embed);
                moderatorId = this.extractFirstUserId(moderator) || moderatorId;
            }
            if (!reason) {
                reason = this.extractReasonFromEmbed(embed);
            }

            if (moderator && reason) break;
        }

        return {
            moderator,
            moderatorId,
            reason,
            attachments
        };
    }

    buildFinalLogFromMessage(message, parsedMessage) {
        const userId = this.extractTargetUserIdFromMessage(message, parsedMessage?.moderatorId || null);
        const action = this.extractActionFromMessage(message);
        if (!userId || !action) return null;

        const moderatorId = parsedMessage?.moderatorId || null;
        const fallbackModerator = moderatorId
            ? `<@${moderatorId}>`
            : (parsedMessage?.moderator || 'Unknown');

        return {
            entryId: null,
            userId,
            action,
            moderator: parsedMessage?.moderator || fallbackModerator,
            moderatorId,
            duration: this.extractDurationFromMessage(message),
            reason: parsedMessage?.reason || 'No reason',
            attachments: parsedMessage?.attachments || [],
            timestamp: message.createdTimestamp || Date.now()
        };
    }

    buildFinalLog(auditEvent, parsedMessage) {
        const moderatorId = parsedMessage?.moderatorId
            || (parsedMessage?.moderator ? null : (auditEvent.executorId || null));
        const fallbackModerator = auditEvent.executorTag
            || (auditEvent.executorId ? `<@${auditEvent.executorId}>` : 'Unknown');

        return {
            entryId: auditEvent.entryId,
            userId: auditEvent.userId,
            action: auditEvent.action,
            moderator: parsedMessage?.moderator || fallbackModerator,
            moderatorId,
            duration: auditEvent.duration || null,
            reason: parsedMessage?.reason || auditEvent.auditReason || 'No reason',
            attachments: parsedMessage?.attachments || [],
            timestamp: auditEvent.timestamp
        };
    }

    async sendToForumThread(guild, finalLog) {
        const forumChannelId = config.moderationForumChannelId;
        if (!forumChannelId) return;

        const forumChannel = await guild.channels.fetch(forumChannelId).catch(() => null);
        if (!forumChannel || forumChannel.type !== ChannelType.GuildForum) return;

        await this.ensureThreadMapLoaded();

        const thread = await this.resolveUserThread(forumChannel, finalLog.userId);
        if (!thread) return;

        const embed = new EmbedBuilder()
            .setTitle('Moderation Action')
            .setColor(0xED4245)
            .addFields(
                { name: 'User', value: `<@${finalLog.userId}> (${finalLog.userId})`, inline: false },
                { name: 'Action', value: finalLog.action || 'Unknown', inline: true },
                {
                    name: 'Moderator',
                    value: finalLog.moderatorId
                        ? `<@${finalLog.moderatorId}> (${finalLog.moderator || finalLog.moderatorId})`
                        : (finalLog.moderator || 'Unknown'),
                    inline: true
                },
                {
                    name: 'Duration',
                    value: finalLog.duration || 'N/A',
                    inline: true
                },
                {
                    name: 'Reason',
                    value: finalLog.reason || 'No reason',
                    inline: false
                },
                {
                    name: 'Date',
                    value: `<t:${Math.floor(finalLog.timestamp / 1000)}:F>`,
                    inline: false
                }
            )
            .setTimestamp(new Date(finalLog.timestamp));

        const attachmentLines = (finalLog.attachments || [])
            .map((attachment) => attachment.url)
            .filter(Boolean);

        const content = attachmentLines.length
            ? `Attachments:\n${attachmentLines.join('\n')}`
            : null;

        await thread.send({
            content,
            embeds: [embed],
            allowedMentions: { parse: [] }
        });
    }

    isDuplicate(entryId) {
        if (!entryId) return false;
        return this.processedAuditEntryIds.has(entryId);
    }

    isProcessedModLogMessage(messageId) {
        if (!messageId) return false;
        return this.processedModLogMessageIds.has(messageId);
    }

    markProcessed(entryId) {
        if (!entryId) return;

        this.processedAuditEntryIds.add(entryId);

        if (this.processedAuditEntryIds.size > 1000) {
            const oldest = this.processedAuditEntryIds.values().next().value;
            this.processedAuditEntryIds.delete(oldest);
        }
    }

    markProcessedModLogMessage(messageId) {
        if (!messageId) return;

        this.processedModLogMessageIds.add(messageId);

        if (this.processedModLogMessageIds.size > 2000) {
            const oldest = this.processedModLogMessageIds.values().next().value;
            this.processedModLogMessageIds.delete(oldest);
        }
    }

    mapAuditAction(auditLogEntry) {
        switch (auditLogEntry.action) {
            case AuditLogEvent.MemberBanAdd:
                return 'Ban';
            case AuditLogEvent.MemberKick:
                return 'Kick';
            case AuditLogEvent.MemberUpdate:
                return this.mapTimeoutAction(auditLogEntry);
            default:
                return null;
        }
    }

    mapTimeoutAction(auditLogEntry) {
        const timeoutChange = (auditLogEntry.changes || []).find(
            (change) => change?.key === 'communication_disabled_until'
        );

        if (!timeoutChange) return null;

        if (timeoutChange.new) return 'Timeout';
        if (timeoutChange.old && !timeoutChange.new) return 'Timeout Removed';
        return null;
    }

    extractTimeoutDuration(auditLogEntry) {
        if (auditLogEntry.action !== AuditLogEvent.MemberUpdate) return null;

        const timeoutChange = (auditLogEntry.changes || []).find(
            (change) => change?.key === 'communication_disabled_until'
        );

        if (!timeoutChange?.new) return null;

        const timeoutEndMs = new Date(timeoutChange.new).getTime();
        const eventTimeMs = auditLogEntry.createdTimestamp || Date.now();

        if (!Number.isFinite(timeoutEndMs) || timeoutEndMs <= eventTimeMs) return null;

        const remainingMs = timeoutEndMs - eventTimeMs;
        const totalMinutes = Math.round(remainingMs / 60000);

        if (totalMinutes < 60) return `${totalMinutes}m`;

        const totalHours = Math.round(totalMinutes / 60);
        if (totalHours < 24) return `${totalHours}h`;

        return `${Math.round(totalHours / 24)}d`;
    }

    messageContainsUser(message, userId) {
        if (!message || !userId) return false;

        if (message.mentions?.users?.has(userId)) return true;

        if ((message.content || '').includes(userId)) return true;

        for (const embed of message.embeds || []) {
            if ((embed.title || '').includes(userId)) return true;
            if ((embed.description || '').includes(userId)) return true;

            for (const field of embed.fields || []) {
                const combined = `${field.name || ''} ${field.value || ''}`;
                if (combined.includes(userId)) return true;
            }

            if ((embed.footer?.text || '').includes(userId)) return true;
        }

        return false;
    }

    messageMatchesAction(message, action) {
        if (!message || !action) return false;

        const haystack = [message.content || ''];

        for (const embed of message.embeds || []) {
            if (embed.title) haystack.push(embed.title);
            if (embed.description) haystack.push(embed.description);
            if (embed.footer?.text) haystack.push(embed.footer.text);

            for (const field of embed.fields || []) {
                haystack.push(`${field.name || ''} ${field.value || ''}`);
            }
        }

        const content = haystack.join('\n').toLowerCase();

        switch (action) {
            case 'Ban':
                return /\bban(ned)?\b/.test(content);
            case 'Kick':
                return /\bkick(ed)?\b/.test(content);
            case 'Timeout':
                return /\b(timeout|timed out|mute|muted)\b/.test(content);
            case 'Timeout Removed':
                return /\b(timeout removed|untimeout|unmute|removed timeout)\b/.test(content);
            default:
                return false;
        }
    }

    extractModeratorFromText(text) {
        if (!text) return null;

        const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);

        for (const line of lines) {
            const pairMatch = line.match(/^(?:\*\*)?\s*(moderator|mod|staff|by|actioned by|handled by)\s*(?:\*\*)?\s*[:\-]\s*(.+)$/i);
            if (pairMatch?.[2]) return pairMatch[2].trim();
        }

        const byMentionMatch = text.match(/\b(?:by|moderator|mod|staff)\b\s*[:\-]?\s*(<@!?\d+>)/i);
        if (byMentionMatch?.[1]) return byMentionMatch[1];

        const actionSentenceMatch = text.match(/\b(?:banned|kicked|timed out|muted|warned)\b[^\n]*\bby\b\s*(<@!?\d+>|\d{16,20})/i);
        if (actionSentenceMatch?.[1]) return actionSentenceMatch[1];

        return null;
    }

    extractReasonFromText(text) {
        if (!text) return null;

        const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);

        for (const line of lines) {
            const pairMatch = line.match(/^(?:\*\*)?\s*(reason)\s*(?:\*\*)?\s*[:\-]\s*(.+)$/i);
            if (pairMatch?.[2]) return pairMatch[2].trim();
        }

        return null;
    }

    extractModeratorFromEmbed(embed) {
        if (!embed) return null;

        const fields = embed.fields || [];

        for (const field of fields) {
            if (/moderator|mod|staff|actioned by|handled by|by/i.test(field.name || '')) {
                return String(field.value || '').trim() || null;
            }
        }

        if (embed.footer?.text) {
            const footerMatch = embed.footer.text.match(/(?:moderator|mod|staff|by)\s*[:\-]\s*(.+)$/i);
            if (footerMatch?.[1]) return footerMatch[1].trim();
        }

        if (embed.description) {
            const byDescriptionMatch = embed.description.match(/\b(?:by|moderator|mod|staff)\b\s*[:\-]?\s*(<@!?\d+>|\d{16,20})/i);
            if (byDescriptionMatch?.[1]) return byDescriptionMatch[1];
        }

        if (embed.author?.name) {
            const authorMatch = embed.author.name.match(/\b(?:by|moderator|mod|staff)\b\s*[:\-]?\s*(<@!?\d+>|\d{16,20})/i);
            if (authorMatch?.[1]) return authorMatch[1];
        }

        return null;
    }

    extractReasonFromEmbed(embed) {
        if (!embed) return null;

        const fields = embed.fields || [];

        for (const field of fields) {
            if (/reason/i.test(field.name || '')) {
                return String(field.value || '').trim() || null;
            }
        }

        if (embed.description) {
            const match = embed.description.match(/reason\s*[:\-]\s*([^\n]+)/i);
            if (match?.[1]) return match[1].trim();
        }

        return null;
    }

    extractTargetUserIdFromMessage(message, moderatorId = null) {
        if (!message) return null;

        const candidates = [];

        for (const embed of message.embeds || []) {
            for (const field of embed.fields || []) {
                if (!/target|user|member|offender|punished/i.test(field.name || '')) continue;
                const value = String(field.value || '');
                const id = this.extractFirstUserId(value);
                if (id) candidates.push(id);
            }
        }

        const text = this.collectMessageText(message);

        const actionTargetPatterns = [
            /\bcase\b[^\n]*\b(?:delete|deleted|remove|removed)\b[^\n]*\b(?:for|target|user|member|offender)\b\s*[:\-]?\s*(<@!?\d+>|\d{16,20})/i,
            /\b(?:for|target|user|member|offender)\b\s*[:\-]?\s*(<@!?\d+>|\d{16,20})[^\n]*\bcase\b[^\n]*\b(?:delete|deleted|remove|removed)\b/i,
            /\b(?:ban(?:ned)?|kick(?:ed)?|timeout|timed out|mute(?:d)?|warn(?:ed)?)\b[^\n]*?(<@!?\d+>|\d{16,20})/i,
            /(<@!?\d+>|\d{16,20})\b[^\n]*?\b(?:was|has been)?\s*(?:banned|kicked|timed out|muted|warned)\b/i
        ];

        for (const pattern of actionTargetPatterns) {
            const match = text.match(pattern);
            const id = this.extractFirstUserId(match?.[1] || null);
            if (id) candidates.push(id);
        }

        for (const mention of message.mentions?.users?.values() || []) {
            candidates.push(mention.id);
        }

        for (const candidate of candidates) {
            if (!candidate) continue;
            if (moderatorId && candidate === moderatorId) continue;
            return candidate;
        }

        return null;
    }

    extractActionFromMessage(message) {
        const text = this.collectMessageText(message).toLowerCase();

        if (/\bcase\b[^\n]*\b(delete|deleted|remove|removed)\b/.test(text)) return 'Case Deleted';
        if (/\b(timeout removed|untimeout|unmute|removed timeout)\b/.test(text)) return 'Timeout Removed';
        if (/\b(timeout|timed out|mute|muted)\b/.test(text)) return 'Timeout';
        if (/\bkick(ed)?\b/.test(text)) return 'Kick';
        if (/\bban(ned)?\b/.test(text)) return 'Ban';
        if (/\bwarn(ed)?\b/.test(text)) return 'Warn';

        return null;
    }

    extractDurationFromMessage(message) {
        const text = this.collectMessageText(message);

        for (const embed of message.embeds || []) {
            for (const field of embed.fields || []) {
                if (/duration|length|time/i.test(field.name || '')) {
                    const value = String(field.value || '').trim();
                    if (value) return value;
                }
            }
        }

        const durationMatch = text.match(/\b(?:duration|length|for)\b\s*[:\-]?\s*([^\n]+)/i);
        if (durationMatch?.[1]) return durationMatch[1].trim();

        const shorthandMatch = text.match(/\b(\d+\s*(?:s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks))\b/i);
        if (shorthandMatch?.[1]) return shorthandMatch[1].trim();

        return null;
    }

    collectMessageText(message) {
        const parts = [message?.content || ''];

        for (const embed of message?.embeds || []) {
            if (embed.title) parts.push(embed.title);
            if (embed.description) parts.push(embed.description);
            if (embed.footer?.text) parts.push(embed.footer.text);
            if (embed.author?.name) parts.push(embed.author.name);

            for (const field of embed.fields || []) {
                parts.push(`${field.name || ''} ${field.value || ''}`);
            }
        }

        return parts.join('\n');
    }

    extractFirstUserId(text) {
        if (!text) return null;

        const mentionMatch = text.match(/<@!?(\d+)>/);
        if (mentionMatch?.[1]) return mentionMatch[1];

        const idMatch = text.match(/\b(\d{16,20})\b/);
        return idMatch?.[1] || null;
    }

    async ensureThreadMapLoaded() {
        if (this.mapLoaded) return;

        try {
            const raw = await fs.readFile(THREAD_MAP_PATH, 'utf8');
            const parsed = JSON.parse(raw);

            for (const [userId, threadId] of Object.entries(parsed)) {
                this.threadMap.set(userId, threadId);
            }
        } catch {
            // File does not exist yet.
        }

        this.mapLoaded = true;
    }

    async saveThreadMap() {
        const output = Object.fromEntries(this.threadMap.entries());
        await fs.mkdir(path.dirname(THREAD_MAP_PATH), { recursive: true });
        await fs.writeFile(THREAD_MAP_PATH, JSON.stringify(output, null, 2), 'utf8');
    }

    async resolveUserThread(forumChannel, userId) {
        const cachedThreadId = this.threadMap.get(userId);

        if (cachedThreadId) {
            const cachedThread = await forumChannel.threads.fetch(cachedThreadId).catch(() => null);

            if (cachedThread) {
                return cachedThread;
            }

            this.threadMap.delete(userId);
            await this.saveThreadMap();
        }

        const activeThreads = await forumChannel.threads.fetchActive().catch(() => null);

        const activeMatch = activeThreads?.threads?.find(
            (thread) => thread.name === userId || thread.name.includes(userId)
        );

        if (activeMatch) {
            this.threadMap.set(userId, activeMatch.id);
            await this.saveThreadMap();
            return activeMatch;
        }

        const created = await forumChannel.threads.create({
            name: userId,
            message: {
                content: `Moderation history for ${userId}`,
                allowedMentions: { parse: [] }
            }
        }).catch(() => null);

        if (!created) return null;

        this.threadMap.set(userId, created.id);
        await this.saveThreadMap();

        return created;
    }
}

module.exports = HybridModerationLogger;

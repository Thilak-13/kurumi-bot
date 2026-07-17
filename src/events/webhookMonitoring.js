/**
 * Webhook Monitoring
 * Logs all webhook creation/deletion/updates to mod channel
 */

const config = require('../config/config');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    // discord.js v14 renamed this event to 'webhooksUpdate'; the old
    // 'webhookUpdate' name (plus the missing GuildWebhooks intent) meant this
    // listener never fired at all.
    name: 'webhooksUpdate',

    async execute(channel) {
        const guild = channel.guild;
        const modLogChannelId = config.modLogChannelId;
        if (!modLogChannelId) return;

        // Get executor from audit log
        const auditLogs = await guild.fetchAuditLogs({ limit: 1 }).catch(() => null);
        if (!auditLogs || !auditLogs.entries.first()) return;

        const auditEntry = auditLogs.entries.first();
        const executorId = auditEntry.executorId;
        if (!executorId) return;

        const logChannel = await guild.channels.fetch(modLogChannelId).catch(() => null);
        if (!logChannel || !logChannel.isTextBased()) return;

        const executor = await guild.members.fetch(executorId).catch(() => null);
        const executorName = executor ? executor.user.tag : `Unknown (${executorId})`;

        let actionType = '';
        let color = '#3498db';

        // Determine action type from audit log
        if (auditEntry.action === 50) { // WebhookCreate
            actionType = 'WEBHOOK CREATED';
            color = '#2ecc71';
        } else if (auditEntry.action === 51) { // WebhookUpdate
            actionType = 'WEBHOOK UPDATED';
            color = '#f39c12';
        } else if (auditEntry.action === 52) { // WebhookDelete
            actionType = 'WEBHOOK DELETED';
            color = '#e74c3c';
        } else {
            return; // Not a webhook action
        }

        try {
            const embed = new EmbedBuilder()
                .setTitle(`🪝 ${actionType}`)
                .setColor(color)
                .addFields(
                    { name: 'Executor', value: `<@${executorId}> (${executorName})`, inline: true },
                    { name: 'Channel', value: `<#${channel.id}>`, inline: true },
                    { name: 'Webhook Change', value: `${actionType}`, inline: false }
                )
                .setTimestamp();

            // Add reason if available
            if (auditEntry.reason) {
                embed.addFields({ name: 'Reason', value: auditEntry.reason, inline: false });
            }

            await logChannel.send({ embeds: [embed] }).catch(() => {});

            console.log(`[WEBHOOK] ${actionType} in ${guild.name} by ${executorName}`);

        } catch (err) {
            console.error('Error logging webhook action:', err.message);
        }
    }
};

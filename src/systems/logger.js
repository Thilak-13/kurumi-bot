const { EmbedBuilder } = require('discord.js');
const config = require('../config/config');
const persona = require('../lib/persona');

/**
 * Logger system for moderation actions
 * Sends formatted embeds to the configured log channel
 */
class Logger {
    constructor(client) {
        this.client = client;
        this.logChannelId = config.logChannelId;
    }

    /**
     * Get the log channel
     * @returns {Promise<TextChannel|null>}
     */
    async getLogChannel() {
        try {
            if (!this.logChannelId) {
                console.warn('⚠️ Log channel ID not configured in .env');
                return null;
            }

            const channel = await this.client.channels.fetch(this.logChannelId);
            return channel;
        } catch (error) {
            console.error('Failed to fetch log channel:', error);
            return null;
        }
    }

    /**
     * Log a moderation action
     * @param {string} action - Type of moderation action
     * @param {Object} data - Data about the action
     */
    async logModeration(action, data) {
        const channel = await this.getLogChannel();
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setTitle(`🛡️ ${action}`)
            .setColor(this.getActionColor(action))
            .setFooter({ text: persona.footer() })
            .setTimestamp()
            .addFields(
                { name: 'Moderator', value: `${data.moderator.tag} (${data.moderator.id})`, inline: true },
                { name: 'Target', value: `${data.target.tag} (${data.target.id})`, inline: true }
            );

        if (data.reason) {
            embed.addFields({ name: 'Reason', value: data.reason, inline: false });
        }

        if (data.duration) {
            embed.addFields({ name: 'Duration', value: data.duration, inline: true });
        }

        try {
            await channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Failed to send log message:', error);
        }
    }

    /**
     * Log a general event
     * @param {string} title - Event title
     * @param {string} description - Event description
     * @param {string} color - Hex color or preset color name
     */
    async logEvent(title, description, color = 'info') {
        const channel = await this.getLogChannel();
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(this.getColorFromPreset(color))
            .setFooter({ text: persona.footer() })
            .setTimestamp();

        try {
            await channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Failed to send log message:', error);
        }
    }

    /**
     * Get color based on action type
     * @param {string} action
     * @returns {number}
     */
    getActionColor(action) {
        const colors = {
            'Ban': 0xFF0000,      // Red
            'Kick': 0xFF6B00,     // Orange
            'Timeout': 0xFFBD00,  // Yellow
            'Unban': 0x00FF00,    // Green
            'Warn': 0xFFFF00      // Bright yellow
        };
        return colors[action] || config.bot.color;
    }

    /**
     * Get color from preset name
     * @param {string} preset
     * @returns {number}
     */
    getColorFromPreset(preset) {
        const presets = {
            'success': 0x00FF00,
            'error': 0xFF0000,
            'warning': 0xFFBD00,
            'info': config.bot.color
        };
        return presets[preset] || config.bot.color;
    }
}

module.exports = Logger;

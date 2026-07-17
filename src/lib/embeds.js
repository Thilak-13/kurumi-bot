const { EmbedBuilder } = require('discord.js');

/**
 * Shared embed helpers.
 * Previously duplicated at the top of dump.js, backupassets.js and
 * backupchannel.js — identical output preserved.
 */

function createErrorEmbed(title, description) {
    return new EmbedBuilder()
        .setTitle(`❌ ${title}`)
        .setDescription(description)
        .setColor('#e74c3c');
}

function createInfoEmbed(title, description) {
    return new EmbedBuilder()
        .setTitle(`ℹ️ ${title}`)
        .setDescription(description)
        .setColor('#3498db');
}

function createSuccessEmbed(title, description) {
    return new EmbedBuilder()
        .setTitle(`✅ ${title}`)
        .setDescription(description)
        .setColor('#2ecc71');
}

module.exports = { createErrorEmbed, createInfoEmbed, createSuccessEmbed };

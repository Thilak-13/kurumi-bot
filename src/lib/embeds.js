const { EmbedBuilder } = require('discord.js');
const persona = require('./persona');

/**
 * Shared embed helpers, styled in the resident Spirit's palette.
 * Same three semantic levels as before (error / info / success) — only the
 * dress has changed: crimson, shadow and clockface gold, with a signature
 * footer flourish.
 */

function createErrorEmbed(title, description) {
    return new EmbedBuilder()
        .setTitle(`❌ ${title}`)
        .setDescription(description)
        .setColor(persona.colors.blood)
        .setFooter({ text: persona.footer() });
}

function createInfoEmbed(title, description) {
    return new EmbedBuilder()
        .setTitle(`🕰️ ${title}`)
        .setDescription(description)
        .setColor(persona.colors.crimson)
        .setFooter({ text: persona.footer() });
}

function createSuccessEmbed(title, description) {
    return new EmbedBuilder()
        .setTitle(`✅ ${title}`)
        .setDescription(description)
        .setColor(persona.colors.gold)
        .setFooter({ text: persona.footer() });
}

module.exports = { createErrorEmbed, createInfoEmbed, createSuccessEmbed };

const { EmbedBuilder } = require('discord.js');
const persona = require('../../lib/persona');

module.exports = {
    name: 'ping',
    description: 'Check bot latency',

    async execute(message) {
        const sent = await message.reply('Ara ara... you called? Let me consult the clock...');
        const latency = sent.createdTimestamp - message.createdTimestamp;
        const wsLatency = message.client.ws.ping;

        const embed = new EmbedBuilder()
            .setTitle('🕰️ Right on time')
            .setDescription('Kihihi... did you doubt me? Every one of my seconds is accounted for.')
            .setColor(persona.colors.gold)
            .addFields(
                { name: 'Message Latency', value: `${latency}ms`, inline: true },
                { name: 'Websocket Latency', value: `${wsLatency}ms`, inline: true }
            )
            .setFooter({ text: `Requested by ${message.author.tag} — ${persona.footer()}` })
            .setTimestamp();

        sent.edit({ content: '', embeds: [embed] });
    }
};

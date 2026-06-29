const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'ping',
    description: 'Check bot latency',
    
    async execute(message) {
        const sent = await message.reply('Pinging...');
        const latency = sent.createdTimestamp - message.createdTimestamp;
        const wsLatency = message.client.ws.ping;
        
        const embed = new EmbedBuilder()
            .setTitle('🏓 Pong!')
            .setColor('#2ecc71')
            .addFields(
                { name: 'Message Latency', value: `${latency}ms`, inline: true },
                { name: 'Websocket Latency', value: `${wsLatency}ms`, inline: true }
            )
            .setFooter({ text: `Requested by ${message.author.tag}` })
            .setTimestamp();
        
        sent.edit({ content: '', embeds: [embed] });
    }
};

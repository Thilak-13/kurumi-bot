const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'reload',
    description: 'Reload all commands (Usage: zzreload)',
    
    async execute(message) {
        try {
            const commandsPath = path.join(__dirname, '..');
            const commandFolders = fs.readdirSync(commandsPath);

            let reloaded = 0;
            let failed = 0;

            for (const folder of commandFolders) {
                const folderPath = path.join(commandsPath, folder);
                if (!fs.statSync(folderPath).isDirectory()) continue;

                const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));

                for (const file of commandFiles) {
                    const filePath = path.join(folderPath, file);
                    
                    try {
                        delete require.cache[require.resolve(filePath)];
                        const command = require(filePath);
                        
                        if ('data' in command && 'execute' in command) {
                            message.client.commands.set(command.data.name, command);
                            reloaded++;
                        } else if ('name' in command && 'execute' in command) {
                            message.client.commands.set(command.name, command);
                            reloaded++;
                        }
                    } catch (error) {
                        console.error(`❌ ${file}:`, error.message);
                        failed++;
                    }
                }
            }

            const embed = new EmbedBuilder()
                .setTitle('🔄 Commands Reloaded')
                .setColor('#2ecc71')
                .addFields(
                    { name: 'Successfully Reloaded', value: `${reloaded}`, inline: true },
                    { name: 'Failed', value: `${failed}`, inline: true }
                )
                .setTimestamp();
            
            message.reply({ embeds: [embed] });
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Reload Failed')
                .setDescription(`Error: ${error.message}`)
                .setColor('#e74c3c');
            message.reply({ embeds: [embed] });
        }
    }
};

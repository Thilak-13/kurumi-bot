const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const persona = require('../../lib/persona');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('emojiloop')
        .setDescription('Keep every emoji and sticker eternally fresh, on my endless little loop ♡')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions)
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('Wind the loop — one emoji or sticker refreshed every 90 seconds')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('stop')
                .setDescription('Still the hands — halt the refresh loop')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('runnow')
                .setDescription('Attend to the next queued emoji or sticker at once')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Peek at the loop and what remains in the queue')
        ),

    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({ content: `❌ ${persona.serverOnly()}`, flags: 64 });
        }

        const db = interaction.client.database;
        if (!db || !db.connected) {
            return interaction.reply({ content: '❌ Ara... my memory fails me — the database is not connected. Do wake it before asking favors of me.', flags: 64 });
        }

        const subcommand = interaction.options.getSubcommand();
        const engine = interaction.client.emojiLoopEngine;

        if (subcommand === 'start') {
            await interaction.deferReply({ flags: 64 });
            
            // Fixed interval of 1.5 minutes (90 seconds)
            const intervalMinutes = 1.5; 

            // Initialize/Activate loop in database
            const saved = db.saveEmojiLoop(interaction.guildId, intervalMinutes, 'active');
            if (saved) {
                // Instantly trigger one execution to start the queue if not already running
                if (engine) {
                    engine.runCycle(interaction.guildId).catch(console.error);
                }
                return interaction.editReply({
                    content: `✅ **The clock is wound ♡**\nI shall polish **one sticker or emoji every 90 seconds**, round and round, stickers first — like clockwork, naturally.\n*Peek at my progress with \`/emojiloop status\`... if you can keep up. Kihihi.*`
                });
            } else {
                return interaction.editReply({ content: '❌ Ara... the gears jammed — a database error stopped me from starting the loop.' });
            }
        }

        if (subcommand === 'stop') {
            await interaction.deferReply({ flags: 64 });
            
            const existingLoop = db.getEmojiLoop(interaction.guildId);
            if (!existingLoop) {
                return interaction.editReply({ content: 'ℹ️ Ara...? There is no loop to stop, my dear. The clock was never wound.' });
            }

            const deleted = db.deleteEmojiLoop(interaction.guildId);
            if (deleted) {
                return interaction.editReply({
                    content: '✅ **The hands have stopped.**\nVery well... the emojis and stickers may rest. I do so hate idle hands, but as you wish.'
                });
            } else {
                return interaction.editReply({ content: '❌ How stubborn... a database error kept the loop turning. Do try again.' });
            }
        }

        if (subcommand === 'status') {
            const config = db.getEmojiLoop(interaction.guildId);
            if (!config) {
                return interaction.reply({
                    content: 'ℹ️ **Not Configured**\nNo loop ticks in this server yet, my dear. Wind it with `/emojiloop start`... and I shall take care of the rest ♡',
                    flags: 64
                });
            }

            await interaction.deferReply({ flags: 64 });

            // Parse current queue from database
            let pendingItems = [];
            try {
                pendingItems = JSON.parse(config.pending_items || '[]');
            } catch (e) {
                pendingItems = [];
            }

            const embed = new EmbedBuilder()
                .setTitle('✨ Continuous Emoji & Sticker Refresh Loop')
                .setDescription('Ufufu... my little carousel of expressions, turning ever so precisely.')
                .setColor(persona.colors.crimson)
                .setFooter({ text: persona.footer() })
                .setTimestamp();

            const nextRunText = config.status === 'active' 
                ? `<t:${Math.floor(config.next_run / 1000)}:F> (<t:${Math.floor(config.next_run / 1000)}:R>)` 
                : 'Paused';

            embed.addFields(
                { name: 'Server Name', value: `${interaction.guild.name}`, inline: true },
                { name: 'Status', value: `${config.status.toUpperCase()}`, inline: true },
                { name: 'Pacing Rate', value: '1 item every 90 seconds', inline: true },
                { name: 'Queue Status', value: `**${pendingItems.length}** item(s) remaining in the current round.` },
                { name: 'Next Queued Execution', value: nextRunText }
            );

            // Fetch progress info from in-memory engine if available
            const progress = engine?.progress?.[interaction.guildId];
            if (progress) {
                const refreshedStatus = progress.rateLimitTime 
                    ? '⚠️ Rate Limited (Deferred)' 
                    : (progress.refreshed ? '✅ Refreshed' : '❌ Skipped/Failed');

                embed.addFields(
                    { name: 'Last Processed Item', value: `**${progress.lastItem}** (${progress.type.toUpperCase()})` },
                    { name: 'Last Refreshed Status', value: refreshedStatus }
                );

                if (progress.rateLimitTime) {
                    const resumeTimeText = `<t:${Math.floor(progress.rateLimitTime / 1000)}:R>`;
                    embed.addFields({ name: 'Rate Limit Cooldown', value: `Rate limit hit! Queue is deferred and will resume automatically **${resumeTimeText}**.` });
                }
            }

            return interaction.editReply({ embeds: [embed] });
        }

        if (subcommand === 'runnow') {
            await interaction.deferReply({ flags: 64 });
            if (!engine) {
                return interaction.editReply({ content: '❌ Ara... the engine itself is asleep. I cannot turn hands that do not exist.' });
            }

            if (engine.runningGuilds.has(interaction.guildId)) {
                return interaction.editReply({ content: '⚠️ Patience, my dear... I am mid-turn already. One does not rush a lady at her work.' });
            }

            // Trigger a single step immediately in the background
            engine.runCycle(interaction.guildId).catch(err => {
                console.error(`Error executing manual background emoji loop step:`, err);
            });

            return interaction.editReply({ content: '✅ **As you wish ♡** The next emoji or sticker is being attended to this very second. Use `/emojiloop status` to watch me work.' });
        }
    }
};

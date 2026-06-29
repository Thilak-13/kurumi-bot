module.exports = {
    name: 'manga-chapter',
    description: 'Manage manga chapter statdock timers',

    async execute(message, args) {
        if (!message.guild) {
            return message.reply('❌ This command can only be used in a server.').catch(() => {});
        }
        const sub = (args.shift() || '').toLowerCase();
        const scheduler = message.client.mangaScheduler;

        if (!sub) {
            return message.reply('Usage: zzmanga-chapter <setup|status|cancel|update> ...');
        }

        if (sub === 'setup') {
            // zzmanga-chapter setup #voice-channel 151
            const channelMention = args.shift();
            const chapterArg = args.shift();

            if (!channelMention || !chapterArg) {
                return message.reply('Usage: zzmanga-chapter setup <#voice-channel> <chapter-number>');
            }

            const match = channelMention.match(/^<#(\d+)>$/);
            if (!match) return message.reply('Please mention the voice channel (click channel and paste).');

            const channelId = match[1];
            const chapter = parseInt(chapterArg, 10);
            if (Number.isNaN(chapter)) return message.reply('Invalid chapter number.');

            // Ensure scheduler available
            if (!scheduler) return message.reply('Scheduler not initialized. Restart bot.');

            try {
                const channel = await message.client.channels.fetch(channelId);
                if (!channel) return message.reply('Channel not found.');

                // create or update timer
                await scheduler.addTimer({ guildId: message.guild.id, channelId, chapter });
                return message.reply(`Timer set: CH ${chapter} (updates every 10 minutes) in ${channel.name}`);
            } catch (err) {
                console.error(err);
                return message.reply('Failed to create timer. Check bot permissions to manage channel names.');
            }
        }

        if (sub === 'status') {
            // zzmanga-chapter status #channel
            const channelMention = args.shift();
            if (!channelMention) return message.reply('Usage: zzmanga-chapter status <#channel>');
            const match = channelMention.match(/^<#(\d+)>$/);
            if (!match) return message.reply('Please mention the channel.');
            const channelId = match[1];
            const t = scheduler?.getTimer(message.guild.id, channelId);
            if (!t) return message.reply('No timer configured for that channel.');

            const now = Date.now();
            if (t.completed || now >= t.target) {
                return message.reply(`CH ${t.chapter} OUT NOW (timer completed)`);
            }

            const diff = t.target - now;
            const parts = message.client.mangaScheduler.constructor._msToParts(diff);
            return message.reply(`CH ${t.chapter} IN ${parts.days}D ${parts.hours}H ${parts.minutes}M`);
        }

        if (sub === 'cancel') {
            const channelMention = args.shift();
            if (!channelMention) return message.reply('Usage: zzmanga-chapter cancel <#channel>');
            const match = channelMention.match(/^<#(\d+)>$/);
            if (!match) return message.reply('Please mention the channel.');
            const channelId = match[1];
            const ok = await scheduler.removeTimer(message.guild.id, channelId);
            if (ok) return message.reply('Timer removed.');
            return message.reply('No timer found for that channel.');
        }

        if (sub === 'update') {
            // zzmanga-chapter update #channel 152
            const channelMention = args.shift();
            const chapterArg = args.shift();
            if (!channelMention || !chapterArg) return message.reply('Usage: zzmanga-chapter update <#channel> <chapter-number>');
            const match = channelMention.match(/^<#(\d+)>$/);
            if (!match) return message.reply('Please mention the channel.');
            const channelId = match[1];
            const chapter = parseInt(chapterArg, 10);
            if (Number.isNaN(chapter)) return message.reply('Invalid chapter number.');

            const t = scheduler.getTimer(message.guild.id, channelId);
            if (!t) return message.reply('No timer configured for that channel. Use setup first.');

            // overwrite chapter and reset target to next Wednesday
            t.chapter = Number(chapter);
            t.target = message.client.mangaScheduler.constructor.getNextWednesdayUTC().getTime();
            t.completed = false;
            await message.client.mangaScheduler.save();
            await message.client.mangaScheduler.updateOne(t);
            return message.reply(`Timer updated: CH ${chapter}`);
        }

        return message.reply('Unknown subcommand. Use setup|status|cancel|update');
    }
};

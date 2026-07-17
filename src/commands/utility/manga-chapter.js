module.exports = {
    name: 'manga-chapter',
    description: 'Manage manga chapter statdock timers',

    async execute(message, args) {
        if (!message.guild) {
            return message.reply('❌ Ara ara... this little game is only played inside a server, my dear.').catch(() => {});
        }
        const sub = (args.shift() || '').toLowerCase();
        const scheduler = message.client.mangaScheduler;

        if (!sub) {
            return message.reply('Lost, my dear? The incantation goes: `zzmanga-chapter <setup|status|cancel|update> ...`');
        }

        if (sub === 'setup') {
            // zzmanga-chapter setup #voice-channel 151
            const channelMention = args.shift();
            const chapterArg = args.shift();

            if (!channelMention || !chapterArg) {
                return message.reply('Almost... but not quite: `zzmanga-chapter setup <#voice-channel> <chapter-number>`');
            }

            const match = channelMention.match(/^<#(\d+)>$/);
            if (!match) return message.reply('Point me to the voice channel properly, won\'t you? Click it and paste the mention.');

            const channelId = match[1];
            const chapter = parseInt(chapterArg, 10);
            if (Number.isNaN(chapter)) return message.reply('Ara...? That is no chapter number I have ever seen.');

            // Ensure scheduler available
            if (!scheduler) return message.reply('My clockwork is not wound — the scheduler is missing. A restart should wake it.');

            try {
                const channel = await message.client.channels.fetch(channelId);
                if (!channel) return message.reply('Ara...? No such channel exists. I looked in every shadow.');

                // create or update timer
                await scheduler.addTimer({ guildId: message.guild.id, channelId, chapter });
                return message.reply(`The countdown begins ♡ CH ${chapter} — I shall turn the hands every 10 minutes in ${channel.name}. Kihihi.`);
            } catch (err) {
                console.error(err);
                return message.reply('Ara... the timer refused to be set. Do check whether I may manage channel names here.');
            }
        }

        if (sub === 'status') {
            // zzmanga-chapter status #channel
            const channelMention = args.shift();
            if (!channelMention) return message.reply('The incantation goes: `zzmanga-chapter status <#channel>`');
            const match = channelMention.match(/^<#(\d+)>$/);
            if (!match) return message.reply('Mention the channel properly, my dear.');
            const channelId = match[1];
            const t = scheduler?.getTimer(message.guild.id, channelId);
            if (!t) return message.reply('No clock ticks in that channel, my dear.');

            const now = Date.now();
            if (t.completed || now >= t.target) {
                return message.reply(`CH ${t.chapter} is OUT NOW... the clock has struck, my dear ♡`);
            }

            const diff = t.target - now;
            const parts = message.client.mangaScheduler.constructor._msToParts(diff);
            return message.reply(`CH ${t.chapter} arrives in ${parts.days}D ${parts.hours}H ${parts.minutes}M... tick, tock. Kihihi.`);
        }

        if (sub === 'cancel') {
            const channelMention = args.shift();
            if (!channelMention) return message.reply('The incantation goes: `zzmanga-chapter cancel <#channel>`');
            const match = channelMention.match(/^<#(\d+)>$/);
            if (!match) return message.reply('Mention the channel properly, my dear.');
            const channelId = match[1];
            const ok = await scheduler.removeTimer(message.guild.id, channelId);
            if (ok) return message.reply('The clock is stopped... and its time is mine now ♡');
            return message.reply('Ara...? There was never a timer there to begin with.');
        }

        if (sub === 'update') {
            // zzmanga-chapter update #channel 152
            const channelMention = args.shift();
            const chapterArg = args.shift();
            if (!channelMention || !chapterArg) return message.reply('The incantation goes: `zzmanga-chapter update <#channel> <chapter-number>`');
            const match = channelMention.match(/^<#(\d+)>$/);
            if (!match) return message.reply('Mention the channel properly, my dear.');
            const channelId = match[1];
            const chapter = parseInt(chapterArg, 10);
            if (Number.isNaN(chapter)) return message.reply('Ara...? That is no chapter number I have ever seen.');

            const t = scheduler.getTimer(message.guild.id, channelId);
            if (!t) return message.reply('No clock ticks there yet, my dear. Wind one first with `setup`.');

            // overwrite chapter and reset target to next Wednesday
            t.chapter = Number(chapter);
            t.target = message.client.mangaScheduler.constructor.getNextWednesdayUTC().getTime();
            t.completed = false;
            await message.client.mangaScheduler.save();
            await message.client.mangaScheduler.updateOne(t);
            return message.reply(`Rewound and reset ♡ The countdown now marks CH ${chapter}.`);
        }

        return message.reply('Ara ara... I know no such trick. My repertoire here: `setup | status | cancel | update`.');
    }
};

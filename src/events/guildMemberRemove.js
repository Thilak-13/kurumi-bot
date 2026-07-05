module.exports = {
    name: 'guildMemberRemove',
    async execute(member) {
        const client = member.client;
        const db = client.database;
        if (!db || !db.connected) return;

        const userId = member.user.id;
        const leftGuildId = member.guild.id;

        try {
            // If member leaves Guild 2 (target_guild_id), we remove the role from them in Guild 1 (source_guild_id)
            const targetRules = db.getRoleSyncRulesForTarget(leftGuildId);
            for (const rule of targetRules) {
                const guild1 = client.guilds.cache.get(rule.source_guild_id)
                    || await client.guilds.fetch(rule.source_guild_id).catch(() => null);
                if (!guild1) continue;

                const memberInGuild1 = await guild1.members.fetch(userId).catch(() => null);
                if (memberInGuild1) {
                    const role = guild1.roles.cache.get(rule.role_id)
                        || await guild1.roles.fetch(rule.role_id).catch(() => null);
                    if (role && memberInGuild1.roles.cache.has(role.id)) {
                        await memberInGuild1.roles.remove(role, 'Removed by Role Sync (Left Guild 2)').catch(err => {
                            console.error(`Failed to remove role ${rule.role_id} from ${userId} in Guild 1 (${rule.source_guild_id}):`, err.message);
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Error in guildMemberRemove rolesync handler:', error);
        }
    }
};

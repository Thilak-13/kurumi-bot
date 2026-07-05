module.exports = {
    name: 'guildMemberAdd',
    async execute(member) {
        const client = member.client;
        const db = client.database;
        if (!db || !db.connected) return;

        const userId = member.user.id;
        const joinedGuildId = member.guild.id;

        try {
            // Case 1: Member joins Guild 2 (target_guild_id)
            // We find all sync rules where target_guild_id = joinedGuildId.
            // If they are in Guild 1, they receive the role in Guild 1.
            const targetRules = db.getRoleSyncRulesForTarget(joinedGuildId);
            for (const rule of targetRules) {
                const guild1 = client.guilds.cache.get(rule.source_guild_id)
                    || await client.guilds.fetch(rule.source_guild_id).catch(() => null);
                if (!guild1) continue;

                // Check if user is in Guild 1
                const memberInGuild1 = await guild1.members.fetch(userId).catch(() => null);
                if (memberInGuild1) {
                    const role = guild1.roles.cache.get(rule.role_id)
                        || await guild1.roles.fetch(rule.role_id).catch(() => null);
                    if (role && !memberInGuild1.roles.cache.has(role.id)) {
                        await memberInGuild1.roles.add(role, 'Auto-assigned by Role Sync (User joined Guild 2)').catch(err => {
                            console.error(`Failed to assign role ${rule.role_id} to ${userId} in Guild 1 (${rule.source_guild_id}):`, err.message);
                        });
                    }
                }
            }

            // Case 2: Member joins Guild 1 (source_guild_id)
            // We find all sync rules where source_guild_id = joinedGuildId.
            // If they are already in Guild 2, they receive the role in Guild 1 (which they just joined).
            const sourceRules = db.getRoleSyncRulesForSource(joinedGuildId);
            for (const rule of sourceRules) {
                const guild2 = client.guilds.cache.get(rule.target_guild_id)
                    || await client.guilds.fetch(rule.target_guild_id).catch(() => null);
                if (!guild2) continue;

                // Check if user is in Guild 2
                const inGuild2 = await guild2.members.fetch(userId).catch(() => null);
                if (inGuild2) {
                    const role = member.guild.roles.cache.get(rule.role_id)
                        || await member.guild.roles.fetch(rule.role_id).catch(() => null);
                    if (role && !member.roles.cache.has(role.id)) {
                        await member.roles.add(role, 'Auto-assigned by Role Sync (User already in Guild 2)').catch(err => {
                            console.error(`Failed to assign role ${rule.role_id} to ${userId} in Guild 1 (${joinedGuildId}):`, err.message);
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Error in guildMemberAdd rolesync handler:', error);
        }
    }
};

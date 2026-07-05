const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rolesync')
        .setDescription('Manage role syncing between guilds')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addSubcommand(subcommand =>
            subcommand
                .setName('toggle')
                .setDescription('Toggle a role sync rule (creates if not exists, removes if exists)')
                .addStringOption(option =>
                    option.setName('guild_1')
                        .setDescription('The main guild (Guild 1) ID where the role resides')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('guild_2')
                        .setDescription('The secondary guild (Guild 2) ID to track presence in')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('role_id')
                        .setDescription('The role ID in the main guild (Guild 1)')
                        .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all active role sync rules')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('forcesync')
                .setDescription('Manually trigger synchronization for a rule')
                .addStringOption(option =>
                    option.setName('guild_1')
                        .setDescription('The main guild (Guild 1) ID where the role resides')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('guild_2')
                        .setDescription('The secondary guild (Guild 2) ID to track presence in')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('role_id')
                        .setDescription('The role ID in the main guild (Guild 1)')
                        .setRequired(true))
        ),

    async execute(interaction) {
        // Defer reply as guild operations can take time
        await interaction.deferReply({ flags: 64 });

        const db = interaction.client.database;
        if (!db || !db.connected) {
            return interaction.editReply({ content: '❌ Database system is not connected.' });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'list') {
            const rules = db.listAllRoleSyncRules();
            if (rules.length === 0) {
                return interaction.editReply({ content: 'ℹ️ No guild role sync rules are currently configured.' });
            }

            const embed = new EmbedBuilder()
                .setTitle('🔗 Active Guild Role Sync Rules')
                .setColor('#3498db')
                .setTimestamp();

            const descriptionLines = [];
            for (let i = 0; i < rules.length; i++) {
                const rule = rules[i];
                
                // Fetch guilds for user-friendly names
                const guild1 = interaction.client.guilds.cache.get(rule.source_guild_id)
                    || await interaction.client.guilds.fetch(rule.source_guild_id).catch(() => null);
                const guild2 = interaction.client.guilds.cache.get(rule.target_guild_id)
                    || await interaction.client.guilds.fetch(rule.target_guild_id).catch(() => null);
                
                let roleName = `Unknown Role (${rule.role_id})`;
                if (guild1) {
                    const role = guild1.roles.cache.get(rule.role_id)
                        || await guild1.roles.fetch(rule.role_id).catch(() => null);
                    if (role) roleName = `**@${role.name}**`;
                }

                const guild1Name = guild1 ? guild1.name : `Unknown Guild (${rule.source_guild_id})`;
                const guild2Name = guild2 ? guild2.name : `Unknown Guild (${rule.target_guild_id})`;

                descriptionLines.push(
                    `**Rule #${rule.id}**\n` +
                    `• **Main Guild (Guild 1):** ${guild1Name} \`${rule.source_guild_id}\`\n` +
                    `• **Secondary Guild (Guild 2):** ${guild2Name} \`${rule.target_guild_id}\`\n` +
                    `• **Role in Guild 1:** ${roleName}\n`
                );
            }

            embed.setDescription(descriptionLines.join('\n'));
            return interaction.editReply({ embeds: [embed] });
        }

        // Subcommands toggle and forcesync share verification logic
        const guild1Id = interaction.options.getString('guild_1').trim();
        const guild2Id = interaction.options.getString('guild_2').trim();
        const roleId = interaction.options.getString('role_id').trim();

        // Validate snowflakes
        if (!/^\d{17,20}$/.test(guild1Id) || !/^\d{17,20}$/.test(guild2Id) || !/^\d{17,20}$/.test(roleId)) {
            return interaction.editReply({ content: '❌ Invalid ID format. Guild IDs and Role IDs must be 17-20 digit numeric strings.' });
        }

        // Fetch Guilds
        const guild1 = interaction.client.guilds.cache.get(guild1Id)
            || await interaction.client.guilds.fetch(guild1Id).catch(() => null);
        const guild2 = interaction.client.guilds.cache.get(guild2Id)
            || await interaction.client.guilds.fetch(guild2Id).catch(() => null);

        if (!guild1) {
            return interaction.editReply({ content: `❌ I am not in the main guild (Guild 1) with ID \`${guild1Id}\`. Please invite me to that guild first.` });
        }
        if (!guild2) {
            return interaction.editReply({ content: `❌ I am not in the secondary guild (Guild 2) with ID \`${guild2Id}\`. Please invite me to that guild first.` });
        }

        // Fetch Role in Guild 1
        const role = guild1.roles.cache.get(roleId)
            || await guild1.roles.fetch(roleId).catch(() => null);
        if (!role) {
            return interaction.editReply({ content: `❌ Role with ID \`${roleId}\` not found in main guild **${guild1.name}**.` });
        }

        // Check Permissions in Guild 1
        const botMember = guild1.members.me 
            || await guild1.members.fetch(interaction.client.user.id).catch(() => null);
        if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.editReply({ content: `❌ I do not have **Manage Roles** permission in main guild **${guild1.name}**.` });
        }

        if (role.position >= botMember.roles.highest.position) {
            return interaction.editReply({ content: `❌ The role **${role.name}** is higher than or equal to my highest role in **${guild1.name}**, so I cannot manage it.` });
        }

        if (subcommand === 'toggle') {
            const existingRule = db.getRoleSyncRule(guild1Id, guild2Id, roleId);

            if (existingRule) {
                const removed = db.removeRoleSyncRule(guild1Id, guild2Id, roleId);
                if (removed) {
                    return interaction.editReply({ 
                        content: `✅ **Sync Deactivated!**\nMembers from **${guild1.name}** who are in **${guild2.name}** will no longer be assigned the role **${role.name}**.` 
                    });
                } else {
                    return interaction.editReply({ content: '❌ Failed to deactivate sync rule due to a database error.' });
                }
            } else {
                const added = db.addRoleSyncRule(guild1Id, guild2Id, roleId);
                if (added) {
                    return interaction.editReply({ 
                        content: `✅ **Sync Activated!**\nMembers in **${guild1.name}** (Guild 1) who join **${guild2.name}** (Guild 2) will now receive the role **${role.name}**.\n*Hint: Use \`/rolesync forcesync\` to sync existing members.*` 
                    });
                } else {
                    return interaction.editReply({ content: '❌ Failed to activate sync rule due to a database error.' });
                }
            }
        }

        if (subcommand === 'forcesync') {
            // Verify rule is configured
            const existingRule = db.getRoleSyncRule(guild1Id, guild2Id, roleId);
            if (!existingRule) {
                return interaction.editReply({ content: '❌ This sync rule is not active. Please activate it first using `/rolesync toggle`.' });
            }

            await interaction.editReply({ content: `⏳ Initializing force synchronization of role **${role.name}** in **${guild1.name}** based on presence in **${guild2.name}**...` });

            try {
                // Fetch members of both guilds
                const guild1Members = await guild1.members.fetch();
                const guild2Members = await guild2.members.fetch();

                let addedCount = 0;
                let removedCount = 0;
                let failedCount = 0;

                for (const [userId, memberInGuild1] of guild1Members) {
                    const inGuild2 = guild2Members.has(userId);
                    const hasRole = memberInGuild1.roles.cache.has(roleId);

                    if (inGuild2 && !hasRole) {
                        try {
                            await memberInGuild1.roles.add(role, 'Role Sync: Force Synchronized (User is in Guild 2)');
                            addedCount++;
                        } catch (err) {
                            failedCount++;
                        }
                    } else if (!inGuild2 && hasRole) {
                        try {
                            await memberInGuild1.roles.remove(role, 'Role Sync: Force Synchronized (User is not in Guild 2)');
                            removedCount++;
                        } catch (err) {
                            failedCount++;
                        }
                    }
                }

                return interaction.editReply({
                    content: `✅ **Synchronization Complete!**\n` +
                             `• Assigned role to **${addedCount}** members in **${guild1.name}**.\n` +
                             `• Removed role from **${removedCount}** members in **${guild1.name}**.\n` +
                             `• Failed operations: **${failedCount}**.`
                });
            } catch (error) {
                console.error('Error during force-sync:', error);
                return interaction.editReply({ content: `❌ An error occurred during synchronization: ${error.message}` });
            }
        }
    }
};

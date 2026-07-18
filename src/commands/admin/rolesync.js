const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const persona = require('../../lib/persona');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rolesync')
        .setDescription('Weave a role across two worlds — I shall tend the threads between guilds ♡')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addSubcommand(subcommand =>
            subcommand
                .setName('toggle')
                .setDescription('Tie the sync thread if it is loose, or cut it if it is bound')
                .addStringOption(option =>
                    option.setName('guild_1')
                        .setDescription('The main guild (Guild 1) ID — where the role truly lives')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('guild_2')
                        .setDescription('The second guild (Guild 2) ID — where I watch for their presence')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('role_id')
                        .setDescription('The role ID in the main guild (Guild 1) that travels between them')
                        .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Show every thread I have tied between guilds')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('forcesync')
                .setDescription('Bring every soul into line with a rule this very moment')
                .addStringOption(option =>
                    option.setName('guild_1')
                        .setDescription('The main guild (Guild 1) ID — where the role truly lives')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('guild_2')
                        .setDescription('The second guild (Guild 2) ID — where I watch for their presence')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('role_id')
                        .setDescription('The role ID in the main guild (Guild 1) that travels between them')
                        .setRequired(true))
        ),

    async execute(interaction) {
        // Defer reply as guild operations can take time
        await interaction.deferReply({ flags: 64 });

        const db = interaction.client.database;
        if (!db || !db.connected) {
            return interaction.editReply({ content: '❌ Ara... my memory fails me — the database is not connected.' });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'list') {
            const rules = db.listAllRoleSyncRules();
            if (rules.length === 0) {
                return interaction.editReply({ content: 'ℹ️ Ara...? Not a single thread ties these worlds together yet. How lonely.' });
            }

            const embed = new EmbedBuilder()
                .setTitle('🔗 Active Guild Role Sync Rules')
                .setColor(persona.colors.crimson)
                .setFooter({ text: persona.footer() })
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
            return interaction.editReply({ content: '❌ Ara ara... those are not proper IDs, my dear. Guild and Role IDs are 17–20 digit numbers. Precision matters... especially to me.' });
        }

        // Fetch Guilds
        const guild1 = interaction.client.guilds.cache.get(guild1Id)
            || await interaction.client.guilds.fetch(guild1Id).catch(() => null);
        const guild2 = interaction.client.guilds.cache.get(guild2Id)
            || await interaction.client.guilds.fetch(guild2Id).catch(() => null);

        if (!guild1) {
            return interaction.editReply({ content: `❌ I have no shadow in the main guild (Guild 1) \`${guild1Id}\` to step out of... invite me there first, won't you?` });
        }
        if (!guild2) {
            return interaction.editReply({ content: `❌ I have no shadow in the secondary guild (Guild 2) \`${guild2Id}\` either... invite me there first, won't you?` });
        }

        // Fetch Role in Guild 1
        const role = guild1.roles.cache.get(roleId)
            || await guild1.roles.fetch(roleId).catch(() => null);
        if (!role) {
            return interaction.editReply({ content: `❌ Ara...? No role with ID \`${roleId}\` exists in **${guild1.name}**. I searched every shadow.` });
        }

        // Check Permissions in Guild 1
        const botMember = guild1.members.me 
            || await guild1.members.fetch(interaction.client.user.id).catch(() => null);
        if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.editReply({ content: `❌ My hands are tied in **${guild1.name}** — I lack the **Manage Roles** permission there. Untie me, and we may continue ♡` });
        }

        if (role.position >= botMember.roles.highest.position) {
            return interaction.editReply({ content: `❌ The role **${role.name}** sits above my reach in **${guild1.name}**... even I cannot rewrite what stands higher than me. Yet.` });
        }

        if (subcommand === 'toggle') {
            const existingRule = db.getRoleSyncRule(guild1Id, guild2Id, roleId);

            if (existingRule) {
                const removed = db.removeRoleSyncRule(guild1Id, guild2Id, roleId);
                if (removed) {
                    return interaction.editReply({ 
                        content: `✅ **The thread is cut.**\nMembers of **${guild1.name}** who dwell in **${guild2.name}** shall no longer receive **${role.name}**. Ufufu... how final that sounds.` 
                    });
                } else {
                    return interaction.editReply({ content: '❌ Ara... the database refused to let go of that rule. Do try again.' });
                }
            } else {
                const added = db.addRoleSyncRule(guild1Id, guild2Id, roleId);
                if (added) {
                    return interaction.editReply({ 
                        content: `✅ **The thread is tied ♡**\nMembers of **${guild1.name}** (Guild 1) who join **${guild2.name}** (Guild 2) shall receive **${role.name}** — I shall see to it personally.\n*Hint: \`/rolesync forcesync\` will bring existing members into line at once.*` 
                    });
                } else {
                    return interaction.editReply({ content: '❌ Ara... the database rejected my beautiful new rule. Do try again.' });
                }
            }
        }

        if (subcommand === 'forcesync') {
            // Verify rule is configured
            const existingRule = db.getRoleSyncRule(guild1Id, guild2Id, roleId);
            if (!existingRule) {
                return interaction.editReply({ content: '❌ That thread has not been tied yet, my dear. Tie it first with `/rolesync toggle`.' });
            }

            await interaction.editReply({ content: `⏳ Very well... I shall walk both worlds and set **${role.name}** right in **${guild1.name}**, judged by presence in **${guild2.name}**. Watch closely ♡` });

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
                    content: `✅ **Synchronization Complete!** Every soul accounted for... as always.\n` +
                             `• Granted the role to **${addedCount}** member(s) in **${guild1.name}**.\n` +
                             `• Took it back from **${removedCount}** member(s) in **${guild1.name}**.\n` +
                             `• Slipped through my fingers: **${failedCount}**.`
                });
            } catch (error) {
                console.error('Error during force-sync:', error);
                return interaction.editReply({ content: `❌ Ara... something stumbled mid-dance: ${error.message}` });
            }
        }
    }
};

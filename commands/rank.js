const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const axios = require('axios');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rank')
        .setDescription('Ranks a user in a target Roblox group (Main or Department).')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('group_id')
                .setDescription('The Roblox Group ID to modify')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('user_id')
                .setDescription('The Roblox UserId of the target player')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('role_id')
                .setDescription('The target Role ID in the group')
                .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const groupId = interaction.options.getString('group_id');
        const userId = interaction.options.getInteger('user_id');
        const roleId = interaction.options.getString('role_id');

        try {
            const membershipId = `${groupId}-${userId}`;
            await axios.patch(
                `https://apis.roblox.com/cloud/v2/groups/${groupId}/memberships/${membershipId}`,
                { role: `groups/${groupId}/roles/${roleId}` },
                { headers: { 'x-api-key': process.env.ROBLOX_OPEN_CLOUD_KEY } }
            );

            await interaction.editReply(`✅ Successfully updated user \`${userId}\` to role \`${roleId}\` in group \`${groupId}\`.`);
        } catch (error) {
            console.error('Error ranking player:', error.response?.data || error.message);
            await interaction.editReply(`❌ Failed to update rank: \`${error.response?.data?.message || error.message}\``);
        }
    }
};
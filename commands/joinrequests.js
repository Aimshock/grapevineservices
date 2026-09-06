const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const axios = require('axios');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('joinrequests')
        .setDescription('View or review join requests for a group.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(option =>
            option.setName('group_id')
                .setDescription('The Roblox Group ID')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Action to take')
                .addChoices(
                    { name: 'List Requests', value: 'list' },
                    { name: 'Accept User', value: 'accept' },
                    { name: 'Decline User', value: 'decline' }
                )
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('request_id')
                .setDescription('Join Request ID (Required if accepting/declining)')
                .setRequired(false)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const groupId = interaction.options.getString('group_id');
        const action = interaction.options.getString('action');
        const requestId = interaction.options.getString('request_id');

        const apiKey = process.env.ROBLOX_OPEN_CLOUD_KEY;

        try {
            if (action === 'list') {
                const response = await axios.get(`https://apis.roblox.com/cloud/v2/groups/${groupId}/join-requests`, {
                    headers: { 'x-api-key': apiKey }
                });

                const requests = response.data.groupJoinRequests || [];
                if (requests.length === 0) {
                    return interaction.editReply(`ℹ️ No pending join requests for group \`${groupId}\`.`);
                }

                const listText = requests.slice(0, 10).map(r => `• **User:** ${r.user} | **Request ID:** \`${r.path.split('/').pop()}\``).join('\n');

                const embed = new EmbedBuilder()
                    .setTitle(`📥 Pending Join Requests for Group ${groupId}`)
                    .setDescription(listText)
                    .setColor(0xF1C40F);

                return interaction.editReply({ embeds: [embed] });
            } else {
                if (!requestId) {
                    return interaction.editReply('❌ You must provide a `request_id` to accept or decline.');
                }

                await axios.post(`https://apis.roblox.com/cloud/v2/groups/${groupId}/join-requests/${requestId}:${action}`, {}, {
                    headers: { 'x-api-key': apiKey }
                });

                return interaction.editReply(`✅ Successfully **${action}ed** join request \`${requestId}\` for group \`${groupId}\`.`);
            }
        } catch (error) {
            console.error('Join Request Error:', error.response?.data || error.message);
            return interaction.editReply(`❌ Error processing request: \`${error.response?.data?.message || error.message}\``);
        }
    }
};
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lookup')
        .setDescription('Fetches player data directly from HermitagePlayerData.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(option =>
            option.setName('target')
                .setDescription('Roblox Username or UserId')
                .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply();
        const input = interaction.options.getString('target');
        let userId = parseInt(input, 10);
        let username = input;

        if (isNaN(userId)) {
            try {
                const userRes = await fetch('https://users.roblox.com/v1/usernames/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ usernames: [input], excludeBannedUsers: false })
                });

                const userData = await userRes.json();
                if (!userData.data || userData.data.length === 0) {
                    return interaction.editReply(`❌ Could not find Roblox user: \`${input}\``);
                }

                userId = userData.data[0].id;
                username = userData.data[0].name;
            } catch (err) {
                return interaction.editReply('❌ Failed to reach Roblox Users API.');
            }
        }

        const universeId = process.env.ROBLOX_UNIVERSE_ID;
        const apiKey = process.env.ROBLOX_OPEN_CLOUD_KEY;
        const cloudUrl = `https://apis.roblox.com/datastores/v1/universes/${universeId}/standard-datastores/datastore/entries/entry?datastoreName=HermitagePlayerData&entryKey=${userId}&scope=v2`;

        try {
            const response = await fetch(cloudUrl, { headers: { 'x-api-key': apiKey } });

            if (response.status === 404) {
                return interaction.editReply(`⚠️ No record found for **${username}** (\`${userId}\`).`);
            }

            if (!response.ok) {
                return interaction.editReply(`❌ Open Cloud error (HTTP ${response.status}).`);
            }

            const data = await response.json();
            const avatarUrl = `https://www.roblox.com/headshot-thumbnail/image?userId=${userId}&width=150&height=150&format=png`;

            const fullName = (data.names?.fname || data.names?.lname) 
                ? `${data.names?.fname || ''} ${data.names?.lname || ''}`.trim() 
                : 'N/A';

            const playMinutes = data.playtimeMetrics?.totalSeconds ? Math.floor(data.playtimeMetrics.totalSeconds / 60) : 0;

            const embed = new EmbedBuilder()
                .setTitle(`📋 Player Data: ${username}`)
                .setURL(`https://www.roblox.com/users/${userId}/profile`)
                .setThumbnail(avatarUrl)
                .setColor(0x3498DB)
                .addFields(
                    { name: 'User Identifier', value: `${username} (\`${userId}\`)`, inline: true },
                    { name: 'Roleplay Name', value: fullName, inline: true },
                    { name: 'Callsign', value: data.callsign || 'N/A', inline: true },
                    { name: '💰 Cash Balance', value: `$${(data.money || 0).toLocaleString()}`, inline: true },
                    { name: '🏦 Bank Balance', value: `$${(data.bank || 0).toLocaleString()}`, inline: true },
                    { name: '⚖️ Jail Time', value: `${data.jailTime || 0}s`, inline: true },
                    { 
                        name: '📜 Licenses', 
                        value: `• Driver: ${data.driversLicense ? '✅' : '❌'}\n• Firearm: ${data.firearmsLicense ? '✅' : '❌'}\n• Business: ${data.businessLicense ? '✅' : '❌'}`, 
                        inline: true 
                    },
                    { 
                        name: '🚗 Assets', 
                        value: `• Vehicles: ${Array.isArray(data.carData) ? data.carData.length : 0}\n• Boats: ${Array.isArray(data.boatData) ? data.boatData.length : 0}`, 
                        inline: true 
                    },
                    { 
                        name: '📊 Playtime Stats', 
                        value: `• Total: ${playMinutes} mins\n• Joins: ${data.playtimeMetrics?.joinCount || 1}`, 
                        inline: true 
                    }
                )
                .setFooter({ text: `Data Version: v${data.dataVersion || 1} • HermitagePlayerData` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error fetching DataStore:', error);
            await interaction.editReply('❌ An error occurred while fetching data.');
        }
    }
};
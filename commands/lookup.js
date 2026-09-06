const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ComponentType, 
    PermissionFlagsBits 
} = require('discord.js');

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

        // 1. Resolve Roblox Username to UserId if needed
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

        // 2. Fetch DataStore from Roblox Open Cloud API
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

            // 3. Build Embedded Views
            
            // --- VIEW 1: Overview ---
            const mainEmbed = new EmbedBuilder()
                .setTitle(`📋 Citizen Overview: ${username}`)
                .setURL(`https://www.roblox.com/users/${userId}/profile`)
                .setThumbnail(avatarUrl)
                .setColor(0x3498DB)
                .addFields(
                    { name: 'User Identifier', value: `${username} (\`${userId}\`)`, inline: true },
                    { name: 'Roleplay Name', value: fullName, inline: true },
                    { name: 'Callsign', value: data.callsign || 'N/A', inline: true },
                    { 
                        name: '📜 Permits & Licenses', 
                        value: `• Driver: ${data.driversLicense ? '✅' : '❌'}\n• Firearm: ${data.firearmsLicense ? '✅' : '❌'}\n• Business: ${data.businessLicense ? '✅' : '❌'}`, 
                        inline: true 
                    },
                    { 
                        name: '📊 Playtime Stats', 
                        value: `• Total: ${playMinutes} mins\n• Joins: ${data.playtimeMetrics?.joinCount || 1}`, 
                        inline: true 
                    },
                    { name: '⚖️ Active Jail Time', value: `${data.jailTime || 0}s`, inline: true }
                )
                .setFooter({ text: `Data Version: v${data.dataVersion || 1} • Select a button below for details` })
                .setTimestamp();

            // --- VIEW 2: Finances & Wealth ---
            const financeEmbed = new EmbedBuilder()
                .setTitle(`💰 Financial Portfolio: ${username}`)
                .setURL(`https://www.roblox.com/users/${userId}/profile`)
                .setThumbnail(avatarUrl)
                .setColor(0x2ECC71)
                .addFields(
                    { name: '💵 Cash Balance', value: `$${(data.money || 0).toLocaleString()}`, inline: true },
                    { name: '🏦 Bank Balance', value: `$${(data.bank || 0).toLocaleString()}`, inline: true },
                    { name: '💎 Net Worth', value: `$${((data.money || 0) + (data.bank || 0)).toLocaleString()}`, inline: true }
                )
                .setFooter({ text: "HermitagePlayerData • Financial Registry" })
                .setTimestamp();

            // --- VIEW 3: Vehicles & Watercraft ---
            const vehiclesList = Array.isArray(data.carData) && data.carData.length > 0
                ? data.carData.map((car, index) => {
                    const name = typeof car === 'string' ? car : (car.name || car.model || `Vehicle #${index + 1}`);
                    const plate = car.plate ? ` [Plate: \`${car.plate}\`]` : '';
                    return `• **${name}**${plate}`;
                }).join('\n')
                : 'No vehicles registered.';

            const boatsList = Array.isArray(data.boatData) && data.boatData.length > 0
                ? data.boatData.map((boat, index) => `• **${typeof boat === 'string' ? boat : boat.name || `Boat #${index + 1}`}**`).join('\n')
                : 'No watercraft registered.';

            const vehiclesEmbed = new EmbedBuilder()
                .setTitle(`🚗 Asset Registry: ${username}`)
                .setURL(`https://www.roblox.com/users/${userId}/profile`)
                .setThumbnail(avatarUrl)
                .setColor(0xF1C40F)
                .addFields(
                    { name: `Vehicles (${Array.isArray(data.carData) ? data.carData.length : 0})`, value: vehiclesList },
                    { name: `Watercraft (${Array.isArray(data.boatData) ? data.boatData.length : 0})`, value: boatsList }
                )
                .setFooter({ text: "HermitagePlayerData • Department of Motor Vehicles" })
                .setTimestamp();

            // --- VIEW 4: Criminal Record ---
            const historyList = Array.isArray(data.criminalRecord) && data.criminalRecord.length > 0
                ? data.criminalRecord.map(rec => `• **[${rec.date || 'N/A'}]** ${rec.offense || rec.reason} *(Officer: ${rec.officer || 'Unknown'})*`).join('\n')
                : '🟢 Clean Record — No citations or arrest history.';

            const criminalEmbed = new EmbedBuilder()
                .setTitle(`📋 Criminal History: ${username}`)
                .setURL(`https://www.roblox.com/users/${userId}/profile`)
                .setThumbnail(avatarUrl)
                .setColor(0xE74C3C)
                .addFields(
                    { name: 'Active Warrant', value: data.hasWarrant ? '🚨 **YES**' : '🟢 None', inline: true },
                    { name: 'Current Jail Time', value: `${data.jailTime || 0} seconds`, inline: true },
                    { name: 'Prior Incident Log', value: historyList }
                )
                .setFooter({ text: "HermitagePlayerData • Law Enforcement Database" })
                .setTimestamp();

            // 4. Create Interactive Buttons
            const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_overview')
                    .setLabel('Overview')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('👤'),
                new ButtonBuilder()
                    .setCustomId('btn_finances')
                    .setLabel('Finances')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('💰'),
                new ButtonBuilder()
                    .setCustomId('btn_vehicles')
                    .setLabel('Vehicles & Assets')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🚗'),
                new ButtonBuilder()
                    .setCustomId('btn_criminal')
                    .setLabel('Criminal Record')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('📋')
            );

            // 5. Send Initial Reply
            const responseMessage = await interaction.editReply({
                embeds: [mainEmbed],
                components: [buttons]
            });

            // 6. Listen for Button Clicks (Active for 5 Minutes)
            const collector = responseMessage.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 300_000 
            });

            collector.on('collect', async (btnInteraction) => {
                // Restrict button usage to the person who used /lookup
                if (btnInteraction.user.id !== interaction.user.id) {
                    return btnInteraction.reply({ 
                        content: '❌ You cannot use these buttons. Run `/lookup` yourself to search a player.', 
                        ephemeral: true 
                    });
                }

                switch (btnInteraction.customId) {
                    case 'btn_overview':
                        await btnInteraction.update({ embeds: [mainEmbed] });
                        break;
                    case 'btn_finances':
                        await btnInteraction.update({ embeds: [financeEmbed] });
                        break;
                    case 'btn_vehicles':
                        await btnInteraction.update({ embeds: [vehiclesEmbed] });
                        break;
                    case 'btn_criminal':
                        await btnInteraction.update({ embeds: [criminalEmbed] });
                        break;
                }
            });

            // Disable buttons after 5 minutes to keep Discord tidy
            collector.on('end', async () => {
                const disabledButtons = new ActionRowBuilder().addComponents(
                    buttons.components.map(button => ButtonBuilder.from(button).setDisabled(true))
                );
                await interaction.editReply({ components: [disabledButtons] }).catch(() => {});
            });

        } catch (error) {
            console.error('Error fetching DataStore:', error);
            await interaction.editReply('❌ An error occurred while fetching data.');
        }
    }
};

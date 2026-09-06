const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

const oauthStates = new Map();

function generatePKCE() {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verify')
        .setDescription('Link your Roblox account to gain verified access.'),

    async execute(interaction) {
        const discordUserId = interaction.user.id;
        const state = crypto.randomBytes(16).toString('hex');
        const { verifier, challenge } = generatePKCE();

        oauthStates.set(state, { discordUserId, verifier });
        setTimeout(() => oauthStates.delete(state), 10 * 60 * 1000);

        const authUrl = new URL('https://apis.roblox.com/oauth/v1/authorize');
        authUrl.searchParams.append('client_id', process.env.ROBLOX_OAUTH_CLIENT_ID);
        authUrl.searchParams.append('redirect_uri', process.env.REDIRECT_URI);
        authUrl.searchParams.append('scope', 'openid profile');
        authUrl.searchParams.append('response_type', 'code');
        authUrl.searchParams.append('state', state);
        authUrl.searchParams.append('code_challenge', challenge);
        authUrl.searchParams.append('code_challenge_method', 'S256');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Verify with Roblox')
                .setStyle(ButtonStyle.Link)
                .setURL(authUrl.toString())
        );

        const embed = new EmbedBuilder()
            .setTitle('🔒 Roblox Verification')
            .setDescription('Click the button below to authorize your Roblox account. You will be redirected to Roblox\'s official authorization page.')
            .setColor(0x00A2FF);

        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    },

    initOAuthAndProxyServer(client) {
        const app = express();
        app.use(express.json());
        const PORT = process.env.PORT || 3000;

        // 1. Roblox OAuth Callback
        app.get('/oauth/callback', async (req, res) => {
            const { code, state, error } = req.query;
            if (error || !code || !state) return res.status(400).send('<h2>❌ Verification Failed.</h2>');

            const stateData = oauthStates.get(state);
            if (!stateData) return res.status(400).send('<h2>❌ Session expired. Please run /verify again.</h2>');

            const { discordUserId, verifier } = stateData;
            oauthStates.delete(state);

            try {
                const tokenParams = new URLSearchParams({
                    client_id: process.env.ROBLOX_OAUTH_CLIENT_ID,
                    client_secret: process.env.ROBLOX_OAUTH_CLIENT_SECRET,
                    grant_type: 'authorization_code',
                    code,
                    code_verifier: verifier
                });

                const tokenRes = await fetch('https://apis.roblox.com/oauth/v1/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: tokenParams
                });

                if (!tokenRes.ok) throw new Error(await tokenRes.text());
                const tokenData = await tokenRes.json();

                const userRes = await fetch('https://apis.roblox.com/oauth/v1/userinfo', {
                    headers: { Authorization: `Bearer ${tokenData.access_token}` }
                });

                const robloxUser = await userRes.json();
                const robloxUsername = robloxUser.preferred_username || robloxUser.name;

                const guild = client.guilds.cache.first();
                if (guild) {
                    const member = await guild.members.fetch(discordUserId).catch(() => null);
                    if (member) {
                        if (process.env.VERIFIED_ROLE_ID) await member.roles.add(process.env.VERIFIED_ROLE_ID).catch(console.error);
                        await member.setNickname(robloxUsername).catch(() => {});
                    }
                }

                res.send(`<div style="font-family:sans-serif;text-align:center;padding:50px;"><h1 style="color:#2ecc71;">✅ Successfully Verified as ${robloxUsername}!</h1></div>`);
            } catch (err) {
                console.error('OAuth Error:', err);
                res.status(500).send('<h2>❌ Internal Error during verification.</h2>');
            }
        });

        // 2. Multi-Group Proxy Endpoint for External Requests (e.g., from Roblox Studio/Luau)
        app.patch('/api/groups/:groupId/rank', async (req, res) => {
            const token = req.headers['x-internal-token'];
            if (token !== process.env.INTERNAL_SECRET_TOKEN) return res.status(401).json({ error: 'Unauthorized.' });

            const { groupId } = req.params;
            const { userId, roleId } = req.body;

            try {
                const membershipId = `${groupId}-${userId}`;
                const response = await axios.patch(
                    `https://apis.roblox.com/cloud/v2/groups/${groupId}/memberships/${membershipId}`,
                    { role: `groups/${groupId}/roles/${roleId}` },
                    { headers: { 'x-api-key': process.env.ROBLOX_OPEN_CLOUD_KEY } }
                );

                return res.json({ success: true, data: response.data });
            } catch (err) {
                return res.status(500).json({ error: err.response?.data || err.message });
            }
        });

        app.listen(PORT, () => {
            console.log(`🌐 Web server & OAuth callback running on port ${PORT}`);
        });
    }
};
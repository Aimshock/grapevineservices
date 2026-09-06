require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { initOAuthAndProxyServer } = require('./commands/verify');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

client.commands = new Collection();
const commandsArray = [];

// Dynamically load all command files from /commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        commandsArray.push(command.data.toJSON());
    }
}

// Register Slash Commands with Discord REST API
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log(`Refreshing ${commandsArray.length} slash commands...`);
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commandsArray }
        );
        console.log('Successfully registered all slash commands.');
    } catch (error) {
        console.error('Error registering slash commands:', error);
    }
})();

// Command Interaction Handling
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`Error executing /${interaction.commandName}:`, error);
        const errorPayload = { content: '❌ An error occurred while executing this command.', ephemeral: true };
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(errorPayload).catch(() => {});
        } else {
            await interaction.reply(errorPayload).catch(() => {});
        }
    }
});

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    // Start Express Web Server for OAuth Callback & Multi-Group Proxy Endpoints
    initOAuthAndProxyServer(client);
});

client.login(process.env.DISCORD_TOKEN);
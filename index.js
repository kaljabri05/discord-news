const express = require('express');
const { Server } = require('socket.io');
const { Client, GatewayIntentBits } = require('discord.js');
const app = express();
const server = require('http').createServer(app);
const io = new Server(server);
require('dotenv').config();

const discordClient = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const CHANNEL_ID = '1293122239964909661';
const DISCORD_TOKEN = process.env.BOT_TOKEN;
let allNews = [];

function extractLocation(message) {
    const locationRegex = /(?:in|at|near)\s+([A-Za-z\s]+(?:,\s*[A-Za-z\s]+)?)/i;
    const match = message.match(locationRegex);
    if (match) {
        const location = match[1].trim();
        const coords = {
            "Hokkaido": { lat: 36, lon: 138 },
            "Tokyo": { lat: 35.6762, lon: 139.6503 },
            "Kyoto": { lat: 35.0116, lon: 135.7681 }
        };
        return { location, coords: coords[location] || null };
    }
    return { location: "Unknown", coords: null };
}

discordClient.once('ready', () => {
    console.log('Discord bot is ready!');
});

discordClient.on('messageCreate', async (message) => {
    if (message.channel.id !== CHANNEL_ID || message.author.bot) return;

    const embed = message.embeds[0];
    if (!embed) return;

    const { location, coords } = extractLocation(embed.description || embed.title || '');
    const type = embed.title.includes('Breaking') ? 'breaking' : 'regular';

    const news = {
        title: embed.title || 'بدون عنوان',
        description: embed.description || '',
        image: embed.image ? embed.image.url : null,
        imageWidth: embed.image ? embed.image.width : null,
        imageHeight: embed.image ? embed.image.height : null,
        timestamp: new Date().toLocaleString('ar-SA'),
        type,
        location,
        lat: coords ? coords.lat : null,
        lon: coords ? coords.lon : null,
        primary_color: '#ff4500',
        secondary_color: '#000000',
        logo_url: embed.image ? embed.image.url : 'https://via.placeholder.com/80',
        details: {
            economy: {
                value: "متوسط (~50 مليار دولار)",
                description: `تعتمد على الأخشاب وصيد الأسماك في ${location}، لكن العزلة تحد من التجارة`
            },
            military: {
                strength: "متوسط (~60,000)",
                description: `الأراضي الشاسعة في ${location} تتيح أعدادًا كبيرة، لكن البرد يعوق اللوجستيات`
            },
            culture: {
                description: `حدود شمالية برية في ${location}، تنوعها تحت قيادة ميليوداس`
            },
            government: {
                leader: "ميليوداس",
                description: "دولة الشياطين (مجتمع الطليعة الأثيري)"
            }
        }
    };

    allNews.unshift(news);
    io.emit('newNews', news);
});

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
    console.log('A user connected');
    socket.emit('loadNews', allNews);
});

discordClient.login(DISCORD_TOKEN);

server.listen(3000, () => {
    console.log('Server running on port 3000');
});

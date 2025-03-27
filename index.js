const express = require('express');
const { Server } = require('socket.io');
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const fs = require('fs').promises;
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
const GEMINI_API_KEY ='AIzaSyCoUttcL62VrA0XLSf8KHAsTlh_LEbvLww';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + GEMINI_API_KEY;
let allNews = [];
let pinsData = require('./pins.json');

async function analyzeWithGemini(text) {
    const headers = { 'Content-Type': 'application/json' };
    try {
        const prompt = `
            Analyze this news text and return a JSON object with the following:
            - type: "breaking" or "regular" based on urgency
            - location: the location mentioned (e.g., "Tokyo")
            - lat: latitude of the location (if known)
            - lon: longitude of the location (if known)
            - economy: { value, description }
            - military: { strength, description }
            - culture: { description }
            - government: { leader, description }
            If any field cannot be determined, return null for that field.
            Text: "${text}"
        `;
        const response = await axios.post(GEMINI_URL, {
            contents: [{ parts: [{ text: prompt }] }]
        }, { headers });
        return JSON.parse(response.data.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim());
    } catch (error) {
        console.error('خطأ في Gemini:', error);
        return {
            type: 'regular',
            location: null,
            lat: null,
            lon: null,
            economy: null,
            military: null,
            culture: null,
            government: null
        };
    }
}

async function updatePins(news) {
    const pinIndex = pinsData.pins.findIndex(pin => pin.position[0] === news.lat && pin.position[1] === news.lon);
    if (pinIndex !== -1) {
        const existingPin = pinsData.pins[pinIndex];
        pinsData.pins[pinIndex] = {
            ...existingPin,
            details: {
                economy: news.details.economy || existingPin.details.economy,
                military: news.details.military || existingPin.details.military,
                culture: news.details.culture || existingPin.details.culture,
                government: news.details.government || existingPin.details.government
            }
        };
    } else if (news.lat && news.lon) {
        pinsData.pins.push({
            position: [news.lat, news.lon],
            anime: "غير محدد",
            primary_color: news.primary_color,
            secondary_color: news.secondary_color,
            logo_url: news.logo_url,
            anime_link: "",
            details: {
                economy: news.details.economy || { value: 'غير متاح', description: 'غير متاح' },
                military: news.details.military || { strength: 'غير متاح', description: 'غير متاح' },
                culture: news.details.culture || { description: 'غير متاح' },
                government: news.details.government || { leader: 'غير معروف', description: 'غير متاح' }
            },
            dynamic: true
        });
    }
    await fs.writeFile('./pins.json', JSON.stringify(pinsData, null, 2));
}

discordClient.once('ready', () => {
    console.log('Discord bot is ready!');
});

discordClient.on('messageCreate', async (message) => {
    if (message.channel.id !== CHANNEL_ID || message.author.bot) return;

    const embed = message.embeds[0];
    if (!embed) return;

    const analysis = await analyzeWithGemini(embed.description || embed.title);
    const news = {
        title: embed.title || 'بدون عنوان',
        description: embed.description || '',
        image: embed.image ? embed.image.url : null,
        imageWidth: embed.image ? embed.image.width : null,
        imageHeight: embed.image ? embed.image.height : null,
        timestamp: new Date().toLocaleString('ar-SA'),
        type: analysis.type,
        location: analysis.location || 'غير معروف',
        lat: analysis.lat,
        lon: analysis.lon,
        primary_color: '#ff4500',
        secondary_color: '#000000',
        logo_url: embed.image ? embed.image.url : 'https://via.placeholder.com/80',
        details: {
            economy: analysis.economy,
            military: analysis.military,
            culture: analysis.culture,
            government: analysis.government
        }
    };

    await updatePins(news);
    allNews.unshift(news);
    io.emit('newNews', news);
});

app.use(express.static(__dirname));
app.use(express.json());

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.post('/ask', async (req, res) => {
    const { question, news } = req.body;
    const prompt = `Based on this news data: ${JSON.stringify(news)}, answer the following question in Arabic: "${question}"`;
    const headers = { 'Content-Type': 'application/json' };
    try {
        const response = await axios.post(GEMINI_URL, {
            contents: [{ parts: [{ text: prompt }] }]
        }, { headers });
        const answer = response.data.candidates[0].content.parts[0].text;
        res.json({ answer });
    } catch (error) {
        console.error('خطأ في المساعد:', error);
        res.json({ answer: 'حدث خطأ أثناء معالجة السؤال.' });
    }
});

io.on('connection', (socket) => {
    console.log('A user connected');
    socket.emit('loadNews', allNews);
});

discordClient.login(DISCORD_TOKEN);

server.listen(3000, () => {
    console.log('Server running on port 3000');
});

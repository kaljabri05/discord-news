const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const storage = require('node-persist');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const CHANNEL_ID = '1293122239964909661';
let dailyNews = [];
let pinsData = require('./pins.json').pins;

(async () => {
  await storage.init({ dir: 'storage' });
  const storedNews = await storage.getItem('dailyNews');
  if (storedNews) dailyNews = storedNews;
})();

client.once('ready', async () => {
  console.log('البوت جاهز!');
  const channel = client.channels.cache.get(CHANNEL_ID);
  if (channel) {
    const messages = await channel.messages.fetch({ limit: 100 });
    messages.forEach(async message => {
      if (message.author.bot && message.embeds.length > 0) {
        message.embeds.forEach(async embed => {
          if (!embed.description) return;
          const { type, region } = await classifyNews(embed.title || '', embed.description);
          const news = {
            title: embed.title || 'بدون عنوان',
            description: embed.description,
            image: embed.image ? embed.image.url : null,
            timestamp: message.createdAt.toLocaleString('ar-SA'),
            type,
            region
          };
          if (!dailyNews.some(n => n.title === news.title && n.timestamp === news.timestamp)) {
            dailyNews.push(news);
            io.emit('newNews', news);
          }
        });
      }
    });
    await storage.setItem('dailyNews', dailyNews);
  }
});

client.on('messageCreate', async (message) => {
  if (message.channel.id === CHANNEL_ID && message.author.bot && message.embeds.length > 0) {
    message.embeds.forEach(async embed => {
      if (!embed.description) return;
      const { type, region } = await classifyNews(embed.title || '', embed.description);
      const news = {
        title: embed.title || 'بدون عنوان',
        description: embed.description,
        image: embed.image ? embed.image.url : null,
        timestamp: message.createdAt.toLocaleString('ar-SA'),
        type,
        region
      };
      dailyNews.push(news);
      io.emit('newNews', news);
      await storage.setItem('dailyNews', dailyNews);
    });
  }
});

async function classifyNews(title, description) {
  const regions = [
    "Kansai", "Tohoku", "Chubu", "Kanto", "Kyushu", 
    "Ryukyu", "Shikoku", "Hokkaido", "Chugoku"
  ];
  const region = regions.find(r => title.includes(r) || description.includes(r)) || "Unknown";
  return { type: "normal", region };
}

async function queryGemini(prompt) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=AIzaSyCoUttcL62VrA0XLSf8KHAsTlh_LEbvLww';
  const headers = { 'Content-Type': 'application/json' };
  try {
    const response = await axios.post(url, {
      contents: [{ parts: [{ text: prompt }] }]
    }, { headers });
    return response.data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error('خطأ في Gemini:', error);
    return 'عادي';
  }
}

io.on('connection', (socket) => {
  socket.on('updateRegion', async ({ region, news }) => {
    const pin = pinsData.find(p => p.anime.includes(region));
    if (pin) {
      const prompt = `قم بتحليل هذا الخبر وحدث بيانات المنطقة بناءً عليه: "${news.description}"`;
      const geminiResponse = await queryGemini(prompt);
      
      // تحليل استجابة Gemini لتحديث البيانات (افتراض تنسيق نصي بسيط)
      const updates = {};
      if (geminiResponse.includes("اقتصاد")) updates.economy = geminiResponse;
      if (geminiResponse.includes("عسكرية")) updates.military = geminiResponse;
      if (geminiResponse.includes("ثقافة")) updates.culture = geminiResponse;

      if (updates.economy) pin.details.economy.description = updates.economy;
      if (updates.military) pin.details.military.description = updates.military;
      if (updates.culture) pin.details.culture.description = updates.culture;

      await storage.setItem('pinsData', pinsData);
      io.emit('regionUpdated', { region, updatedData: pin.details });
    }
  });
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

server.listen(3000, () => {
  console.log('الخادم يعمل على المنفذ 3000');
});

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('خطأ: رمز البوت غير معرف! تأكد من تعيين BOT_TOKEN في متغيرات البيئة.');
  process.exit(1);
}
client.login(BOT_TOKEN);

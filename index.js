const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const storage = require('node-persist');
const path = require('path');

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
const START_MESSAGE_ID = '1353868688733900925'; // معرف الرسالة المحددة
let dailyNews = [];
let pinsData = require('./pins.json').pins;

(async () => {
  await storage.init({ dir: 'storage' });
  const storedNews = await storage.getItem('dailyNews');
  const storedPins = await storage.getItem('pinsData');
  if (storedNews) dailyNews = storedNews;
  if (storedPins) pinsData = storedPins;
})();

client.once('ready', async () => {
  console.log('البوت جاهز!');
  const channel = client.channels.cache.get(CHANNEL_ID);
  if (channel) {
    // جلب الرسائل بعد الرسالة المحددة
    const messages = await channel.messages.fetch({ after: START_MESSAGE_ID, limit: 100 });
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
            await updateRegionFromNews(news);
          }
        });
      }
    });
    await storage.setItem('dailyNews', dailyNews);
  }
});

client.on('messageCreate', async (message) => {
  if (message.channel.id === CHANNEL_ID && message.author.bot && message.embeds.length > 0 && message.id > START_MESSAGE_ID) {
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
      await updateRegionFromNews(news);
    });
  }
});

async function classifyNews(title, description) {
  const regions = ["Kansai", "Tohoku", "Chubu", "Kanto", "Kyushu", "Ryukyu", "Shikoku", "Hokkaido", "Chugoku"];
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
    return 'لا تغييرات';
  }
}

async function updateRegionFromNews(news) {
  const region = news.region;
  const pin = pinsData.find(p => p.anime.includes(region));
  if (pin && region !== "Unknown") {
    const prompt = `
      قم بتحليل هذا الخبر وأعد تحديثات لبيانات المنطقة بتنسيق نصي بسيط (اقتصاد، عسكرية، ثقافة) بناءً على المعلومات:
      الخبر: "${news.description}"
      البيانات الحالية:
      - اقتصاد: ${pin.details.economy.description}
      - عسكرية: ${pin.details.military.description}
      - ثقافة: ${pin.details.culture.description}
    `;
    const geminiResponse = await queryGemini(prompt);

    const updates = {};
    const lines = geminiResponse.split('\n');
    lines.forEach(line => {
      if (line.includes("اقتصاد:")) updates.economy = line.replace("اقتصاد:", "").trim();
      if (line.includes("عسكرية:")) updates.military = line.replace("عسكرية:", "").trim();
      if (line.includes("ثقافة:")) updates.culture = line.replace("ثقافة:", "").trim();
    });

    if (updates.economy && updates.economy !== pin.details.economy.description) pin.details.economy.description = updates.economy;
    if (updates.military && updates.military !== pin.details.military.description) pin.details.military.description = updates.military;
    if (updates.culture && updates.culture !== pin.details.culture.description) pin.details.culture.description = updates.culture;

    await storage.setItem('pinsData', pinsData);
    io.emit('regionUpdated', { region, updatedData: pin.details });
  }
}

io.on('connection', (socket) => {
  console.log('عميل متصل:', socket.id);
  socket.emit('initNews', dailyNews);
  socket.emit('initPins', pinsData);

  socket.on('updatePins', (updatedPins) => {
    pinsData = updatedPins;
    storage.setItem('pinsData', pinsData);
    io.emit('initPins', pinsData);
  });

  socket.on('updateRegion', async ({ region, news }) => {
    await updateRegionFromNews(news);
  });

  socket.on('disconnect', () => {
    console.log('عميل قطع الاتصال:', socket.id);
  });
});

app.use(express.static(__dirname));
app.use(express.json());

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/control', (req, res) => {
  res.sendFile(path.join(__dirname, 'control.html'));
});

app.get('/pins.json', (req, res) => {
  res.json({ pins: pinsData, lines: [] });
});

app.post('/save-pins', (req, res) => {
  pinsData = req.body.pins;
  storage.setItem('pinsData', pinsData)
    .then(() => {
      io.emit('initPins', pinsData);
      res.status(200).send('تم الحفظ بنجاح');
    })
    .catch(err => {
      console.error('خطأ في الحفظ:', err);
      res.status(500).send('فشل في الحفظ');
    });
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

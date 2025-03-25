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

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = '1293122239964909661';
let dailyNews = [];

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
          if (embed.image && embed.image.url === 'https://static.wikia.nocookie.net/fitalm/images/0/07/News.png') return;
          if (!embed.description) return;

          const type = await classifyNews(embed.title || '', embed.description);
          const news = {
            title: embed.title || 'بدون عنوان',
            description: embed.description,
            image: embed.image ? embed.image.url : null,
            imageWidth: embed.image ? embed.image.width : null,
            imageHeight: embed.image ? embed.image.height : null,
            timestamp: message.createdAt.toLocaleString('ar-SA'),
            type
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
  if (message.channel.id === CHANNEL_ID && message.author.bot) {
    message.embeds.forEach(async embed => {
      if (embed.image && embed.image.url === 'https://static.wikia.nocookie.net/fitalm/images/0/07/News.png') return;
      if (!embed.description) return;

      const type = await classifyNews(embed.title || '', embed.description);
      const news = {
        title: embed.title || 'بدون عنوان',
        description: embed.description,
        image: embed.image ? embed.image.url : null,
        imageWidth: embed.image ? embed.image.width : null,
        imageHeight: embed.image ? embed.image.height : null,
        timestamp: new Date().toLocaleString('ar-SA'),
        type
      };
      if (!dailyNews.some(n => n.title === news.title && n.timestamp === news.timestamp)) {
        dailyNews.push(news);
        io.emit('newNews', news);
        await storage.setItem('dailyNews', dailyNews);
      }
    });
  }
});

if (!BOT_TOKEN) {
  console.error('خطأ: رمز البوت غير معرف! تأكد من تعيين BOT_TOKEN في متغيرات البيئة.');
  process.exit(1);
}
client.login(BOT_TOKEN);

async function classifyNews(title, description) {
  const prompt = `صنف هذا الخبر إلى "عاجل" أو "عادي" بناءً على المحتوى: العنوان: "${title}"، الوصف: "${description}". أجب فقط بـ "عاجل" أو "عادي".`;
  const response = await queryGemini(prompt);
  return response.trim() === 'عاجل' ? 'urgent' : 'normal';
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

async function generateDailySummary(newsArray) {
  const prompt = `لخص هذه الأخبار في خبر واحد موجز ومثير: ${newsArray.map(n => `${n.title}: ${n.description}`).join(' | ')}`;
  return await queryGemini(prompt);
}

io.on('connection', (socket) => {
  socket.emit('loadNews', dailyNews);
  socket.on('chatMessage', async (msg) => {
    const newsContext = dailyNews.map(n => `${n.title}: ${n.description}`).join(' | ');
    const prompt = `أنت "مسؤول الأخبار". بناءً على الأخبار التالية: "${newsContext}"، أجب على هذا السؤال: "${msg}" باللغة العربية.`;
    const response = await queryGemini(prompt);
    socket.emit('botResponse', response);
  });
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.get('/summarize', async (req, res) => {
  const summary = await generateDailySummary(dailyNews);
  io.emit('dailySummary', summary);
  res.send('تم التلخيص!');
});

server.listen(3000, () => {
  console.log('الخادم يعمل على المنفذ 3000');
});

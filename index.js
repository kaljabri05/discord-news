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

// بقية الكود (client.on, classifyNews, queryGemini, إلخ) كما هو...

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

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('خطأ: رمز البوت غير معرف! تأكد من تعيين BOT_TOKEN في متغيرات البيئة.');
  process.exit(1);
}
client.login(BOT_TOKEN);

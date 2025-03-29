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

const CHANNEL_ID = '1293122239964909661'; // معرف قناة Discord
let dailyNews = [];
let pinsData = require('./pins.json').pins; // تحميل بيانات الدبابيس

// تهيئة التخزين المستمر
(async () => {
  await storage.init({ dir: 'storage' });
  const storedNews = await storage.getItem('dailyNews');
  const storedPins = await storage.getItem('pinsData');
  if (storedNews) dailyNews = storedNews;
  if (storedPins) pinsData = storedPins;
})();

// عندما يصبح البوت جاهزًا
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
            await updateRegionFromNews(news); // تحديث بيانات المنطقة عند تحميل الأخبار القديمة
          }
        });
      }
    });
    await storage.setItem('dailyNews', dailyNews);
  }
});

// استقبال الرسائل الجديدة من Discord
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
      await updateRegionFromNews(news); // تحديث بيانات المنطقة عند ورود خبر جديد
    });
  }
});

// تصنيف الأخبار بناءً على المنطقة
async function classifyNews(title, description) {
  const regions = [
    "Kansai", "Tohoku", "Chubu", "Kanto", "Kyushu", 
    "Ryukyu", "Shikoku", "Hokkaido", "Chugoku"
  ];
  const region = regions.find(r => title.includes(r) || description.includes(r)) || "Unknown";
  return { type: "normal", region }; // يمكن توسيع التصنيف باستخدام Gemini إذا لزم الأمر
}

// دالة الاستعلام من Gemini
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
    return 'لا تغييرات'; // قيمة افتراضية في حالة الفشل
  }
}

// تحديث بيانات المنطقة بناءً على الخبر باستخدام Gemini
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

    // تحليل استجابة Gemini (افتراض أنها نص بسيط يحتوي على تحديثات)
    const updates = {};
    const lines = geminiResponse.split('\n');
    lines.forEach(line => {
      if (line.includes("اقتصاد:")) updates.economy = line.replace("اقتصاد:", "").trim();
      if (line.includes("عسكرية:")) updates.military = line.replace("عسكرية:", "").trim();
      if (line.includes("ثقافة:")) updates.culture = line.replace("ثقافة:", "").trim();
    });

    // تحديث البيانات إذا كانت هناك تغييرات
    if (updates.economy && updates.economy !== pin.details.economy.description) {
      pin.details.economy.description = updates.economy;
    }
    if (updates.military && updates.military !== pin.details.military.description) {
      pin.details.military.description = updates.military;
    }
    if (updates.culture && updates.culture !== pin.details.culture.description) {
      pin.details.culture.description = updates.culture;
    }

    // حفظ التغييرات وإرسالها إلى العملاء
    await storage.setItem('pinsData', pinsData);
    io.emit('regionUpdated', { region, updatedData: pin.details });
  }
}

// إعدادات Socket.IO
io.on('connection', (socket) => {
  console.log('عميل متصل:', socket.id);

  // إرسال الأخبار الحالية إلى العميل الجديد
  socket.emit('initNews', dailyNews);

  // إرسال بيانات الدبابيس الحالية إلى العميل الجديد
  socket.emit('initPins', pinsData);

  // استقبال طلب تحديث المنطقة من العميل (في حالة يدوية)
  socket.on('updateRegion', async ({ region, news }) => {
    await updateRegionFromNews(news);
  });

  socket.on('disconnect', () => {
    console.log('عميل قطع الاتصال:', socket.id);
  });
});

// تقديم الملفات الثابتة
app.use(express.static(__dirname));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/pins.json', (req, res) => {
  res.json({ pins: pinsData, lines: [] });
});

// تشغيل الخادم
server.listen(3000, () => {
  console.log('الخادم يعمل على المنفذ 3000');
});

// تسجيل البوت في Discord
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('خطأ: رمز البوت غير معرف! تأكد من تعيين BOT_TOKEN في متغيرات البيئة.');
  process.exit(1);
}
client.login(BOT_TOKEN);

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Client } = require('discord.js-selfbot-v13');
const Keyv = require('keyv');
const fs = require('fs').promises;
const path = require('path');
const { queryGemini } = require('./gemini'); 

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const client = new Client();
const storage = new Keyv('sqlite://storage/database.sqlite');
const CHANNEL_ID = '1293122239964909661'; 
const DISCORD_TOKEN = process.env.BOT_TOKEN; 
const PINS_FILE = path.join(__dirname, 'public', 'pins.json');
let dailyNews = [];
let countriesData = {};

app.use(express.static('public'));
app.use(express.json());

(async () => {
    await storage.clear(); // للتجربة فقط، احذفها في الإنتاج
    await storage.set('dailyNews', []);
    const storedNews = await storage.get('dailyNews');
    if (storedNews) dailyNews = storedNews;

    const pinsData = JSON.parse(await fs.readFile(PINS_FILE, 'utf8'));
    pinsData.pins.forEach(pin => {
        countriesData[pin.anime] = {
            position: pin.position,
            primary_color: pin.primary_color,
            secondary_color: pin.secondary_color,
            logo_url: pin.logo_url,
            status: 'مستقرة', // افتراضي
            leader: pin.details.government.leader,
            government: pin.details.government.description,
            economy: `${pin.details.economy.value} - ${pin.details.economy.description}`,
            military: `${pin.details.military.strength} - ${pin.details.military.description}`,
            culture: pin.details.culture.description,
            relations: {}
        };
    });
    io.emit('countriesUpdate', countriesData);
})();

app.get('/pins.json', async (req, res) => {
    try {
        const data = await fs.readFile(PINS_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        res.status(500).send('خطأ في قراءة البيانات');
    }
});

app.post('/save-pins', async (req, res) => {
    try {
        await fs.writeFile(PINS_FILE, JSON.stringify(req.body, null, 2), 'utf8');
        const pinsData = req.body.pins;
        countriesData = {};
        pinsData.forEach(pin => {
            countriesData[pin.anime] = {
                position: pin.position,
                primary_color: pin.primary_color,
                secondary_color: pin.secondary_color,
                logo_url: pin.logo_url,
                status: countriesData[pin.anime]?.status || 'مستقرة',
                leader: pin.details.government.leader,
                government: pin.details.government.description,
                economy: `${pin.details.economy.value} - ${pin.details.economy.description}`,
                military: `${pin.details.military.strength} - ${pin.details.military.description}`,
                culture: pin.details.culture.description,
                relations: countriesData[pin.anime]?.relations || {}
            };
        });
        io.emit('countriesUpdate', countriesData);
        res.status(200).send('تم حفظ البيانات');
    } catch (err) {
        console.error('خطأ في حفظ البيانات:', err);
        res.status(500).send('خطأ في حفظ البيانات');
    }
});

async function classifyNews(title, description) {
    const prompt = `
        صنف هذا الخبر إلى "عاجل" أو "عادي"، وحدد الدول المتأثرة في عالم فيتالم:
        العنوان: "${title}"، الوصف: "${description}".
        أجب بـ JSON: {"type": "عاجل" أو "عادي", "affectedCountries": ["اسم الدولة", ...]}
    `;
    const response = await queryGemini(prompt);
    return JSON.parse(response.trim());
}

async function updateCountriesData(news) {
    const prompt = `
        بناءً على هذا الخبر: "${news.title}: ${news.description}"،
        حدث معلومات الدول المتأثرة في عالم فيتالم (${news.affectedCountries.join(', ')}):
        - الحالة (مثل مستقرة، في حرب)
        - العلاقات بين الدول (مثل حلفاء، أعداء)
        - الاقتصاد، العسكرية، الثقافة إذا تأثرت.
        أجب بـ JSON: [{"country": "اسم الدولة", "status": "جديدة", "relations": {"دولة أخرى": "علاقة"}, "economy": "وصف", "military": "وصف", "culture": "وصف"}]
    `;
    const response = await queryGemini(prompt);
    const updates = JSON.parse(response.trim());
    updates.forEach(update => {
        if (countriesData[update.country]) {
            countriesData[update.country] = {
                ...countriesData[update.country],
                status: update.status,
                relations: update.relations,
                economy: update.economy,
                military: update.military,
                culture: update.culture
            };
        }
    });
    io.emit('countriesUpdate', countriesData);
}

client.on('messageCreate', async (message) => {
    if (message.channel.id === CHANNEL_ID && message.author.bot) {
        message.embeds.forEach(async embed => {
            if (!embed.description) return;
            const classification = await classifyNews(embed.title || '', embed.description);
            const news = {
                title: embed.title || 'بدون عنوان',
                description: embed.description,
                image: embed.image ? embed.image.url : null,
                timestamp: new Date().toLocaleString('ar-SA'),
                type: classification.type === 'عاجل' ? 'urgent' : 'normal',
                affectedCountries: classification.affectedCountries || []
            };
            if (!dailyNews.some(n => n.title === news.title && n.timestamp === news.timestamp)) {
                dailyNews.unshift(news);
                io.emit('newNews', news);
                await updateCountriesData(news);
                await storage.set('dailyNews', dailyNews);
            }
        });
    }
});

client.login(DISCORD_TOKEN);

server.listen(3000, () => console.log('Server running on port 3000'));

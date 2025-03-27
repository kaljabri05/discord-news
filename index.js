const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Client } = require('discord.js-selfbot-v13');
const Keyv = require('keyv');
const fs = require('fs').promises;
const path = require('path');
const { queryGemini } = require('./gemini');

// تهيئة Express و Socket.IO
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// تهيئة Discord Self-Bot Client
const client = new Client();

// تهيئة المسار لقاعدة البيانات
const dbPath = path.join(__dirname, 'storage', 'database.sqlite');
const storage = new Keyv(`sqlite://${dbPath}`, { table: 'news' });

// التحقق من وجود المجلد والملف
async function ensureDatabaseExists() {
    try {
        // التحقق من وجود مجلد storage
        await fs.access(path.join(__dirname, 'storage'));
    } catch (err) {
        console.log('Folder "storage" not found. Creating it...');
        await fs.mkdir(path.join(__dirname, 'storage'), { recursive: true });
    }

    try {
        // التحقق من وجود ملف database.sqlite
        await fs.access(dbPath);
    } catch (err) {
        console.log('Database file not found. Creating a new one...');
        await fs.writeFile(dbPath, '');
    }
}

// تنفيذ التحقق قبل بدء التطبيق
ensureDatabaseExists().then(() => {
    console.log('Database setup complete.');
}).catch(err => {
    console.error('Error setting up database:', err);
});

// المسار لملف pins.json
const PINS_FILE = path.join(__dirname, 'public', 'pins.json');

let dailyNews = [];
let countriesData = {};

// إعداد Express
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
            status: 'مستقرة',
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

// API Endpoints
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

// تصنيف الأخبار باستخدام Gemini
async function classifyNews(title, description) {
    const prompt = `
        صنف هذا الخبر إلى "عاجل" أو "عادي"، وحدد الدول المتأثرة في عالم فيتالم:
        العنوان: "${title}"، الوصف: "${description}".
        أجب بـ JSON: {"type": "عاجل" أو "عادي", "affectedCountries": ["اسم الدولة", ...]}
    `;
    const response = await queryGemini(prompt);
    return JSON.parse(response.trim());
}

// تحديث بيانات الدول بناءً على الأخبار
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

// الاستماع إلى رسائل Discord
client.on('messageCreate', async (message) => {
    if (message.channel.id === '1293122239964909661' && message.author.bot) {
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

// تسجيل الدخول باستخدام BOT_TOKEN من Environment Variables
client.login(process.env.BOT_TOKEN);

// تشغيل الخادم
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

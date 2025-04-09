const express = require('express');
const Discord = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const client = new Discord.Client({ intents: ['GUILDS', 'GUILD_MESSAGES'] });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.use(express.json());
app.use(express.static(__dirname));

let newsCache = [];
let storyCache = [];

client.once('ready', () => {
  console.log('Discord Bot Ready');
});

// Login to Discord
client.login(process.env.DISCORD_BOT_TOKEN);

// Fetch News
app.get('/api/news', async (req, res) => {
  try {
    const channel = await client.channels.fetch(process.env.NEWS_CHANNEL_ID);
    const messages = await channel.messages.fetch({ limit: 50 });
    newsCache = messages.map(msg => ({ content: msg.content, timestamp: msg.createdTimestamp })).slice(0, 50);
    res.json(newsCache.slice(0, 25));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

// Fetch Stories
app.get('/api/stories', async (req, res) => {
  try {
    const channel = await client.channels.fetch(process.env.STORY_CHANNEL_ID);
    const messages = await channel.messages.fetch({ limit: 25 });
    storyCache = messages.map(msg => ({ title: msg.content, id: msg.id }));
    res.json(storyCache);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stories' });
  }
});

// Gemini Chatbot for News
app.post('/api/gemini/news', async (req, res) => {
  const { prompt } = req.body;
  const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
  const context = `أنا مؤرخ ملكي من عالم فيتالم. لديّ معلومات عن آخر 50 خبرًا في العالم: ${JSON.stringify(newsCache)}. استجب بأسلوب ملكي وعربي فصيح يليق بعالم فيتالم.`;
  const result = await model.generateContent(`${context}\n\nالسؤال: ${prompt}`);
  res.json({ response: result.response.text() });
});

// Gemini Chatbot for Stories
app.post('/api/gemini/stories', async (req, res) => {
  const { prompt, selectedStories } = req.body;
  const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
  const context = `أنا راوي قصص من عالم فيتالم. لديّ قصص مختارة: ${JSON.stringify(selectedStories)}. استجب بأسلوب سردي وعربي فصيح يليق بعالم فيتالم.`;
  const result = await model.generateContent(`${context}\n\nالسؤال: ${prompt}`);
  res.json({ response: result.response.text() });
});

// Update Pins
app.post('/api/pins', async (req, res) => {
  try {
    await fs.writeFile(path.join(__dirname, 'pins.json'), JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update pins' });
  }
});

// Fetch Pins
app.get('/api/pins', async (req, res) => {
  try {
    const pins = await fs.readFile(path.join(__dirname, 'pins.json'), 'utf8');
    res.json(JSON.parse(pins));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pins' });
  }
});

// Update Pins with Gemini AI
app.get('/api/update-pins', async (req, res) => {
  try {
    const pins = JSON.parse(await fs.readFile(path.join(__dirname, 'pins.json'), 'utf8'));
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    const context = `أنا مؤرخ ملكي من عالم فيتالم. لديّ آخر 50 خبرًا: ${JSON.stringify(newsCache)}. قم بتحديث اقتصاد وجيش الممالك بناءً على الأخبار الأخيرة بأسلوب يليق بعالم فيتالم:\n${JSON.stringify(pins)}`;
    const result = await model.generateContent(context);
    const updatedPins = JSON.parse(result.response.text());
    await fs.writeFile(path.join(__dirname, 'pins.json'), JSON.stringify(updatedPins, null, 2));
    res.json(updatedPins);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update pins with AI' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

document.addEventListener('DOMContentLoaded', async () => {
  const newsList = document.getElementById('news-list');
  const response = await fetch('/api/news');
  const news = await response.json();

  news.forEach(item => {
    const div = document.createElement('div');
    div.className = 'news-item';
    div.textContent = `${new Date(item.timestamp).toLocaleString('ar')} - ${item.content}`;
    newsList.appendChild(div);
  });
});

async function sendChat() {
  const input = document.getElementById('chat-input').value;
  const responseDiv = document.getElementById('chat-response');
  responseDiv.textContent = 'جارٍ التحميل...';

  const response = await fetch('/api/gemini/news', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: input })
  });
  const data = await response.json();
  responseDiv.textContent = data.response;
}

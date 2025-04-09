let selectedStories = [];

document.addEventListener('DOMContentLoaded', async () => {
  const storyList = document.getElementById('story-list');
  const response = await fetch('/api/stories');
  const stories = await response.json();

  stories.forEach(story => {
    const div = document.createElement('div');
    div.className = 'story-card';
    div.innerHTML = `
      <input type="checkbox" onchange="updateSelection('${story.id}', this.checked)">
      ${story.title}
    `;
    storyList.appendChild(div);
  });
});

function updateSelection(id, checked) {
  if (checked && selectedStories.length < 5) {
    selectedStories.push(id);
  } else if (!checked) {
    selectedStories = selectedStories.filter(s => s !== id);
  } else {
    alert('يمكنك اختيار 5 قصص فقط!');
    event.target.checked = false;
  }
}

async function sendChat() {
  const input = document.getElementById('chat-input').value;
  const responseDiv = document.getElementById('chat-response');
  responseDiv.textContent = 'جارٍ التحميل...';

  const response = await fetch('/api/gemini/stories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: input, selectedStories })
  });
  const data = await response.json();
  responseDiv.textContent = data.response;
}

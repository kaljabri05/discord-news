document.addEventListener('DOMContentLoaded', async () => {
  const map = L.map('map').setView([35.6762, 139.6503], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    className: 'map-tiles'
  }).addTo(map);

  // Apply sepia filter
  const style = document.createElement('style');
  style.innerHTML = '.map-tiles { filter: sepia(80%) hue-rotate(-20deg) brightness(90%); }';
  document.head.appendChild(style);

  const response = await fetch('/api/pins');
  const kingdoms = await response.json();

  kingdoms.slice(0, 8).forEach(kingdom => {
    const marker = L.circleMarker([kingdom.lat, kingdom.lng], {
      color: kingdom.color,
      fillColor: kingdom.color,
      fillOpacity: 0.8,
      radius: 10
    }).addTo(map);

    marker.on('click', () => {
      const modal = document.getElementById('modal');
      modal.style.display = 'block';
      modal.innerHTML = `
        <h2>${kingdom.name}</h2>
        <img src="${kingdom.image}" alt="${kingdom.name}">
        <p>الحاكم: ${kingdom.ruler}</p>
        <p>الاقتصاد: ${kingdom.economy.toLocaleString()} ذهب</p>
        <p>الجيش: ${kingdom.army.toLocaleString()} جندي</p>
        <button onclick="document.getElementById('modal').style.display='none'">إغلاق</button>
      `;
    });
  });

  // Update pins with AI
  await fetch('/api/update-pins');
});

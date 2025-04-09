let pinsData = [];

function checkPassword() {
  const password = document.getElementById('password').value;
  if (password === '2704') {
    document.getElementById('admin-content').style.display = 'block';
    loadPins();
  } else {
    alert('كلمة المرور غير صحيحة!');
  }
}

async function loadPins() {
  const response = await fetch('/api/pins');
  pinsData = await response.json();
  const form = document.getElementById('pins-form');

  pinsData.forEach((pin, index) => {
    form.innerHTML += `
      <div>
        <h3>${pin.name}</h3>
        <input type="text" id="name-${index}" value="${pin.name}" placeholder="الاسم">
        <input type="text" id="ruler-${index}" value="${pin.ruler}" placeholder="الحاكم">
        <input type="text" id="lat-${index}" value="${pin.lat}" placeholder="خط العرض">
        <input type="text" id="lng-${index}" value="${pin.lng}" placeholder="خط الطول">
        <input type="text" id="economy-${index}" value="${pin.economy}" placeholder="الاقتصاد">
        <input type="text" id="army-${index}" value="${pin.army}" placeholder="الجيش">
        <input type="color" id="color-${index}" value="${pin.color}" placeholder="اللون">
        <input type="text" id="image-${index}" value="${pin.image}" placeholder="رابط الصورة">
      </div>
    `;
  });
}

async function savePins() {
  const updatedPins = pinsData.map((pin, index) => ({
    id: pin.id,
    name: document.getElementById(`name-${index}`).value,
    ruler: document.getElementById(`ruler-${index}`).value,
    lat: parseFloat(document.getElementById(`lat-${index}`).value),
    lng: parseFloat(document.getElementById(`lng-${index}`).value),
    economy: parseInt(document.getElementById(`economy-${index}`).value),
    army: parseInt(document.getElementById(`army-${index}`).value),
    color: document.getElementById(`color-${index}`).value,
    image: document.getElementById(`image-${index}`).value
  }));

  const response = await fetch('/api/pins', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updatedPins)
  });
  const data = await response.json();
  document.getElementById('status').textContent = data.success ? 'تم الحفظ بنجاح!' : 'فشل في الحفظ!';
}

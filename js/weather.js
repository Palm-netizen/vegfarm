// js/weather.js — พยากรณ์อากาศ 7 วัน (Open-Meteo ฟรี ไม่ต้องใช้คีย์) + คำแนะนำกันผักเสียหาย
// ตำแหน่งฟาร์มเก็บในเครื่อง + app_settings (key: farm_location) ให้ทุกเครื่องใช้ตำแหน่งเดียวกัน

const WX_LOC_KEY = 'vf_farm_loc';
const WX_CACHE_KEY = 'vf_wx_cache';
const WX_TTL = 3 * 3600 * 1000;          // ดึงใหม่ทุก 3 ชั่วโมง
const WX_RAIN_HIGH = 60;                 // % โอกาสฝนที่ถือว่า "ฝนน่าจะตก"

function wxLoc() {
  try { return JSON.parse(localStorage.getItem(WX_LOC_KEY) || 'null'); } catch (e) { return null; }
}
async function wxSaveLoc(loc) {
  try { localStorage.setItem(WX_LOC_KEY, JSON.stringify(loc)); localStorage.removeItem(WX_CACHE_KEY); } catch (e) {}
  try {
    const { data } = await db.from('app_settings').select('id').eq('key', 'farm_location');
    if (data && data.length) await db.from('app_settings').update({ value: loc }).eq('id', data[0].id);
    else await db.from('app_settings').insert({ key: 'farm_location', value: loc });
  } catch (e) { /* ยังไม่มีตารางบนคลาวด์ — ใช้ค่าในเครื่อง */ }
}
// เครื่องที่ยังไม่ได้ตั้ง → ใช้ตำแหน่งที่บันทึกไว้บนคลาวด์
async function wxLoadLocCloud() {
  if (wxLoc()) return wxLoc();
  try {
    const { data, error } = await db.from('app_settings').select('value').eq('key', 'farm_location');
    if (error || !data || !data.length || !data[0].value) return null;
    const v = typeof data[0].value === 'string' ? JSON.parse(data[0].value) : data[0].value;
    if (v && v.lat && v.lon) { localStorage.setItem(WX_LOC_KEY, JSON.stringify(v)); return v; }
  } catch (e) {}
  return null;
}

function wxUseMyLocation() {
  if (!navigator.geolocation) return showToast('มือถือนี้ใช้ตำแหน่งไม่ได้', 'error');
  showToast('กำลังหาตำแหน่งฟาร์ม...');
  navigator.geolocation.getCurrentPosition(async pos => {
    const loc = { lat: +pos.coords.latitude.toFixed(3), lon: +pos.coords.longitude.toFixed(3) };
    await wxSaveLoc(loc);
    showToast('บันทึกตำแหน่งฟาร์มแล้ว');
    renderWeatherDash(true);
  }, () => {
    showToast('ใช้ตำแหน่งไม่ได้ — กดอนุญาต "ตำแหน่ง" ให้แอป แล้วลองใหม่', 'error');
  }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
}

// ดึงพยากรณ์รายวัน (แคช 3 ชม.) → [{date, code, tmax, tmin, rainProb, rainMm, sunH, uv}]
async function wxFetch(loc, force) {
  try {
    const c = JSON.parse(localStorage.getItem(WX_CACHE_KEY) || 'null');
    if (!force && c && c.lat === loc.lat && c.lon === loc.lon && Date.now() - c.at < WX_TTL) return { days: c.days, at: c.at };
  } catch (e) {}
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + loc.lat + '&longitude=' + loc.lon +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunshine_duration,uv_index_max' +
    '&timezone=Asia%2FBangkok&forecast_days=7';
  const res = await fetch(url);
  if (!res.ok) throw new Error('weather ' + res.status);
  const j = await res.json();
  const d = j.daily || {};
  const days = (d.time || []).map((t, i) => ({
    date: t, code: d.weather_code?.[i] ?? 0,
    tmax: d.temperature_2m_max?.[i], tmin: d.temperature_2m_min?.[i],
    rainProb: d.precipitation_probability_max?.[i] ?? 0, rainMm: d.precipitation_sum?.[i] ?? 0,
    sunH: (d.sunshine_duration?.[i] ?? 0) / 3600, uv: d.uv_index_max?.[i] ?? 0
  }));
  const at = Date.now();
  try { localStorage.setItem(WX_CACHE_KEY, JSON.stringify({ lat: loc.lat, lon: loc.lon, at, days })); } catch (e) {}
  return { days, at };
}

function wxIcon(code) {
  if (code === 0) return '☀️';
  if (code <= 2) return '🌤️';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if (code >= 95) return '⛈️';
  if (code >= 80) return '🌧️';
  if (code >= 61) return '🌧️';
  if (code >= 51) return '🌦️';
  return '🌤️';
}
function wxDayName(iso, i) {
  if (i === 0) return 'วันนี้';
  if (i === 1) return 'พรุ่งนี้';
  return ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'][new Date(iso + 'T00:00:00').getDay()];
}
function wxDateLabel(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
}

// แปลงพยากรณ์เป็นคำแนะนำกันผักเสียหาย
function wxAdvice(days) {
  const out = [];
  const rainy = d => d.rainProb >= WX_RAIN_HIGH;
  const today = (typeof vfLocalISO === 'function') ? vfLocalISO(new Date()) : days[0]?.date;

  // 1) วันฉีดบำรุงใบ ฝนจะตก → เลื่อนไปวันที่ฝนน้อยที่สุดในสัปดาห์เดียวกัน
  if (typeof FOLIAR_SCHEDULE !== 'undefined' && typeof foliarWeekStart === 'function') {
    const ws = foliarWeekStart(new Date());
    const sprayDay = foliarDayOf(ws);
    const st = foliarStatus(ws);
    const sd = days.find(d => d.date === sprayDay);
    if (sd && st !== 'done' && sprayDay >= today && rainy(sd)) {
      const weekEnd = (typeof addDays === 'function') ? addDays(ws, 6) : sprayDay;
      const alt = days.filter(d => d.date !== sprayDay && d.date >= today && d.date <= weekEnd && d.rainProb < WX_RAIN_HIGH)
        .sort((a, b) => a.rainProb - b.rainProb)[0];
      out.push({ level: 'warn', icon: '💧', title: `วัน${FOLIAR_SCHEDULE.dayName}ฝนมีโอกาสตก ${sd.rainProb}% — ฝนจะชะปุ๋ยทางใบ`,
        action: alt ? `เลื่อนไปฉีด ${wxDateLabel(alt.date)} (ฝน ${alt.rainProb}%) · ฉีดช่วงเช้าที่ใบแห้ง` : 'สัปดาห์นี้ฝนเยอะ → ฉีดช่วงที่ฟ้าเปิด ใบแห้ง อย่างน้อย 4–6 ชม. ก่อนฝน' });
    }
  }

  // 2) ฝนหนัก (≥ 20 มม.) ใน 3 วัน → ระบายน้ำ กันรากเน่า
  const heavy = days.slice(0, 3).find(d => d.rainMm >= 20);
  if (heavy) out.push({ level: 'danger', icon: '🌧️', title: `ฝนหนัก ~${Math.round(heavy.rainMm)} มม. ${wxDateLabel(heavy.date)}`,
    action: 'ล้างร่อง/ระบายน้ำให้พร้อม · ระวังรากเน่า ใบอิ่มน้ำ · งดใส่ปุ๋ยก่อนฝน' });

  // 3) ฝนติดกัน ≥ 3 วัน → เสี่ยงเชื้อรา
  let run = 0, runStart = null, best = 0, bestStart = null;
  days.forEach(d => { if (rainy(d)) { if (!run) runStart = d.date; run++; if (run > best) { best = run; bestStart = runStart; } } else run = 0; });
  if (best >= 3) out.push({ level: 'warn', icon: '🍄', title: `ฝนติดกัน ${best} วัน (เริ่ม ${wxDateLabel(bestStart)}) — เสี่ยงเชื้อรา`,
    action: 'เปิดทางลมระหว่างแปลง · เก็บใบเสียทิ้ง · เตรียมยากันเชื้อรา · รดน้ำน้อยลง' });

  // 4) ฟ้าปิดหลายวัน แล้วแดดจัด → กางสแลง (ผักไม่โดนแดด 3–4 วันจะตั้งตัวไม่ทัน)
  for (let i = 2; i < days.length; i++) {
    const before = days.slice(Math.max(0, i - 3), i);
    if (before.length >= 2 && before.every(d => d.sunH < 3) && (days[i].sunH >= 8 || days[i].uv >= 9)) {
      out.push({ level: 'warn', icon: '⛱️', title: `ฟ้าปิดมาหลายวัน แล้วแดดจัด ${wxDateLabel(days[i].date)}`,
        action: 'กางสแลง/ตาข่ายพรางแสงตั้งแต่เช้าวันนั้น ผักที่ไม่โดนแดดนานจะใบไหม้ง่าย' });
      break;
    }
  }

  // 5) ร้อนจัด ≥ 35°C
  const hot = days.slice(0, 5).find(d => d.tmax >= 35);
  if (hot) out.push({ level: 'warn', icon: '🥵', title: `ร้อนจัด ${Math.round(hot.tmax)}°C ${wxDateLabel(hot.date)}`,
    action: 'รดน้ำเช้า-เย็น · พรางแสงช่วงเที่ยง · เก็บผักช่วงเช้ามืด' });

  return out;
}

async function renderWeatherDash(force) {
  const el = document.getElementById('dash-weather');
  if (!el) return;
  const loc = wxLoc() || await wxLoadLocCloud();
  if (!loc) {
    el.innerHTML = `<div class="card wx-card wx-setup">
      <div class="wx-setup-text"><b>🌦️ พยากรณ์อากาศ 7 วัน (ฟรี)</b><span>ตั้งตำแหน่งฟาร์มครั้งเดียว แอปจะเตือนฝน/แดด ล่วงหน้าเพื่อกันผักเสียหาย</span></div>
      <button class="btn btn-primary btn-sm" onclick="wxUseMyLocation()">📍 ใช้ตำแหน่งตอนนี้</button>
    </div>`;
    return;
  }
  let days, at, offline = false;
  try { ({ days, at } = await wxFetch(loc, force)); }
  catch (e) {
    try { const c = JSON.parse(localStorage.getItem(WX_CACHE_KEY) || 'null'); if (c) { days = c.days; at = c.at; offline = true; } } catch (x) {}
    if (!days) { el.innerHTML = `<div class="card wx-card"><div class="text-sub">🌦️ โหลดพยากรณ์อากาศไม่ได้ (ไม่มีอินเทอร์เน็ต) <a href="#" onclick="event.preventDefault();renderWeatherDash(true)">ลองใหม่</a></div></div>`; return; }
  }
  const strip = days.map((d, i) => `<div class="wx-day ${d.rainProb >= WX_RAIN_HIGH ? 'rain' : ''}">
      <span class="wx-dn">${wxDayName(d.date, i)}</span>
      <span class="wx-ic">${wxIcon(d.code)}</span>
      <span class="wx-t"><b>${Math.round(d.tmax)}°</b><small>${Math.round(d.tmin)}°</small></span>
      <span class="wx-r">💧${d.rainProb}%</span>
    </div>`).join('');
  const tips = wxAdvice(days);
  const time = new Date(at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  el.innerHTML = `<div class="card wx-card">
    <div class="wx-head"><b>🌦️ พยากรณ์อากาศ 7 วัน</b>
      <span>${offline ? 'ข้อมูลเก่า · ' : ''}อัปเดต ${time} <button class="wx-link" onclick="renderWeatherDash(true)" aria-label="ดึงใหม่">↻</button>
      <button class="wx-link" onclick="wxUseMyLocation()" aria-label="ตั้งตำแหน่งใหม่">📍</button></span></div>
    <div class="wx-strip">${strip}</div>
    ${tips.length ? tips.map(t => `<div class="advice-card ${t.level} wx-tip">
        <div class="advice-emoji">${t.icon}</div>
        <div class="advice-body"><div class="advice-title">${t.title}</div><div class="advice-action">${t.action}</div></div>
      </div>`).join('') : '<div class="wx-ok">✅ 7 วันนี้อากาศไม่น่าห่วง ทำงานตามแผนปกติ</div>'}
  </div>`;
}

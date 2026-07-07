// js/assistant.js — ผู้ช่วยฟาร์ม (rule-based, ทำงานในเครื่อง ฟรี ออฟไลน์)
// ตอบคำถามเรื่องการเพาะ/ผลผลิต/เป้าหมาย จากสูตรเดียวกับที่แอปใช้คำนวณ

const ASSIST_CHIPS = [
  'ฤดูนี้อัตรารอดเท่าไหร่',
  'อยากได้ 90 โล เพาะกี่เมล็ด',
  'เพาะ 1000 เมล็ด ได้กี่โล',
  'ปลูกกี่แปลงถึงพอเป้า',
  'ทำไมต้องเพาะเท่านี้'
];

function assistCtx() {
  const season = (typeof currentSeason === 'function') ? currentSeason() : { key: 'hot', label: 'หน้าร้อน' };
  const weather = season.key || 'hot';
  const rate = getSurvivalRate(weather);
  const kgPerPlant = weather === 'cold' ? (1 / 10) : (1 / 12);
  const yps = (rate / 100) * kgPerPlant;              // ผลผลิตต่อเมล็ด (กก.)
  const target = (typeof WEEKLY_TARGET_KG !== 'undefined') ? WEEKLY_TARGET_KG : 90;
  return { season, weather, rate, kgPerPlant, yps, target };
}

// คืนคำตอบ (string) หรือ null ถ้าไม่เข้าใจคำถาม
function vfAssistAnswer(qRaw) {
  const q = (qRaw || '').toLowerCase();
  const nums = (qRaw.match(/[\d][\d,]*(\.\d+)?/g) || []).map(x => parseFloat(x.replace(/,/g, ''))).filter(n => !isNaN(n));
  const n = nums[0];
  const c = assistCtx();
  const fmt = x => x.toLocaleString('th-TH', { maximumFractionDigits: 1 });
  const int = x => Math.round(x).toLocaleString('th-TH');
  const has = (...ks) => ks.some(k => q.includes(k));
  const askKg = has('โล', 'กก', 'กิโล');
  const gramPerPlant = c.weather === 'cold' ? '100' : '83';

  // ฤดู / อัตรารอด
  if (has('ฤดู', 'อากาศ', 'อัตรารอด', 'รอด')) {
    return `ตอนนี้เป็น${c.season.label} · อัตรารอด ${c.rate}% · น้ำหนัก ~${gramPerPlant} กรัม/ต้น\n👉 1 เมล็ด ≈ ${fmt(c.yps * 1000)} กรัม (${c.yps.toFixed(4)} กก.)`;
  }

  // ต้องเพาะกี่เมล็ด เพื่อได้ X โล
  if ((has('กี่เมล็ด', 'ต้องเพาะ', 'เพาะกี่', 'เพาะเท่าไหร่') && askKg) ||
      (has('อยากได้', 'ต้องการ') && askKg)) {
    const kg = n || c.target;
    const seeds = (typeof seedsForKg === 'function') ? seedsForKg(kg) : Math.ceil(kg / c.yps / 50) * 50;
    return `อยากได้ ${fmt(kg)} กก. → เพาะ ~${int(seeds)} เมล็ด (${c.season.label})\n📐 ${fmt(kg)} ÷ ${c.yps.toFixed(4)} กก./เมล็ด แล้วปัดขึ้นหลัก 50`;
  }

  // เพาะ N เมล็ด ได้กี่โล
  if (n && has('เมล็ด') && (has('กี่โล', 'กี่กก', 'ได้เท่าไหร่', 'ได้กี่', 'ผลผลิต', 'กี่กิโล'))) {
    const kg = parseFloat(calcEstimatedKg(n, c.weather, c.rate));
    return `เพาะ ${int(n)} เมล็ด (${c.season.label}) → รอด ${int(n * c.rate / 100)} ต้น → ได้ ~${fmt(kg)} กก.`;
  }

  // ปลูกกี่แปลง
  if (has('แปลง')) {
    const perPlot = c.target / 4;
    if (n) return `ปลูก ${int(n)} แปลง ≈ ${fmt(n * perPlot)} กก.\n(เฉลี่ยแปลงละ ~${fmt(perPlot)} กก. ตามเป้า 4 แปลง = ${c.target} กก.)`;
    return `เป้าคือ 4 แปลง/สัปดาห์ = ${c.target} กก. (เฉลี่ยแปลงละ ~${fmt(perPlot)} กก.)`;
  }

  // เป้าหมาย
  if (has('เป้า', 'ออเดอร์', '90')) {
    return `เป้าหมาย: ส่งออเดอร์ ${c.target} กก./สัปดาห์\n= ต้องปลูกให้ครบ 4 แปลง/สัปดาห์ (เฉลี่ยแปลงละ ~${fmt(c.target / 4)} กก.)`;
  }

  // ทำไม / อธิบาย / สูตร
  if (has('ทำไม', 'อธิบาย', 'คำนวณ', 'สูตร', 'ยังไง')) {
    return `สูตร: เมล็ดที่ต้องเพาะ = ผลผลิตที่ขาด ÷ (อัตรารอด × น้ำหนัก/ต้น)\n` +
      `ตอนนี้ ${c.season.label}: ${c.rate}% × ${c.weather === 'cold' ? '0.10' : '0.083'} = ${c.yps.toFixed(4)} กก./เมล็ด\n` +
      `เช่น ขาด ${c.target} กก. → ${c.target} ÷ ${c.yps.toFixed(4)} ≈ ${int(c.target / c.yps)} → ปัดเป็น ${int((typeof seedsForKg === 'function') ? seedsForKg(c.target) : 0)} เมล็ด`;
  }

  return null;
}

function assistHelp() {
  return 'ลองถามแบบนี้ได้ค่ะ 🙂\n• "อยากได้ 60 โล เพาะกี่เมล็ด"\n• "เพาะ 1500 เมล็ด ได้กี่โล"\n• "ปลูก 3 แปลง ได้กี่โล"\n• "ฤดูนี้อัตรารอดเท่าไหร่"\n• "ทำไมต้องเพาะเท่านี้"';
}

// ===== UI =====
function openAssistant() {
  const m = document.getElementById('assist-modal');
  const chips = document.getElementById('assist-chips');
  if (chips) chips.innerHTML = ASSIST_CHIPS.map(c => `<button class="assist-chip" onclick="assistAsk('${c.replace(/'/g, "\\'")}')">${c}</button>`).join('');
  const log = document.getElementById('assist-log');
  if (log && !log.dataset.greeted) {
    assistPush('bot', 'สวัสดีค่ะ 🌱 ถามเรื่องการเพาะ ผลผลิต หรือเป้าหมายได้เลย — แตะคำถามด่วนด้านบน หรือพิมพ์คำถามเองก็ได้');
    log.dataset.greeted = '1';
  }
  m.style.display = 'flex';
}
function closeAssistant() { document.getElementById('assist-modal').style.display = 'none'; }

function assistPush(who, text) {
  const log = document.getElementById('assist-log');
  if (!log) return;
  const div = document.createElement('div');
  div.className = 'assist-msg ' + who;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function assistAsk(q) {
  document.getElementById('assist-input').value = q;
  assistSend();
}

function assistSend() {
  const input = document.getElementById('assist-input');
  const q = (input.value || '').trim();
  if (!q) return;
  assistPush('user', q);
  input.value = '';
  const ans = vfAssistAnswer(q) || assistHelp();
  setTimeout(() => assistPush('bot', ans), 120);
}

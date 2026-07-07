// js/assistant.js — ผู้ช่วยฟาร์ม (rule-based, ทำงานในเครื่อง ฟรี ออฟไลน์)
// ตอบคำถามเรื่องการเพาะ/ผลผลิต/เป้าหมาย + เรียกดูข้อมูลที่บันทึกในแอป + อธิบายเหตุผลคำแนะนำ

const ASSIST_CHIPS = [
  'ขายได้เท่าไหร่เดือนนี้',
  'มีลูกค้ากี่คน',
  'กำไรเดือนนี้เท่าไหร่',
  'ตอนนี้ปลูกกี่แปลง',
  'ทำไมถึงแนะนำแบบนี้',
  'อยากได้ 90 โล เพาะกี่เมล็ด',
  'เพาะ 1000 เมล็ด ได้กี่โล',
  'ลูกค้าคนไหนซื้อเยอะสุด'
];

function assistCtx() {
  const season = (typeof currentSeason === 'function') ? currentSeason() : { key: 'hot', label: 'หน้าร้อน' };
  const weather = season.key || 'hot';
  const rate = getSurvivalRate(weather);
  const kgPerPlant = weather === 'cold' ? (1 / 10) : (1 / 12);
  const yps = (rate / 100) * kgPerPlant;
  const target = (typeof WEEKLY_TARGET_KG !== 'undefined') ? WEEKLY_TARGET_KG : 90;
  return { season, weather, rate, kgPerPlant, yps, target };
}

// ช่วงเวลา
function assistDates() {
  const today = new Date().toISOString().split('T')[0];
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const nmD = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonth = `${nmD.getFullYear()}-${String(nmD.getMonth() + 1).padStart(2, '0')}-01`;
  const wd = new Date(today); const dow = (wd.getDay() + 6) % 7; wd.setDate(wd.getDate() - dow);
  const weekStart = wd.toISOString().split('T')[0];
  return { today, monthStart, nextMonth, weekStart };
}

const bht = x => '฿' + x.toLocaleString('th-TH', { maximumFractionDigits: 0 });
const kgt = x => x.toLocaleString('th-TH', { maximumFractionDigits: 1 });
const cnt = x => x.toLocaleString('th-TH');

function periodOf(q) {
  if (q.includes('วันนี้')) return 'today';
  if (q.includes('สัปดาห์') || q.includes('อาทิตย์')) return 'week';
  if (q.includes('ทั้งหมด') || q.includes('ตั้งแต่แรก') || q.includes('รวมทั้งหมด')) return 'all';
  return 'month';
}

// ===== ตัวจัดการคำถามเรื่องข้อมูล (async) =====
async function dataSales(period) {
  const D = assistDates();
  let gte, lt, label;
  if (period === 'today') { gte = D.today; lt = addDays(D.today, 1); label = 'วันนี้'; }
  else if (period === 'week') { gte = D.weekStart; lt = addDays(D.weekStart, 7); label = 'สัปดาห์นี้'; }
  else if (period === 'all') { label = 'ทั้งหมด'; }
  else { gte = D.monthStart; lt = D.nextMonth; label = 'เดือนนี้'; }
  let q = db.from('income').select('total_amount,kg_sold');
  if (gte) q = q.gte('income_date', gte);
  if (lt) q = q.lt('income_date', lt);
  const { data } = await q;
  const rows = data || [];
  const amt = rows.reduce((s, r) => s + parseFloat(r.total_amount || 0), 0);
  const kg = rows.reduce((s, r) => s + parseFloat(r.kg_sold || 0), 0);
  if (!rows.length) return `ยอดขาย${label}: ยังไม่มีรายการ`;
  return `💰 ยอดขาย${label}\n${kgt(kg)} กก. รวม ${bht(amt)} (${rows.length} ครั้ง)`;
}

async function dataCustomers() {
  const [{ data: custs }, { data: inc }] = await Promise.all([
    db.from('customers').select('name'),
    db.from('income').select('buyer')
  ]);
  const total = (custs || []).length;
  const buyerNames = new Set((inc || []).map(r => r.buyer).filter(Boolean));
  const bought = (custs || []).filter(c => buyerNames.has(c.name)).length;
  return `👥 ลูกค้าทั้งหมด ${cnt(total)} คน\nเคยซื้อแล้ว ${cnt(bought)} คน · ว่าที่ลูกค้า ${cnt(total - bought)} คน`;
}

async function dataFinance(kind) {
  const D = assistDates();
  const FIXED = (typeof FIXED_MONTHLY !== 'undefined') ? FIXED_MONTHLY : 11100;
  const [{ data: inc }, { data: exp }] = await Promise.all([
    db.from('income').select('total_amount').gte('income_date', D.monthStart).lt('income_date', D.nextMonth),
    db.from('expenses').select('amount').gte('expense_date', D.monthStart).lt('expense_date', D.nextMonth)
  ]);
  const income = (inc || []).reduce((s, r) => s + parseFloat(r.total_amount || 0), 0);
  const expense = (exp || []).reduce((s, r) => s + parseFloat(r.amount || 0), 0) + FIXED;
  if (kind === 'expense') return `📤 รายจ่ายเดือนนี้: ${bht(expense)}\n(รวมค่าคงที่ ค่าแรง+ค่าไฟ ${bht(FIXED)})`;
  const profit = income - expense;
  return `📊 กำไรเดือนนี้: ${bht(profit)}\nรายรับ ${bht(income)} − รายจ่าย ${bht(expense)}`;
}

async function dataPlots() {
  const { data } = await db.from('plots').select('plant_date,is_harvested');
  const rows = data || [];
  const active = rows.filter(p => p.plant_date && !p.is_harvested).length;
  const harvested = rows.filter(p => p.is_harvested).length;
  const empty = rows.filter(p => !p.plant_date).length;
  return `🌿 แปลงทั้งหมด ${rows.length}\nกำลังปลูก ${active} · เก็บแล้ว ${harvested} · ว่าง ${empty}`;
}

async function dataSeeds(period) {
  const D = assistDates();
  let q = db.from('seed_batches').select('seed_count,estimated_kg');
  let label = 'ทั้งหมด';
  if (period === 'month') { q = q.gte('seed_date', D.monthStart).lt('seed_date', D.nextMonth); label = 'เดือนนี้'; }
  const { data } = await q;
  const rows = data || [];
  const seeds = rows.reduce((s, r) => s + parseInt(r.seed_count || 0), 0);
  const kg = rows.reduce((s, r) => s + parseFloat(r.estimated_kg || 0), 0);
  return `🌱 เพาะ${label}: ${rows.length} รอบ\n${cnt(seeds)} เมล็ด · คาดได้ ~${kgt(kg)} กก.`;
}

async function dataProblems() {
  const { data } = await db.from('problems').select('resolved');
  const rows = data || [];
  const open = rows.filter(p => !p.resolved).length;
  return `⚠️ ปัญหาทั้งหมด ${rows.length} เรื่อง\nกำลังแก้ ${open} · แก้สำเร็จ ${rows.length - open}`;
}

async function dataTopCustomer() {
  const { data } = await db.from('income').select('buyer,total_amount');
  const agg = {};
  (data || []).forEach(r => { if (r.buyer) agg[r.buyer] = (agg[r.buyer] || 0) + parseFloat(r.total_amount || 0); });
  const sorted = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (!sorted.length) return 'ยังไม่มีข้อมูลการขายให้จัดอันดับ';
  return '🏆 ลูกค้าที่ซื้อเยอะสุด\n' + sorted.map(([n, v], i) => `${i + 1}. ${n} — ${bht(v)}`).join('\n');
}

async function dataTodayOrders() {
  const D = assistDates();
  const { data } = await db.from('orders').select('kg,delivered').eq('order_date', D.today);
  const rows = data || [];
  if (!rows.length) return '🚚 วันนี้ยังไม่มีออเดอร์ที่ต้องส่ง';
  const kg = rows.reduce((s, o) => s + parseFloat(o.kg || 0), 0);
  const done = rows.filter(o => o.delivered).reduce((s, o) => s + parseFloat(o.kg || 0), 0);
  return `🚚 ออเดอร์วันนี้: ${rows.length} ราย รวม ${kgt(kg)} กก.\nส่งแล้ว ${kgt(done)} กก. · เหลือ ${kgt(kg - done)} กก.`;
}

function adviceReason() {
  const items = window.vfLastAdvice || [];
  const base = 'คำแนะนำมาจากการพยากรณ์ผลผลิต 8 สัปดาห์ล่วงหน้า (เก็บได้ = เพาะ+45วัน) เทียบเป้า 90 กก./สัปดาห์ + สถานะแปลง/ออเดอร์';
  if (!items.length) return `ตอนนี้ไม่มีคำแนะนำเร่งด่วน ทุกอย่างเป็นไปตามแผน ✅\n\n${base}`;
  return '💡 เหตุผลของคำแนะนำวันนี้:\n\n' + items.map(it => `${it.icon} ${it.title}\n   → ${it.action}`).join('\n\n') + `\n\n📌 ${base}`;
}

// ===== ตัวจัดการคำถามคำนวณ (sync) =====
function calcAnswer(qRaw, q, nums) {
  const n = nums[0];
  const c = assistCtx();
  const has = (...ks) => ks.some(k => q.includes(k));
  const askKg = has('โล', 'กก', 'กิโล');
  const gramPerPlant = c.weather === 'cold' ? '100' : '83';
  const yieldAsk = has('ได้กี่โล', 'ได้กี่กก', 'ผลผลิต', 'ได้เท่าไหร่', 'กี่กิโล', 'ได้กี่');

  if (has('ฤดู', 'อากาศ', 'อัตรารอด', 'รอด'))
    return `🌤️ ตอนนี้${c.season.label} · อัตรารอด ${c.rate}% · น้ำหนัก ~${gramPerPlant} กรัม/ต้น\n👉 1 เมล็ด ≈ ${kgt(c.yps * 1000)} กรัม (${c.yps.toFixed(4)} กก.)`;

  if ((has('กี่เมล็ด', 'ต้องเพาะ', 'เพาะกี่', 'เพาะเท่าไหร่') && askKg) || (has('อยากได้', 'ต้องการ') && askKg)) {
    const kg = n || c.target;
    const seeds = (typeof seedsForKg === 'function') ? seedsForKg(kg) : Math.ceil(kg / c.yps / 50) * 50;
    return `🌱 อยากได้ ${kgt(kg)} กก. → เพาะ ~${cnt(seeds)} เมล็ด (${c.season.label})\n📐 ${kgt(kg)} ÷ ${c.yps.toFixed(4)} กก./เมล็ด แล้วปัดขึ้นหลัก 50`;
  }

  if (n && has('เมล็ด') && yieldAsk) {
    const kg = parseFloat(calcEstimatedKg(n, c.weather, c.rate));
    return `🌱 เพาะ ${cnt(n)} เมล็ด (${c.season.label}) → รอด ${cnt(Math.floor(n * c.rate / 100))} ต้น → ได้ ~${kgt(kg)} กก.`;
  }

  if (n && has('แปลง') && yieldAsk) {
    const perPlot = c.target / 4;
    return `🌿 ปลูก ${cnt(n)} แปลง ≈ ${kgt(n * perPlot)} กก.\n(เฉลี่ยแปลงละ ~${kgt(perPlot)} กก. ตามเป้า 4 แปลง = ${c.target} กก.)`;
  }

  if (has('เป้า', '90') && !has('ปลูก', 'แปลงกี่'))
    return `🎯 เป้าหมาย: ส่งออเดอร์ ${c.target} กก./สัปดาห์\n= ต้องปลูกให้ครบ 4 แปลง/สัปดาห์ (เฉลี่ยแปลงละ ~${kgt(c.target / 4)} กก.)`;

  if (has('ทำไม', 'อธิบาย', 'คำนวณ', 'สูตร', 'ยังไง'))
    return `📐 สูตร: เมล็ดที่ต้องเพาะ = ผลผลิตที่ขาด ÷ (อัตรารอด × น้ำหนัก/ต้น)\n` +
      `ตอนนี้ ${c.season.label}: ${c.rate}% × ${c.weather === 'cold' ? '0.10' : '0.083'} = ${c.yps.toFixed(4)} กก./เมล็ด\n` +
      `เช่น ขาด ${c.target} กก. → ${c.target} ÷ ${c.yps.toFixed(4)} ≈ ${cnt(Math.ceil(c.target / c.yps))} → ปัดเป็น ${cnt((typeof seedsForKg === 'function') ? seedsForKg(c.target) : 0)} เมล็ด`;

  return null;
}

// ===== ตัวจัดการหลัก (async) =====
async function vfAssistAnswer(qRaw) {
  const q = (qRaw || '').toLowerCase();
  const nums = (qRaw.match(/[\d][\d,]*(\.\d+)?/g) || []).map(x => parseFloat(x.replace(/,/g, ''))).filter(x => !isNaN(x));
  const has = (...ks) => ks.some(k => q.includes(k));
  const yieldAsk = has('ได้กี่โล', 'ได้กี่กก', 'ผลผลิต', 'ได้เท่าไหร่', 'กี่กิโล');

  // เหตุผลของคำแนะนำ
  if (has('เหตุผล') || (has('ทำไม') && has('แนะนำ', 'คำแนะนำ', 'เตือน'))) return adviceReason();

  // ลูกค้าที่ซื้อเยอะสุด / อันดับ
  if (has('ลูกค้า', 'ซื้อ', 'คน') && has('เยอะสุด', 'มากสุด', 'ดีสุด', 'อันดับ', 'ประจำ', 'บ่อยสุด')) return dataTopCustomer();

  // จำนวนลูกค้า
  if (has('ลูกค้า') && !has('ได้กี่โล')) return dataCustomers();

  // ยอดขาย / รายรับ
  if (has('ขาย', 'ยอดขาย', 'รายรับ', 'รายได้', 'ได้เงิน', 'ได้กี่บาท')) return dataSales(periodOf(q));

  // รายจ่าย
  if (has('รายจ่าย', 'ค่าใช้จ่าย', 'จ่ายไป')) return dataFinance('expense');

  // กำไร
  if (has('กำไร')) return dataFinance('profit');

  // ปัญหา
  if (has('ปัญหา')) return dataProblems();

  // ออเดอร์วันนี้
  if (has('ออเดอร์', 'ที่ต้องส่ง') && has('วันนี้', 'กี่', 'เท่าไหร่', 'เหลือ')) return dataTodayOrders();

  // จำนวนแปลง (นับ ไม่ใช่คำนวณผลผลิต)
  if (has('แปลง') && !yieldAsk && has('กี่แปลง', 'ว่าง', 'กำลังปลูก', 'ปลูกไป', 'ปลูกกี่', 'เก็บแล้ว', 'เหลือกี่', 'มีกี่')) return dataPlots();

  // จำนวนการเพาะ (นับ ไม่ใช่คำนวณผลผลิต)
  if (has('เพาะ') && !yieldAsk && has('กี่รอบ', 'กี่ครั้ง', 'เพาะไป', 'รวม', 'เดือนนี้', 'ทั้งหมด'))
    return dataSeeds(has('เดือน') ? 'month' : 'all');

  // คำถามคำนวณ + อธิบายสูตร
  const calc = calcAnswer(qRaw, q, nums);
  if (calc) return calc;

  return null;
}

function assistHelp() {
  return 'ลองถามแบบนี้ได้ค่ะ 🙂\n\n📊 ข้อมูลฟาร์ม\n• "ขายได้เท่าไหร่เดือนนี้"\n• "มีลูกค้ากี่คน"\n• "กำไรเดือนนี้"\n• "ตอนนี้ปลูกกี่แปลง"\n• "ลูกค้าคนไหนซื้อเยอะสุด"\n\n🧮 คำนวณ/วางแผน\n• "อยากได้ 60 โล เพาะกี่เมล็ด"\n• "เพาะ 1500 เมล็ด ได้กี่โล"\n\n💡 "ทำไมถึงแนะนำแบบนี้"';
}

// ===== UI =====
function openAssistant() {
  const chips = document.getElementById('assist-chips');
  if (chips) chips.innerHTML = ASSIST_CHIPS.map(c => `<button class="assist-chip" onclick="assistAsk('${c.replace(/'/g, "\\'")}')">${c}</button>`).join('');
  const log = document.getElementById('assist-log');
  if (log && !log.childElementCount) assistPush('bot', 'สวัสดีค่ะ 🌱 ถามข้อมูลฟาร์ม (ยอดขาย/ลูกค้า/กำไร) วางแผนการเพาะ หรือเหตุผลคำแนะนำได้เลย — แตะคำถามด่วนด้านบน หรือพิมพ์เองก็ได้');
  document.getElementById('assist-modal').style.display = 'flex';
}
function closeAssistant() { document.getElementById('assist-modal').style.display = 'none'; }

function assistClear() {
  const log = document.getElementById('assist-log');
  if (log) { log.innerHTML = ''; assistPush('bot', 'ล้างแชทแล้วค่ะ ✨ ถามใหม่ได้เลย'); }
}

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

async function assistSend() {
  const input = document.getElementById('assist-input');
  const q = (input.value || '').trim();
  if (!q) return;
  assistPush('user', q);
  input.value = '';
  const log = document.getElementById('assist-log');
  const wait = document.createElement('div');
  wait.className = 'assist-msg bot'; wait.textContent = 'กำลังดูข้อมูล…';
  log.appendChild(wait); log.scrollTop = log.scrollHeight;
  let ans;
  try { ans = await vfAssistAnswer(q); } catch (e) { console.error(e); ans = 'ขออภัย ดึงข้อมูลไม่สำเร็จค่ะ'; }
  wait.remove();
  assistPush('bot', ans || assistHelp());
}

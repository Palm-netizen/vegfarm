// js/seeds.js — บันทึกรอบเพาะเมล็ด

let editSeedId = null;
const MONTHLY_SEED_GOAL_KG = 360;            // เป้าหมายเพาะฟิก 360 กก./เดือน (90 กก./สัปดาห์)
// เป้าหมายเพาะรายคน (เมล็ด/สัปดาห์)
const SOWER_WEEKLY_TARGET = { 'มาริโอ้': 500, '애플': 2000 };
// ชื่อเดิม → ชื่อใหม่ (แปลงให้อัตโนมัติทั้งประวัติเก่าและการนับเป้า)
const SOWER_ALIAS = { 'ปาล์ม': 'มาริโอ้', 'เปิ้ล': '애플' };
function sowerName(raw) { return SOWER_ALIAS[raw] || raw || ''; }
function sowerRawNames(displayName) {
  return [displayName, ...Object.keys(SOWER_ALIAS).filter(o => SOWER_ALIAS[o] === displayName)];
}

// ฤดูปัจจุบันตามเดือน (ไทย) + อัตรารอด (ฟิกตามฤดู)
function currentSeason(d = new Date()) {
  const m = d.getMonth() + 1;
  if (m >= 11 || m <= 2) return { key: 'cold',  label: 'หน้าหนาว',      rate: getSurvivalRate('cold') };
  if (m >= 3 && m <= 5)  return { key: 'hot',   label: 'หน้าร้อน',      rate: getSurvivalRate('hot') };
  return { key: 'rainy', label: 'หน้าฝน (ฝนสลับแดด)', rate: getSurvivalRate('rainy') };
}

// แถบความคืบหน้าเป้าหมายเพาะเดือนนี้ — ใช้กิโลคาดการณ์ (คำนวณตามฤดูแล้ว)
async function renderSeedGoal() {
  const ssEl = document.getElementById('seed-season');
  if (ssEl) {
    const s = currentSeason();
    ssEl.innerHTML = `🌤️ ฤดูนี้: <b>${s.label}</b> · อัตรารอด <b style="color:var(--primary)">${s.rate}%</b>`;
  }
  const goal = MONTHLY_SEED_GOAL_KG;
  const now = new Date(), yr = now.getFullYear(), mo = String(now.getMonth() + 1).padStart(2, '0');
  const start = `${yr}-${mo}-01`;
  const nm = new Date(yr, now.getMonth() + 1, 1);
  const next = `${nm.getFullYear()}-${String(nm.getMonth() + 1).padStart(2, '0')}-01`;

  const { data } = await db.from('seed_batches').select('estimated_kg,seed_date')
    .gte('seed_date', start).lt('seed_date', next);
  const done = (data || []).reduce((s, b) => s + parseFloat(b.estimated_kg || 0), 0);

  const fill = document.getElementById('seed-goal-fill');
  const status = document.getElementById('seed-goal-status');
  if (!fill || !status) return;

  const pct = goal > 0 ? Math.min(100, (done / goal) * 100) : 0;
  fill.style.width = pct + '%';
  fill.classList.toggle('done', goal > 0 && done >= goal);

  const fmt = n => n.toLocaleString('th-TH', { maximumFractionDigits: 1 });
  if (goal <= 0) {
    status.innerHTML = `<span class="text-sub">เพาะแล้ว ${fmt(done)} กก. · ตั้งเป้าหมายเพื่อดูความคืบหน้า</span>`;
  } else if (done >= goal) {
    status.innerHTML = `เพาะแล้ว <b style="color:var(--primary)">${fmt(done)}</b> / ${fmt(goal)} กก. · <b style="color:var(--primary)">ครบเป้าแล้ว 🎉</b>`;
  } else {
    status.innerHTML = `เพาะแล้ว <b style="color:var(--primary)">${fmt(done)}</b> / ${fmt(goal)} กก. · ขาดอีก <b style="color:var(--accent)">${fmt(goal - done)}</b> กก. (${pct.toFixed(0)}%)`;
  }
}

function initSeeds() {
  // Set default date to today
  document.getElementById('seed-date').value = new Date().toISOString().split('T')[0];

  // Checkbox veg types — sync the visual .checked class from the real
  // checkbox state via its change event (clicking the wrapping <label>
  // toggles the input natively; listening to click here would double-fire).
  document.querySelectorAll('.veg-checkbox').forEach(item => {
    const cb = item.querySelector('input');
    cb.addEventListener('change', () => {
      item.classList.toggle('checked', cb.checked);
    });
  });

  // Weather radio — update survival rate display + recalculate
  document.querySelectorAll('input[name="weather"]').forEach(radio => {
    radio.addEventListener('change', () => {
      document.querySelectorAll('.weather-option').forEach(o => o.classList.remove('selected'));
      radio.closest('.weather-option').classList.add('selected');
      updateSeedCalc();
    });
  });

  // Seed count input
  document.getElementById('seed-count').addEventListener('input', updateSeedCalc);
  document.getElementById('seed-date').addEventListener('change', updateSeedCalc);

  renderSeedGoal();
  loadSeedBatches();

  // รายงานการเพาะรายคน — ตั้งค่าเริ่มต้น (มาริโอ้ · เดือนนี้)
  document.querySelectorAll('#sower-report-card .sower-chip').forEach(b => b.classList.toggle('active', b.dataset.sower === reportSowerName));
  reportRange('month');
}

// ===== เลือกคนเพาะ + เช็กเป้ารายสัปดาห์ =====
async function selectSower(name) {
  document.getElementById('seed-sower').value = name;
  document.querySelectorAll('#seed-sower-group .sower-chip').forEach(b =>
    b.classList.toggle('active', b.dataset.sower === name));
  await checkSowerTarget(name);
}

// นับจำนวนเมล็ดที่คนนี้เพาะในสัปดาห์ (weekOffset 0 = สัปดาห์นี้, -1 = อาทิตย์ที่แล้ว)
async function sowerWeekSeeds(name, weekOffset = 0) {
  const today = new Date().toISOString().split('T')[0];
  const wd = new Date(today); const dow = (wd.getDay() + 6) % 7; wd.setDate(wd.getDate() - dow);
  const weekStart = addDays(wd.toISOString().split('T')[0], weekOffset * 7);
  const weekEnd = addDays(weekStart, 7);
  const raws = new Set(sowerRawNames(name));
  const { data } = await db.from('seed_batches').select('seed_count,seed_date,sower');
  return (data || [])
    .filter(b => raws.has(b.sower) && b.seed_date >= weekStart && b.seed_date < weekEnd)
    .reduce((s, b) => s + (parseInt(b.seed_count) || 0), 0);
}

async function checkSowerTarget(name) {
  const target = SOWER_WEEKLY_TARGET[name] || 0;
  const thisWeek = await sowerWeekSeeds(name, 0);
  const lastWeek = await sowerWeekSeeds(name, -1);
  const lastShort = Math.max(0, target - lastWeek);           // อาทิตย์ที่แล้วขาดเท่าไหร่ → ต้องชดเชย
  const effTarget = target + lastShort;                       // ต้องเพาะสัปดาห์นี้ = เป้าปกติ + ชดเชย
  const need = Math.max(0, effTarget - thisWeek);
  const cnt = n => n.toLocaleString('th-TH');

  // แถบความคืบหน้าใต้ปุ่มเลือกชื่อ
  const prog = document.getElementById('sower-progress');
  if (prog) {
    let html = `${name} สัปดาห์นี้เพาะ <b>${cnt(thisWeek)}</b>/${cnt(target)} เมล็ด`;
    if (lastShort > 0) html += ` · <b style="color:var(--danger)">อาทิตย์ที่แล้วขาด ${cnt(lastShort)}</b> (ต้องชดเชย)`;
    html += need > 0 ? ` · <b style="color:var(--danger)">ต้องเพาะอีก ${cnt(need)}</b>` : ` · ครบแล้ว ✅`;
    prog.innerHTML = html;
  }

  // ยังไม่ครบ (รวมชดเชยอาทิตย์ที่แล้ว) → ป๊อปอัพแจ้งเตือนทันที
  if (need > 0) {
    const color = name === 'มาริโอ้' ? 'var(--primary)' : '#EAB308';
    document.getElementById('sower-warn-body').innerHTML =
      `<div class="confirm-msg" style="margin-bottom:6px"><span class="sower-name-box" style="background:${color}">${name}</span> ${lastShort > 0 ? 'ต้องเพาะเพิ่ม (มีของค้างอาทิตย์ที่แล้ว)' : 'ยังเพาะไม่ครบเป้าสัปดาห์นี้'}</div>
       <div class="sower-warn-nums">
         <div>เป้าปกติ/สัปดาห์: <b>${cnt(target)}</b> เมล็ด</div>
         ${lastShort > 0 ? `<div>⏮️ อาทิตย์ที่แล้วเพาะ ${cnt(lastWeek)}/${cnt(target)} — ชดเชย <b style="color:var(--danger)">+${cnt(lastShort)}</b></div>
         <div>รวมต้องเพาะสัปดาห์นี้: <b>${cnt(effTarget)}</b> เมล็ด</div>` : ''}
         <div>สัปดาห์นี้เพาะแล้ว: <b>${cnt(thisWeek)}</b> เมล็ด</div>
         <div>ต้องเพาะเพิ่มอีก: <b style="color:var(--danger);font-size:16px">${cnt(need)}</b> เมล็ด</div>
       </div>
       <div style="color:var(--danger);font-weight:700;margin-top:8px">❗ เพาะให้ครบสัปดาห์นี้เพื่อแก้ให้ทันเวลา ไม่งั้นผักจะไม่พอส่ง</div>`;
    document.getElementById('sower-warn-modal').style.display = 'flex';
  }
}
function closeSowerWarn() { document.getElementById('sower-warn-modal').style.display = 'none'; }

// ===== ดูยอดการเพาะรายคน (เลือกชื่อ + ช่วงวันที่) =====
let reportSowerName = 'มาริโอ้';
function reportSower(name) {
  reportSowerName = name;
  document.querySelectorAll('#sower-report-card .sower-chip').forEach(b => b.classList.toggle('active', b.dataset.sower === name));
  renderSowerReport();
}
function reportRange(period) {
  const today = new Date().toISOString().split('T')[0];
  let from = '';
  if (period === 'week') { const wd = new Date(today); const dow = (wd.getDay() + 6) % 7; wd.setDate(wd.getDate() - dow); from = wd.toISOString().split('T')[0]; }
  else if (period === 'month') { from = today.slice(0, 8) + '01'; }
  document.getElementById('report-from').value = from;
  document.getElementById('report-to').value = period === 'all' ? '' : today;
  renderSowerReport();
}
async function renderSowerReport() {
  const el = document.getElementById('sower-report-result');
  if (!el) return;
  const from = document.getElementById('report-from').value;
  const to = document.getElementById('report-to').value;
  const raws = new Set(sowerRawNames(reportSowerName));
  const { data } = await db.from('seed_batches').select('seed_count,seed_date,estimated_kg,sower').order('seed_date', { ascending: false });
  let rows = (data || []).filter(b => raws.has(b.sower));
  if (from) rows = rows.filter(b => b.seed_date >= from);
  if (to) rows = rows.filter(b => b.seed_date <= to);
  const cnt = n => n.toLocaleString('th-TH');
  const seeds = rows.reduce((s, b) => s + (parseInt(b.seed_count) || 0), 0);
  const kg = rows.reduce((s, b) => s + parseFloat(b.estimated_kg || 0), 0);
  el.innerHTML =
    `<div class="report-summary">
       <div><span>${cnt(rows.length)}</span>รอบ</div>
       <div><span>${cnt(seeds)}</span>เมล็ด</div>
       <div><span>~${kg.toLocaleString('th-TH', { maximumFractionDigits: 1 })}</span>กก. คาด</div>
     </div>` +
    (rows.length
      ? `<div class="report-list">${rows.slice(0, 30).map(b => `<div class="report-item"><span>${formatDateTH(b.seed_date)}</span><b>${cnt(parseInt(b.seed_count) || 0)} เมล็ด</b></div>`).join('')}</div>`
      : '<div class="text-sub" style="text-align:center;padding:12px">ไม่มีการเพาะในช่วงนี้</div>');
}

function updateSeedCalc() {
  const count = parseInt(document.getElementById('seed-count').value) || 0;
  const weather = document.querySelector('input[name="weather"]:checked')?.value || 'hot';
  const dateVal = document.getElementById('seed-date').value;

  const survivalRate = getSurvivalRate(weather);
  const estKg = calcEstimatedKg(count, weather, survivalRate);
  const harvestDate = dateVal ? addDays(dateVal, 45) : '-';

  document.getElementById('seed-survival-preview').textContent = survivalRate + '%';
  document.getElementById('seed-kg-preview').textContent = estKg + ' kg';
  document.getElementById('seed-harvest-preview').textContent = dateVal ? formatDateTH(harvestDate) : '-';
  document.getElementById('seed-harvest-date').value = dateVal ? harvestDate : '';
}

async function saveSeedBatch() {
  const dateVal = document.getElementById('seed-date').value;
  const countVal = parseInt(document.getElementById('seed-count').value);
  const weather = document.querySelector('input[name="weather"]:checked')?.value;
  const notes = document.getElementById('seed-notes').value;
  const sower = document.getElementById('seed-sower').value.trim();

  // Veg types
  const vegTypes = [];
  document.querySelectorAll('.veg-checkbox input:checked').forEach(cb => vegTypes.push(cb.value));

  // Validate
  if (!dateVal) return showToast('กรุณาระบุวันที่เพาะเมล็ด', 'error');
  if (!vegTypes.length) return showToast('กรุณาเลือกชนิดผักอย่างน้อย 1 ชนิด', 'error');
  if (!countVal || countVal < 1) return showToast('กรุณาระบุจำนวนเมล็ด', 'error');
  if (!weather) return showToast('กรุณาเลือกสภาพอากาศ', 'error');

  const survivalRate = getSurvivalRate(weather);
  const estKg = calcEstimatedKg(countVal, weather, survivalRate);
  const harvestDate = addDays(dateVal, 45);

  const payload = {
    seed_date: dateVal,
    vegetable_types: vegTypes,
    seed_count: countVal,
    weather_condition: weather,
    survival_rate: survivalRate,
    estimated_kg: parseFloat(estKg),
    harvest_date: harvestDate,
    sower: sower || null,
    notes
  };

  setLoading(true);
  try {
    if (editSeedId) {
      const { error } = await db.from('seed_batches').update(payload).eq('id', editSeedId);
      if (error) throw error;
      showToast('แก้ไขข้อมูลสำเร็จ');
      editSeedId = null;
    } else {
      const { error } = await db.from('seed_batches').insert(payload);
      if (error) throw error;
      showToast('บันทึกรอบเพาะเมล็ดสำเร็จ');

      // Log to calendar
      await db.from('calendar_activities').insert({
        activity_date: dateVal,
        activity_type: 'seeding',
        summary: `เพาะเมล็ด ${vegTypes.join(', ')} ${countVal} เมล็ด`
      });
    }
    resetSeedForm();
    loadSeedBatches();
  } catch (err) {
    console.error(err);
    showToast('บันทึกไม่สำเร็จ: ' + (err.message || err), 'error');
  } finally {
    setLoading(false);
  }
}

function resetSeedForm() {
  editSeedId = null;
  document.getElementById('seed-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('seed-count').value = '';
  document.getElementById('seed-sower').value = '';
  document.querySelectorAll('#seed-sower-group .sower-chip').forEach(b => b.classList.remove('active'));
  document.getElementById('sower-progress').innerHTML = '';
  document.getElementById('seed-notes').value = '';
  document.getElementById('seed-harvest-date').value = '';
  document.querySelectorAll('.veg-checkbox').forEach(i => { i.classList.remove('checked'); i.querySelector('input').checked = false; });
  document.querySelectorAll('input[name="weather"]').forEach(r => r.checked = false);
  document.querySelectorAll('.weather-option').forEach(o => o.classList.remove('selected'));
  document.getElementById('seed-survival-preview').textContent = '-';
  document.getElementById('seed-kg-preview').textContent = '-';
  document.getElementById('seed-harvest-preview').textContent = '-';
  document.getElementById('seed-save-btn').textContent = 'บันทึกรอบเพาะเมล็ด';
}

async function loadSeedBatches() {
  const { data: batches, error } = await db
    .from('seed_batches')
    .select('*')
    .order('seed_date', { ascending: false });

  const list = document.getElementById('seed-history-list');
  if (!batches || !batches.length) {
    list.innerHTML = '<div class="empty-state">ยังไม่มีข้อมูล</div>';
    renderSeedGoal();
    return;
  }

  const weatherLabel = { hot: '☀️ ร้อน', rainy: '🌧️ ฝน/แดด', cold: '❄️ หนาว' };
  const vegName = { green_oak: 'กรีนโอ๊ค', red_oak: 'เรดโอ๊ค', finley: 'ฟินเลย์', cos: 'คอส', butterhead: 'บัตเตอร์เฮด' };

  list.innerHTML = batches.map(b => `
    <div class="seed-hist-card">
      <div class="shc-top">
        <div class="shc-veg">🌱 ${(b.vegetable_types || []).map(v => vegName[v] || v).join(', ')}</div>
        <div class="shc-actions">
          <button class="btn btn-outline btn-sm" onclick="editSeedBatch('${b.id}')">แก้ไข</button>
          <button class="btn btn-danger btn-sm" onclick="deleteSeedBatch('${b.id}')">ลบ</button>
        </div>
      </div>
      <div class="shc-meta">${formatDateTH(b.seed_date)} · ${weatherLabel[b.weather_condition] || b.weather_condition} · ${b.seed_count} เมล็ด · รอด ${b.survival_rate}%${b.sower ? ` · 👤 ${sowerName(b.sower)}` : ''}</div>
      <div class="shc-result">คาดได้ <b>${b.estimated_kg} kg</b> · เก็บ ${formatDateTH(b.harvest_date)}</div>
    </div>`).join('');

  renderSeedGoal();
}

async function editSeedBatch(id) {
  const { data: b } = await db.from('seed_batches').select('*').eq('id', id).single();
  if (!b) return;

  editSeedId = id;
  document.getElementById('seed-date').value = b.seed_date;
  document.getElementById('seed-count').value = b.seed_count;
  document.getElementById('seed-sower').value = sowerName(b.sower);
  document.querySelectorAll('#seed-sower-group .sower-chip').forEach(x => x.classList.toggle('active', x.dataset.sower === sowerName(b.sower)));
  document.getElementById('seed-notes').value = b.notes || '';

  // veg types
  document.querySelectorAll('.veg-checkbox').forEach(item => {
    const val = item.querySelector('input').value;
    if (b.vegetable_types?.includes(val)) {
      item.classList.add('checked');
      item.querySelector('input').checked = true;
    } else {
      item.classList.remove('checked');
      item.querySelector('input').checked = false;
    }
  });

  // weather
  const weatherRadio = document.querySelector(`input[name="weather"][value="${b.weather_condition}"]`);
  if (weatherRadio) {
    weatherRadio.checked = true;
    weatherRadio.closest('.weather-option').classList.add('selected');
  }

  updateSeedCalc();
  document.getElementById('seed-save-btn').textContent = 'บันทึกการแก้ไข';
  document.getElementById('seed-form-section').scrollIntoView({ behavior: 'smooth' });
}

async function deleteSeedBatch(id) {
  if (!(await vfConfirm('ลบรายการนี้ใช่ไหม?', { okLabel: 'ลบ' }))) return;
  setLoading(true);
  try {
    // เก็บข้อมูลไว้ก่อนลบ เผื่อกดย้อนกลับ (เผลอลบผิด)
    const { data: prev } = await db.from('seed_batches').select('*').eq('id', id).single();
    // ปลดการอ้างอิงจากแปลงก่อน (กัน foreign-key ของ plots.seed_batch_id)
    await db.from('plots').update({ seed_batch_id: null }).eq('seed_batch_id', id);
    const { error } = await db.from('seed_batches').delete().eq('id', id);
    if (error) throw error;
    loadSeedBatches();
    // ปุ่มย้อนกลับ: นำรายการที่เพิ่งลบกลับมา
    if (prev) {
      vfOfferUndo('ลบรอบเพาะแล้ว', async () => {
        const { id: _drop, created_at: _c, updated_at: _u, ...restore } = prev;
        await db.from('seed_batches').insert(restore);
        loadSeedBatches();
      });
    } else {
      showToast('ลบแล้ว');
    }
  } catch (err) {
    showToast('ลบไม่สำเร็จ: ' + (err.message || err), 'error');
    console.error(err);
  } finally {
    setLoading(false);
  }
}

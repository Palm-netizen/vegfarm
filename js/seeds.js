// js/seeds.js — บันทึกรอบเพาะเมล็ด

let editSeedId = null;
const SEED_GOAL_KEY = 'vf_seed_goal_kg';

function onSeedGoalChange() {
  const v = parseFloat(document.getElementById('seed-goal-input').value) || 0;
  try { localStorage.setItem(SEED_GOAL_KEY, v); } catch (e) {}
  renderSeedGoal();
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
  const goal = parseFloat(localStorage.getItem(SEED_GOAL_KEY)) || 0;
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

  // Monthly seeding goal
  const savedGoal = parseFloat(localStorage.getItem(SEED_GOAL_KEY)) || 0;
  if (savedGoal > 0) document.getElementById('seed-goal-input').value = savedGoal;
  renderSeedGoal();

  loadSeedBatches();
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
      <div class="shc-meta">${formatDateTH(b.seed_date)} · ${weatherLabel[b.weather_condition] || b.weather_condition} · ${b.seed_count} เมล็ด · รอด ${b.survival_rate}%</div>
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
  if (!confirm('ลบรายการนี้ใช่ไหม?')) return;
  setLoading(true);
  try {
    await db.from('seed_batches').delete().eq('id', id);
    showToast('ลบแล้ว');
    loadSeedBatches();
  } catch (err) {
    showToast('ลบไม่สำเร็จ', 'error');
  } finally {
    setLoading(false);
  }
}

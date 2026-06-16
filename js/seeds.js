// js/seeds.js — บันทึกรอบเพาะเมล็ด

let editSeedId = null;

function initSeeds() {
  // Set default date to today
  document.getElementById('seed-date').value = new Date().toISOString().split('T')[0];

  // Checkbox veg types
  document.querySelectorAll('.veg-checkbox').forEach(item => {
    item.addEventListener('click', () => {
      item.classList.toggle('checked');
      const cb = item.querySelector('input');
      cb.checked = !cb.checked;
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

  const tbody = document.getElementById('seed-table-body');
  if (!batches || !batches.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-sub)">ยังไม่มีข้อมูล</td></tr>';
    return;
  }

  const weatherLabel = { hot: '☀️ ร้อน', rainy: '🌧️ ฝน/แดด', cold: '❄️ หนาว' };
  const vegLabel = { green_oak: 'กรีนโอ๊ค', red_oak: 'เรดโอ๊ค', finley: 'ฟินเลย์' };

  tbody.innerHTML = batches.map(b => `
    <tr>
      <td>${formatDateTH(b.seed_date)}</td>
      <td>${(b.vegetable_types || []).map(v => vegLabel[v] || v).join(', ')}</td>
      <td style="text-align:center">${b.seed_count}</td>
      <td>${weatherLabel[b.weather_condition] || b.weather_condition}</td>
      <td style="text-align:center">${b.survival_rate}%</td>
      <td><strong>${b.estimated_kg} kg</strong><br><span class="text-sub">${formatDateTH(b.harvest_date)}</span></td>
      <td>
        <div style="display:flex;gap:5px">
          <button class="btn btn-outline btn-sm" onclick="editSeedBatch('${b.id}')">แก้ไข</button>
          <button class="btn btn-danger btn-sm" onclick="deleteSeedBatch('${b.id}')">ลบ</button>
        </div>
      </td>
    </tr>`).join('');
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

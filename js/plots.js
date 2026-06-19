// js/plots.js — บันทึกรอบปลูกลงแปลง

let selectedPlotCode = null;
let availableBatches = [];
let selectedTransplantBatchId = null;

function initPlots() {
  renderPlotGrid();
  // ชนิดผัก (เลือกหลายชนิด) — sync .checked class จากสถานะ checkbox
  document.querySelectorAll('#plot-veg-group .veg-checkbox-plot').forEach(item => {
    const cb = item.querySelector('input');
    cb.addEventListener('change', () => item.classList.toggle('checked', cb.checked));
  });
  loadAllPlots();
}

// veg helpers (รองรับหลายชนิด เก็บเป็น "a,b")
function vegLabelMulti(value) {
  if (!value) return '-';
  return String(value).split(',').map(v => vegLabel(v.trim())).join(', ');
}
function getPlotVegSelected() {
  return [...document.querySelectorAll('#plot-veg-group .veg-checkbox-plot input:checked')].map(c => c.value);
}
function setPlotVeg(value) {
  const set = new Set(String(value || '').split(',').map(s => s.trim()).filter(Boolean));
  document.querySelectorAll('#plot-veg-group .veg-checkbox-plot').forEach(item => {
    const cb = item.querySelector('input');
    cb.checked = set.has(cb.value);
    item.classList.toggle('checked', cb.checked);
  });
}

// วันเก็บเกี่ยว = วันปลูก + (45 − อายุต้นกล้า)  (ครบ 45 วันจากเพาะเมล็ด)
const CROP_DAYS = 45;
function plotHarvestDate(plantDate, age) {
  return addDays(plantDate, Math.max(0, CROP_DAYS - (parseInt(age) || 0)));
}
function updatePlotHarvestDisplay() {
  const pd = document.getElementById('plot-plant-date').value;
  const age = document.getElementById('plot-seedling-age').value;
  document.getElementById('plot-harvest-date-display').textContent =
    'วันเก็บเกี่ยว: ' + (pd ? formatDateTH(plotHarvestDate(pd, age)) : '–');
}
function scrollToPlotForm() {
  document.getElementById('selected-plot-label').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderPlotGrid() {
  const grid = document.getElementById('plot-grid');
  const plots = [];
  for (let i = 1; i <= 15; i++) plots.push(`T${i}`);

  grid.innerHTML = plots.map(code => `
    <div class="plot-card" id="plot-card-${code}" onclick="selectPlot('${code}')">
      <div class="plot-code">${code}</div>
      <div class="plot-info" id="plot-info-${code}">โหลด...</div>
    </div>`).join('');
}

async function loadAllPlots() {
  const { data: plots } = await db.from('plots').select('*');
  const { data: problems } = await db.from('problems').select('plot_code').eq('resolved', false);

  const problemSet = new Set(problems?.map(p => p.plot_code) || []);

  // Summary strip
  const counts = { empty: 0, active: 0, harvested: 0, problem: problemSet.size };
  (plots || []).forEach(p => {
    if (p.is_harvested) counts.harvested++;
    else if (p.plant_date) counts.active++;
    else counts.empty++;
  });
  const summary = document.getElementById('plots-summary');
  if (summary) {
    summary.innerHTML = [
      ['active', counts.active, 'กำลังปลูก'],
      ['harvested', counts.harvested, 'เก็บแล้ว'],
      ['empty', counts.empty, 'ว่าง'],
      ['problem', counts.problem, 'มีปัญหา'],
    ].map(([cls, num, label]) =>
      `<div class="ps-item ${cls}"><div class="ps-num">${num}</div><div class="ps-label">${label}</div></div>`
    ).join('');
  }

  plots?.forEach(p => {
    const card = document.getElementById(`plot-card-${p.plot_code}`);
    const info = document.getElementById(`plot-info-${p.plot_code}`);
    if (!card || !info) return;

    card.className = 'plot-card';
    if (p.is_harvested) card.classList.add('harvested');
    else if (p.plant_date) card.classList.add('active-plot');
    if (problemSet.has(p.plot_code)) card.classList.add('has-problem');

    if (p.plant_date) {
      info.innerHTML = `${vegLabelMulti(p.vegetable_type)}<br>${p.is_harvested ? 'เก็บแล้ว' : 'กำลังปลูก'}`;
    } else {
      info.textContent = 'ว่าง';
    }
  });
}

function selectPlot(code) {
  selectedPlotCode = code;
  document.querySelectorAll('.plot-card').forEach(c => c.style.outline = 'none');
  document.getElementById(`plot-card-${code}`).style.outline = '3px solid var(--primary)';
  document.getElementById('selected-plot-label').textContent = `แปลง ${code}`;
  loadPlotDetail(code);
  document.getElementById('plot-detail-section').style.display = 'block';
  document.getElementById('plot-detail-section').scrollIntoView({ behavior: 'smooth' });
}

async function loadPlotDetail(code) {
  const { data: plot } = await db.from('plots').select('*').eq('plot_code', code).single();
  const { data: cycles } = await db.from('plot_cycles').select('*').eq('plot_code', code).order('cycle_number');
  const { data: problems } = await db.from('problems').select('*').eq('plot_code', code).order('problem_date', { ascending: false });

  if (!plot) return;

  // Fill form
  setPlotVeg(plot.vegetable_type);
  document.getElementById('plot-plant-date').value = plot.plant_date || '';
  document.getElementById('plot-seedling-age').value = plot.plant_age_days || 0;
  document.getElementById('plot-est-kg').value = plot.estimated_kg || '';
  document.getElementById('plot-harvested-cb').checked = plot.is_harvested || false;

  // เก็บรวมทั้งหมดตั้งแต่เริ่มปลูก (ทุกรอบ) + คิดเป็นเงิน ฿100/กก.
  const totalKg = (cycles || []).reduce((s, c) => s + (parseFloat(c.actual_kg) || 0), 0);
  const totalBaht = totalKg * 100;
  document.getElementById('plot-cycle-count').innerHTML =
    `รอบที่ ${plot.cycle_count || 1}` +
    (totalKg > 0
      ? ` · <span style="color:var(--primary);font-weight:700">เก็บรวม ${totalKg.toLocaleString('th-TH',{maximumFractionDigits:1})} กก. · ฿${totalBaht.toLocaleString('th-TH',{maximumFractionDigits:0})}</span>`
      : '');

  updatePlotHarvestDisplay();

  toggleHarvestFields(plot.is_harvested);

  // Transplant: list recent seed batches to pull from
  await populateTransplantOptions();

  // Cycles history — completed cycles + the current in-progress planting
  const rows = [...(cycles || [])];
  if (plot.plant_date && !plot.is_harvested) {
    rows.push({
      cycle_number: plot.cycle_count || 1,
      vegetable_type: plot.vegetable_type,
      plant_date: plot.plant_date,
      harvest_date: plot.harvest_date || addDays(plot.plant_date, 30),
      actual_kg: null,
      _active: true
    });
  }
  rows.sort((a, b) => (a.cycle_number || 0) - (b.cycle_number || 0));

  const cyclesHtml = rows.length
    ? rows.map(c => {
        const active = c._active;
        return `<div class="seed-hist-card">
          <div class="shc-top">
            <div class="shc-veg">รอบ ${c.cycle_number} · ${vegLabelMulti(c.vegetable_type)}</div>
            <div class="shc-actions">${active
              ? `<span class="harvest-tag soon">กำลังปลูก</span>
                 <button class="btn btn-outline btn-sm" onclick="scrollToPlotForm()">แก้ไข</button>`
              : `<button class="btn btn-outline btn-sm" onclick="editCycle('${c.id}')">แก้ไข</button>
                 <button class="btn btn-danger btn-sm" onclick="deleteCycle('${c.id}')">ลบ</button>`}
            </div>
          </div>
          <div class="shc-meta">ปลูก ${formatDateTH(c.plant_date)} · เก็บ ${active ? 'รอเก็บ' : formatDateTH(c.harvest_date)}</div>
          <div class="shc-result">${active ? '<span class="text-sub">ยังไม่เก็บเกี่ยว</span>' : `เก็บได้จริง <b>${c.actual_kg || '-'} kg</b>`}</div>
        </div>`;
      }).join('')
    : '<div class="empty-state">ยังไม่มีประวัติ</div>';
  document.getElementById('plot-cycles-history').innerHTML = cyclesHtml;
}

// Edit / delete a completed cycle in the plot history
async function editCycle(id) {
  const { data: c } = await db.from('plot_cycles').select('*').eq('id', id).single();
  if (!c) return;
  const kgStr = prompt('แก้ไข KG จริงที่เก็บได้:', c.actual_kg ?? '');
  if (kgStr === null) return;
  const kg = parseFloat(kgStr);
  if (isNaN(kg)) return showToast('กรุณาใส่ตัวเลข', 'error');
  const { error } = await db.from('plot_cycles').update({ actual_kg: kg }).eq('id', id);
  if (error) return showToast('แก้ไขไม่สำเร็จ: ' + (error.message || error), 'error');
  showToast('แก้ไขแล้ว');
  if (selectedPlotCode) loadPlotDetail(selectedPlotCode);
}

async function deleteCycle(id) {
  if (!confirm('ลบรอบนี้ออกจากประวัติ?')) return;
  const { error } = await db.from('plot_cycles').delete().eq('id', id);
  if (error) return showToast('ลบไม่สำเร็จ: ' + (error.message || error), 'error');
  showToast('ลบแล้ว');
  if (selectedPlotCode) loadPlotDetail(selectedPlotCode);
}

function toggleHarvestFields(show) {
  document.getElementById('harvest-fields').style.display = show ? 'block' : 'none';
}

// ===== Transplant: seed batch -> plot =====
async function populateTransplantOptions() {
  const sel = document.getElementById('plot-transplant-batch');
  if (!sel) return;
  selectedTransplantBatchId = null;
  document.getElementById('transplant-hint').textContent = '';

  const { data: batches } = await db
    .from('seed_batches')
    .select('*')
    .order('seed_date', { ascending: false })
    .limit(10);
  availableBatches = batches || [];

  sel.innerHTML = '<option value="">-- ไม่ย้ายจากรอบเพาะ --</option>' +
    availableBatches.map(b => {
      const vegs = (b.vegetable_types || []).map(vegLabel).join(', ');
      return `<option value="${b.id}">เพาะ ${formatDateTH(b.seed_date)} · ${vegs} · ${b.seed_count} เมล็ด</option>`;
    }).join('');
  sel.value = '';
}

function applyTransplant() {
  const id = document.getElementById('plot-transplant-batch').value;
  selectedTransplantBatchId = id || null;
  const hint = document.getElementById('transplant-hint');
  if (!id) { hint.textContent = ''; return; }

  const batch = availableBatches.find(b => b.id === id);
  if (!batch) return;

  const vegs = batch.vegetable_types || [];
  const today = new Date().toISOString().split('T')[0];
  // อายุต้นกล้า = จำนวนวันตั้งแต่วันเพาะเมล็ดถึงวันนี้
  const age = Math.max(0, Math.round((new Date(today) - new Date(batch.seed_date)) / 86400000));
  setPlotVeg(vegs.join(','));
  document.getElementById('plot-plant-date').value = today;
  document.getElementById('plot-seedling-age').value = age;
  if (batch.estimated_kg) document.getElementById('plot-est-kg').value = batch.estimated_kg;
  updatePlotHarvestDisplay();
  hint.textContent = `เติมชนิดผัก/วันปลูก/อายุต้นกล้า ${age} วัน จากรอบเพาะให้แล้ว (${vegLabelMulti(vegs.join(','))})`;
}

async function savePlot() {
  if (!selectedPlotCode) return showToast('กรุณาเลือกแปลงก่อน', 'error');

  const vegType = getPlotVegSelected().join(',');
  const plantDate = document.getElementById('plot-plant-date').value;
  const seedlingAge = parseInt(document.getElementById('plot-seedling-age').value) || 0;
  const estKg = parseFloat(document.getElementById('plot-est-kg').value) || null;
  const isHarvested = document.getElementById('plot-harvested-cb').checked;
  const actualKg = parseFloat(document.getElementById('plot-actual-kg').value) || null;
  const harvestNotes = document.getElementById('plot-harvest-notes').value;

  if (!vegType) return showToast('กรุณาเลือกชนิดผัก', 'error');
  if (!plantDate) return showToast('กรุณาระบุวันที่ปลูก', 'error');

  const harvestDate = plotHarvestDate(plantDate, seedlingAge);
  const { data: current } = await db.from('plots').select('*').eq('plot_code', selectedPlotCode).single();

  const payload = {
    vegetable_type: vegType,
    plant_date: plantDate,
    plant_age_days: seedlingAge,
    harvest_date: harvestDate,
    estimated_kg: estKg,
    is_harvested: isHarvested,
    actual_kg: isHarvested ? actualKg : null,
    harvest_notes: isHarvested ? harvestNotes : null,
    updated_at: new Date().toISOString()
  };
  if (selectedTransplantBatchId) payload.seed_batch_id = selectedTransplantBatchId;

  setLoading(true);
  try {
    const { error } = await db.from('plots').update(payload).eq('plot_code', selectedPlotCode);
    if (error) throw error;

    // If newly harvested, save to cycle history
    if (isHarvested && !current?.is_harvested) {
      await db.from('plot_cycles').insert({
        plot_code: selectedPlotCode,
        cycle_number: current?.cycle_count || 1,
        vegetable_type: vegType,
        plant_date: plantDate,
        harvest_date: new Date().toISOString().split('T')[0],
        actual_kg: actualKg,
        notes: harvestNotes
      });

      await db.from('calendar_activities').insert({
        activity_date: new Date().toISOString().split('T')[0],
        activity_type: 'harvesting',
        plot_code: selectedPlotCode,
        summary: `เก็บเกี่ยว ${selectedPlotCode} ได้ ${actualKg || 0} kg`
      });
    }

    // Log planting / transplant
    if (!current?.plant_date && plantDate) {
      await db.from('calendar_activities').insert({
        activity_date: plantDate,
        activity_type: 'planting',
        plot_code: selectedPlotCode,
        summary: selectedTransplantBatchId
          ? `ย้ายกล้า ${vegLabelMulti(vegType)} ลงแปลง ${selectedPlotCode}`
          : `ปลูก ${vegLabelMulti(vegType)} แปลง ${selectedPlotCode}`
      });
    }

    showToast(selectedTransplantBatchId ? 'ย้ายกล้าลงแปลงสำเร็จ' : 'บันทึกข้อมูลแปลงสำเร็จ');
    selectedTransplantBatchId = null;
    loadAllPlots();
    loadPlotDetail(selectedPlotCode);
  } catch (err) {
    console.error(err);
    showToast('บันทึกไม่สำเร็จ: ' + (err.message || err), 'error');
  } finally {
    setLoading(false);
  }
}

async function startNewCycle() {
  if (!selectedPlotCode) return;
  if (!confirm(`เริ่มรอบปลูกใหม่สำหรับแปลง ${selectedPlotCode}?`)) return;

  const { data: current } = await db.from('plots').select('*').eq('plot_code', selectedPlotCode).single();

  setLoading(true);
  try {
    await db.from('plots').update({
      vegetable_type: null,
      plant_date: null,
      harvest_date: null,
      estimated_kg: null,
      actual_kg: null,
      is_harvested: false,
      harvest_notes: null,
      cycle_count: (current?.cycle_count || 1) + 1,
      updated_at: new Date().toISOString()
    }).eq('plot_code', selectedPlotCode);

    showToast(`เริ่มรอบใหม่แปลง ${selectedPlotCode} แล้ว`);
    loadAllPlots();
    document.getElementById('plot-detail-section').style.display = 'none';
    selectedPlotCode = null;
  } catch (err) {
    showToast('เกิดข้อผิดพลาด', 'error');
  } finally {
    setLoading(false);
  }
}

function vegLabel(type) {
  return { green_oak: 'กรีนโอ๊ค', red_oak: 'เรดโอ๊ค', finley: 'ฟินเลย์', cos: 'คอส', butterhead: 'บัตเตอร์เฮด' }[type] || type || '-';
}

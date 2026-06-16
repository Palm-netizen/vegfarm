// js/plots.js — บันทึกรอบปลูกลงแปลง

let selectedPlotCode = null;
let availableBatches = [];
let selectedTransplantBatchId = null;

function initPlots() {
  renderPlotGrid();
  loadAllPlots();
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

    const vegShort = { green_oak: 'กรีนโอ๊ค', red_oak: 'เรดโอ๊ค', finley: 'ฟินเลย์' };
    if (p.plant_date) {
      info.innerHTML = `${vegShort[p.vegetable_type] || p.vegetable_type || '-'}<br>${p.is_harvested ? 'เก็บแล้ว' : 'กำลังปลูก'}`;
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
  document.getElementById('plot-veg-type').value = plot.vegetable_type || '';
  document.getElementById('plot-plant-date').value = plot.plant_date || '';
  document.getElementById('plot-est-kg').value = plot.estimated_kg || '';
  document.getElementById('plot-cycle-count').textContent = `รอบที่ ${plot.cycle_count || 1}`;
  document.getElementById('plot-harvested-cb').checked = plot.is_harvested || false;

  if (plot.plant_date) {
    document.getElementById('plot-harvest-date-display').textContent = `วันเก็บเกี่ยว: ${formatDateTH(addDays(plot.plant_date, 30))}`;
  }

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
    ? `<table class="data-table"><thead><tr><th>รอบ</th><th>ชนิด</th><th>ปลูก</th><th>เก็บ</th><th>KG จริง</th></tr></thead><tbody>
        ${rows.map(c => `<tr>
          <td>${c.cycle_number}</td>
          <td>${vegLabel(c.vegetable_type)}</td>
          <td>${formatDateTH(c.plant_date)}</td>
          <td>${c._active ? '<span class="text-sub">รอเก็บ</span>' : formatDateTH(c.harvest_date)}</td>
          <td>${c._active ? '<span class="badge badge-green">กำลังปลูก</span>' : '<strong>' + (c.actual_kg || '-') + '</strong>'}</td>
        </tr>`).join('')}
      </tbody></table>`
    : '<div class="text-sub">ยังไม่มีประวัติ</div>';
  document.getElementById('plot-cycles-history').innerHTML = cyclesHtml;

  // QR
  generateQR(code);
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

  const veg = (batch.vegetable_types && batch.vegetable_types[0]) || '';
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('plot-veg-type').value = veg;
  document.getElementById('plot-plant-date').value = today;
  document.getElementById('plot-harvest-date-display').textContent = 'วันเก็บเกี่ยว: ' + formatDateTH(addDays(today, 30));
  if (batch.estimated_kg) document.getElementById('plot-est-kg').value = batch.estimated_kg;
  hint.textContent = `เติมชนิดผัก/วันปลูก/ประมาณการจากรอบเพาะให้แล้ว (${vegLabel(veg)})`;
}

async function savePlot() {
  if (!selectedPlotCode) return showToast('กรุณาเลือกแปลงก่อน', 'error');

  const vegType = document.getElementById('plot-veg-type').value;
  const plantDate = document.getElementById('plot-plant-date').value;
  const estKg = parseFloat(document.getElementById('plot-est-kg').value) || null;
  const isHarvested = document.getElementById('plot-harvested-cb').checked;
  const actualKg = parseFloat(document.getElementById('plot-actual-kg').value) || null;
  const harvestNotes = document.getElementById('plot-harvest-notes').value;

  if (!vegType) return showToast('กรุณาเลือกชนิดผัก', 'error');
  if (!plantDate) return showToast('กรุณาระบุวันที่ปลูก', 'error');

  const harvestDate = addDays(plantDate, 30);
  const { data: current } = await db.from('plots').select('*').eq('plot_code', selectedPlotCode).single();

  const payload = {
    vegetable_type: vegType,
    plant_date: plantDate,
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
          ? `ย้ายกล้า ${vegLabel(vegType)} ลงแปลง ${selectedPlotCode}`
          : `ปลูก ${vegLabel(vegType)} แปลง ${selectedPlotCode}`
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

function generateQR(code) {
  const qrDiv = document.getElementById('plot-qr');
  if (!qrDiv) return;
  qrDiv.innerHTML = '';
  const url = `${window.location.origin}${window.location.pathname}?plot=${code}`;
  new QRCode(qrDiv, { text: url, width: 100, height: 100 });
}

function vegLabel(type) {
  return { green_oak: 'กรีนโอ๊ค', red_oak: 'เรดโอ๊ค', finley: 'ฟินเลย์', cos: 'คอส', butterhead: 'บัตเตอร์เฮด' }[type] || type || '-';
}

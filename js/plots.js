// js/plots.js — บันทึกรอบปลูกลงแปลง

let selectedPlotCode = null;

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

  // Cycles history
  const cyclesHtml = cycles?.length
    ? `<table class="data-table"><thead><tr><th>รอบ</th><th>ชนิด</th><th>ปลูก</th><th>เก็บ</th><th>KG จริง</th></tr></thead><tbody>
        ${cycles.map(c => `<tr>
          <td>${c.cycle_number}</td>
          <td>${vegLabel(c.vegetable_type)}</td>
          <td>${formatDateTH(c.plant_date)}</td>
          <td>${formatDateTH(c.harvest_date)}</td>
          <td><strong>${c.actual_kg || '-'}</strong></td>
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

  setLoading(true);
  try {
    await db.from('plots').update(payload).eq('plot_code', selectedPlotCode);

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

    // Log planting
    if (!current?.plant_date && plantDate) {
      await db.from('calendar_activities').insert({
        activity_date: plantDate,
        activity_type: 'planting',
        plot_code: selectedPlotCode,
        summary: `ปลูก ${vegLabel(vegType)} แปลง ${selectedPlotCode}`
      });
    }

    showToast('บันทึกข้อมูลแปลงสำเร็จ');
    loadAllPlots();
    loadPlotDetail(selectedPlotCode);
  } catch (err) {
    console.error(err);
    showToast('บันทึกไม่สำเร็จ', 'error');
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

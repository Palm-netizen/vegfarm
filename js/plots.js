// js/plots.js — บันทึกรอบปลูกลงแปลง

let selectedPlotCode = null;
let plotPhotoDataUrl = null;   // รูปแปลงปลูก (data URL ที่ย่อแล้ว)
let vfPendingPlant = null;     // ข้อมูลจากล็อต Weekly Batch ที่กด "ย้ายลงปลูก" มา

// เป้าหมายการปลูกต่อสัปดาห์ (เพื่อให้พอส่งออเดอร์)
const LOT_ORDER_TARGET_KG = 90;   // ออเดอร์ต่อสัปดาห์ 90 กก.
const LOT_PLOTS_PER_WEEK = 4;     // ต้องปลูก 4 แปลง/สัปดาห์

function initPlots() {
  renderPlotGrid();
  // ชนิดผัก (เลือกหลายชนิด) — sync .checked class จากสถานะ checkbox
  document.querySelectorAll('#plot-veg-group .veg-checkbox-plot').forEach(item => {
    const cb = item.querySelector('input');
    cb.addEventListener('change', () => item.classList.toggle('checked', cb.checked));
  });
  // รูปแปลงปลูก — ย่อให้ไฟล์เล็ก แล้วแสดง preview (คลิกดูภาพใหญ่ได้)
  document.getElementById('plot-photo-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      plotPhotoDataUrl = await vfCompressImage(file, 1024, 0.6);
      const prev = document.getElementById('plot-photo-preview');
      prev.src = plotPhotoDataUrl;
      prev.style.display = 'block';
    } catch (err) {
      console.error(err);
      showToast('อ่านรูปไม่สำเร็จ', 'error');
    }
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

  const today = new Date().toISOString().split('T')[0];

  plots?.forEach(p => {
    const card = document.getElementById(`plot-card-${p.plot_code}`);
    const info = document.getElementById(`plot-info-${p.plot_code}`);
    if (!card || !info) return;

    card.className = 'plot-card';
    if (p.is_harvested) card.classList.add('harvested');
    else if (p.plant_date) card.classList.add('active-plot');
    if (problemSet.has(p.plot_code)) card.classList.add('has-problem');

    if (p.plant_date && !p.is_harvested) {
      // สถานะตามวันเก็บเกี่ยว: เลยกำหนด(แดง) / ใกล้เก็บ ≤5วัน(เหลืองเข้ม) / กำลังปลูก(เขียว)
      const harvest = p.harvest_date || addDays(p.plant_date, Math.max(0, 45 - (p.plant_age_days || 0)));
      const daysLeft = Math.round((new Date(harvest) - new Date(today)) / 86400000);
      let status = 'กำลังปลูก';
      if (daysLeft < 0) {
        card.classList.add('overdue-harvest');
        status = `🔴 ครบกำหนดเก็บ เลยมา ${-daysLeft} วัน`;
      } else if (daysLeft === 0) {
        card.classList.add('near-harvest');
        status = '🟡 เก็บได้วันนี้!';
      } else if (daysLeft <= 5) {
        card.classList.add('near-harvest');
        status = `🟡 ใกล้ถึงเวลาเก็บแล้ว อีก ${daysLeft} วัน`;
      }
      info.innerHTML = `${vegLabelMulti(p.vegetable_type)}<br>${status}`;
    } else if (p.plant_date) {
      info.innerHTML = `${vegLabelMulti(p.vegetable_type)}<br>เก็บแล้ว`;
    } else {
      info.textContent = 'ว่าง';
    }
  });
}

// เปิดหน้าต่างล็อตการปลูก (ดึงข้อมูลแปลงล่าสุด แล้วจัดกลุ่ม)
async function openPlotLots() {
  const modal = document.getElementById('plot-lots-modal');
  document.getElementById('plot-lots').innerHTML = '<div class="empty-state">กำลังโหลด...</div>';
  modal.style.display = 'flex';
  const { data: plots } = await db.from('plots').select('*');
  renderPlotLots(plots || []);
}
function closePlotLots() {
  document.getElementById('plot-lots-modal').style.display = 'none';
}

// จัดล็อตแปลง: รวมแปลงที่ปลูกในสัปดาห์เดียวกัน (จ.–อา.) เป็นล็อต ตั้งชื่ออัตโนมัติ
function renderPlotLots(plots) {
  const el = document.getElementById('plot-lots');
  if (!el) return;

  // จัดกลุ่มแปลงที่ปลูกอยู่ (มีวันปลูก ยังไม่เก็บ) ตามสัปดาห์ ISO ของวันปลูก
  const lots = {};
  plots.forEach(p => {
    if (!p.plant_date || p.is_harvested) return;
    const { year, week, monday } = isoWeekInfo(p.plant_date);
    const key = `${year}-${week}`;
    if (!lots[key]) lots[key] = { key, monday, plots: [] };
    lots[key].plots.push(p);
  });

  // เลขล็อตรันนิ่ง เริ่ม W001 เรียงตามสัปดาห์ที่ปลูก (เก่า→ใหม่)
  const asc = Object.values(lots).sort((a, b) => (a.monday < b.monday ? -1 : 1));
  asc.forEach((w, i) => { w.runNo = i + 1; });
  const display = asc.slice().sort((a, b) => (a.monday < b.monday ? 1 : -1));  // ใหม่สุดขึ้นก่อน

  if (!display.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🌱</div>ยังไม่มีแปลงที่กำลังปลูก</div>';
    return;
  }

  const short = d => new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  const rangeOf = arr => {
    const s = arr.slice().sort();
    return s[0] === s[s.length - 1] ? formatDateTH(s[0]) : `${short(s[0])}–${short(s[s.length - 1])}`;
  };

  const today = new Date().toISOString().split('T')[0];

  // สรุปเป้าหมายด้านบน
  const headHtml = `
    <div class="lot-target">
      <div class="lt-row"><span>🎯 เป้าหมายออเดอร์/สัปดาห์</span><b>${LOT_ORDER_TARGET_KG} กก.</b></div>
      <div class="lt-row"><span>🌱 ต้องปลูกให้ครบ/สัปดาห์</span><b>${LOT_PLOTS_PER_WEEK} แปลง</b></div>
      <div class="lt-note">ปลูกให้ครบ ${LOT_PLOTS_PER_WEEK} แปลงทุกสัปดาห์ ไม่งั้นผักจะไม่พอส่งออเดอร์</div>
    </div>`;

  const lotsHtml = display.map(w => {
    const code = `แปลง-W${String(w.runNo).padStart(3, '0')}`;
    const plantRange = rangeOf(w.plots.map(p => p.plant_date));
    const vegs = [...new Set(w.plots.flatMap(p => String(p.vegetable_type || '').split(',')).map(v => v.trim()).filter(Boolean))]
      .map(v => vegLabel(v)).join(', ');

    // เช็คว่าปลูกครบเป้า 4 แปลงในสัปดาห์นี้หรือยัง
    const cnt = w.plots.length;
    const complete = cnt >= LOT_PLOTS_PER_WEEK;
    const pct = Math.min(100, Math.round(cnt / LOT_PLOTS_PER_WEEK * 100));
    const need = Math.max(0, LOT_PLOTS_PER_WEEK - cnt);
    const barHtml = `
      <div class="batch-bar"><div class="batch-bar-fill ${complete ? 'ok' : 'warn'}" style="width:${pct}%"></div></div>
      <div class="batch-bar-label ${complete ? '' : 'danger'}">ปลูกแล้ว ${cnt}/${LOT_PLOTS_PER_WEEK} แปลง · ${
        complete ? 'ครบเป้าแล้ว ✅' : `🔴 ยังไม่ครบ! ปลูกอีก ${need} แปลง ไม่งั้นผักไม่พอขาย`}</div>`;

    // เรียงแปลงตามวันเก็บเกี่ยว (เก็บก่อน → เก็บทีหลัง) แล้วไล่สีจากอุ่น→เขียว เพื่อวางแผนขาย
    const withH = w.plots.map(p => ({
      p, h: p.harvest_date || addDays(p.plant_date, Math.max(0, 45 - (p.plant_age_days || 0)))
    })).sort((a, b) => (a.h < b.h ? -1 : (a.h > b.h ? 1 : 0)));
    const n = withH.length;
    const seq = withH.map((x, i) => {
      const hue = Math.round(18 + 112 * (n > 1 ? i / (n - 1) : 0));   // 18=ส้ม(ก่อน) → 130=เขียว(หลัง)
      const daysLeft = Math.round((new Date(x.h) - new Date(today)) / 86400000);
      const when = daysLeft < 0 ? `เลย ${-daysLeft} วัน` : daysLeft === 0 ? 'วันนี้' : `อีก ${daysLeft} วัน`;
      return `
        <div class="pls-row">
          <span class="pls-rank">${i + 1}</span>
          <span class="pls-code" style="background:hsl(${hue},68%,42%)">${x.p.plot_code}</span>
          <span class="pls-veg">${vegLabelMulti(x.p.vegetable_type)}</span>
          <span class="pls-date">${formatDateTH(x.h)} · ${when}</span>
        </div>`;
    }).join('');

    return `
      <div class="batch-card ${complete ? 'ready' : 'danger'}">
        <div class="batch-head">
          <div class="batch-code">${code}</div>
          <div class="batch-veg">${cnt} แปลง · สัปดาห์ที่ ${w.runNo}</div>
        </div>
        ${barHtml}
        <div class="batch-meta">🌱 ปลูก: ${plantRange}</div>
        <div class="batch-meta">🥬 ชนิดผัก: ${vegs || '-'}</div>
        <div class="pls-head">🧺 ลำดับเก็บเกี่ยว <span class="pls-legend"><i style="background:hsl(18,68%,42%)"></i>เก็บก่อน → <i style="background:hsl(130,68%,42%)"></i>เก็บทีหลัง</span></div>
        <div class="plot-lot-seq">${seq}</div>
      </div>`;
  }).join('');

  el.innerHTML = headHtml + lotsHtml;
}

function selectPlot(code) {
  selectedPlotCode = code;
  document.querySelectorAll('.plot-card').forEach(c => c.style.outline = 'none');
  document.getElementById(`plot-card-${code}`).style.outline = '3px solid var(--primary)';
  document.getElementById('selected-plot-label').textContent = `แปลง ${code}`;
  loadPlotDetail(code).then(applyPendingPlant);
  document.getElementById('plot-detail-section').style.display = 'block';
  document.getElementById('plot-detail-section').scrollIntoView({ behavior: 'smooth' });
}

// กรอกข้อมูลอัตโนมัติเมื่อมาจากล็อต Weekly Batch (กดย้ายลงปลูก)
function applyPendingPlant() {
  if (!vfPendingPlant) return;
  setPlotVeg(vfPendingPlant.veg);
  document.getElementById('plot-seedling-age').value = vfPendingPlant.age;
  document.getElementById('plot-plant-date').value = new Date().toISOString().split('T')[0];
  updatePlotHarvestDisplay();
  showToast(`กรอกข้อมูลจากล็อต ${vfPendingPlant.lot} แล้ว — ตรวจสอบและกดบันทึก`);
  vfPendingPlant = null;
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

  // รูปแปลงปลูก
  plotPhotoDataUrl = plot.photo_url || null;
  const photoPrev = document.getElementById('plot-photo-preview');
  document.getElementById('plot-photo-input').value = '';
  if (plot.photo_url) { photoPrev.src = plot.photo_url; photoPrev.style.display = 'block'; }
  else { photoPrev.src = ''; photoPrev.style.display = 'none'; }

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
    ? '<div class="card" style="padding:4px 14px">' + rows.map(c => {
        const active = c._active;
        return `<div class="cyc-card">
          <div class="cyc-main">
            <div class="cyc-title">รอบ ${c.cycle_number} · ${vegLabelMulti(c.vegetable_type)}${active ? ' <span class="status-pill growing">กำลังปลูก</span>' : ''}</div>
            <div class="cyc-sub">ปลูก ${formatDateTH(c.plant_date)} · เก็บ ${active ? 'รอเก็บ' : formatDateTH(c.harvest_date)}${active ? '' : ` · <b>${c.actual_kg || '-'} kg</b>`}</div>
          </div>
          <div class="cyc-act">${active
            ? '<button class="mini-btn" onclick="scrollToPlotForm()">แก้ไข</button>'
            : `<button class="mini-btn" onclick="editCycle('${c.id}')">แก้ไข</button><button class="mini-btn danger" onclick="deleteCycle('${c.id}')">ลบ</button>`}</div>
        </div>`;
      }).join('') + '</div>'
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
  if (!(await vfConfirm('ลบรอบนี้ออกจากประวัติ? (จำนวนรอบจะลดลง 1)', { okLabel: 'ลบ' }))) return;
  // อ่านรอบที่จะลบไว้ก่อน เพื่อหักจำนวนรอบจริงของแปลง
  const { data: cyc } = await db.from('plot_cycles').select('plot_code').eq('id', id).single();
  const { error } = await db.from('plot_cycles').delete().eq('id', id);
  if (error) return showToast('ลบไม่สำเร็จ: ' + (error.message || error), 'error');

  // ลบรอบจริงไปด้วย — หัก cycle_count ของแปลงลง 1 (ไม่ต่ำกว่า 1)
  const code = cyc?.plot_code || selectedPlotCode;
  if (code) {
    const { data: plot } = await db.from('plots').select('cycle_count').eq('plot_code', code).single();
    const next = Math.max(1, (plot?.cycle_count || 1) - 1);
    await db.from('plots').update({ cycle_count: next, updated_at: new Date().toISOString() }).eq('plot_code', code);
  }

  showToast('ลบรอบแล้ว');
  loadAllPlots();
  if (selectedPlotCode) loadPlotDetail(selectedPlotCode);
}

// เคลียร์ข้อมูลทั้งแปลง — กรณีกรอกผิดจนจำนวนรอบเพี้ยน ให้รีเซ็ตกลับเป็นแปลงว่าง รอบ 1
async function clearPlot() {
  if (!selectedPlotCode) return showToast('กรุณาเลือกแปลงก่อน', 'error');
  if (!(await vfConfirm(`เคลียร์ข้อมูลทั้งหมดของแปลง ${selectedPlotCode}? ประวัติรอบปลูกทั้งหมดจะถูกลบ และจำนวนรอบจะกลับเป็น 1`, { okLabel: 'เคลียร์ข้อมูล', danger: true, icon: '🧹' }))) return;

  setLoading(true);
  try {
    // ลบประวัติรอบปลูกทั้งหมดของแปลงนี้
    await db.from('plot_cycles').delete().eq('plot_code', selectedPlotCode);
    // รีเซ็ตข้อมูลแปลงกลับเป็นว่าง รอบ 1
    const { error } = await db.from('plots').update({
      vegetable_type: null,
      plant_date: null,
      plant_age_days: null,
      harvest_date: null,
      estimated_kg: null,
      photo_url: null,
      actual_kg: null,
      is_harvested: false,
      harvest_notes: null,
      cycle_count: 1,
      updated_at: new Date().toISOString()
    }).eq('plot_code', selectedPlotCode);
    if (error) throw error;
    plotPhotoDataUrl = null;

    showToast(`เคลียร์ข้อมูลแปลง ${selectedPlotCode} แล้ว`);
    loadAllPlots();
    document.getElementById('plot-detail-section').style.display = 'none';
    selectedPlotCode = null;
  } catch (err) {
    console.error(err);
    showToast('เคลียร์ไม่สำเร็จ: ' + (err.message || err), 'error');
  } finally {
    setLoading(false);
  }
}

function toggleHarvestFields(show) {
  document.getElementById('harvest-fields').style.display = show ? 'block' : 'none';
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
    photo_url: plotPhotoDataUrl,
    is_harvested: isHarvested,
    actual_kg: isHarvested ? actualKg : null,
    harvest_notes: isHarvested ? harvestNotes : null,
    updated_at: new Date().toISOString()
  };

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

    // Log planting
    if (!current?.plant_date && plantDate) {
      await db.from('calendar_activities').insert({
        activity_date: plantDate,
        activity_type: 'planting',
        plot_code: selectedPlotCode,
        summary: `ปลูก ${vegLabelMulti(vegType)} แปลง ${selectedPlotCode}`
      });
    }

    loadAllPlots();
    loadPlotDetail(selectedPlotCode);

    // ปุ่มย้อนกลับ: คืนค่าข้อมูลแปลงกลับเป็นก่อนบันทึก
    const code = selectedPlotCode;
    const revert = {
      vegetable_type: current?.vegetable_type ?? null,
      plant_date: current?.plant_date ?? null,
      plant_age_days: current?.plant_age_days ?? null,
      harvest_date: current?.harvest_date ?? null,
      estimated_kg: current?.estimated_kg ?? null,
      photo_url: current?.photo_url ?? null,
      is_harvested: current?.is_harvested ?? false,
      actual_kg: current?.actual_kg ?? null,
      harvest_notes: current?.harvest_notes ?? null,
      updated_at: new Date().toISOString()
    };
    vfOfferUndo(`บันทึกข้อมูลแปลง ${code} แล้ว`, async () => {
      await db.from('plots').update(revert).eq('plot_code', code);
      loadAllPlots();
      if (selectedPlotCode === code) loadPlotDetail(code);
    });
  } catch (err) {
    console.error(err);
    showToast('บันทึกไม่สำเร็จ: ' + (err.message || err), 'error');
  } finally {
    setLoading(false);
  }
}

async function startNewCycle() {
  if (!selectedPlotCode) return;
  if (!(await vfConfirm(`เริ่มรอบปลูกใหม่สำหรับแปลง ${selectedPlotCode}?`, { okLabel: 'เริ่มรอบใหม่', danger: false, icon: '🌱' }))) return;

  const { data: current } = await db.from('plots').select('*').eq('plot_code', selectedPlotCode).single();

  setLoading(true);
  try {
    await db.from('plots').update({
      vegetable_type: null,
      plant_date: null,
      harvest_date: null,
      estimated_kg: null,
      photo_url: null,
      actual_kg: null,
      is_harvested: false,
      harvest_notes: null,
      cycle_count: (current?.cycle_count || 1) + 1,
      updated_at: new Date().toISOString()
    }).eq('plot_code', selectedPlotCode);
    plotPhotoDataUrl = null;

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

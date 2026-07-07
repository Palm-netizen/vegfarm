// js/calendar.js — ปฏิทินภาพรวม

let calCurrentDate = new Date();
let calActivitiesCache = {};
let calHarvestCache = {};   // วันเก็บผัก: dateStr -> [{code, veg, kg}]

function initCalendar() {
  document.getElementById('cal-prev').addEventListener('click', () => {
    calCurrentDate.setMonth(calCurrentDate.getMonth() - 1);
    renderCalendar();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    calCurrentDate.setMonth(calCurrentDate.getMonth() + 1);
    renderCalendar();
  });
  renderCalendar();
}

async function renderCalendar() {
  setLoading(true);
  const year = calCurrentDate.getFullYear();
  const month = calCurrentDate.getMonth();

  const monthNames = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  document.getElementById('cal-month-label').textContent = `${monthNames[month]} ${year + 543}`;

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = firstDay.getDay(); // 0=Sun

  const startDateStr = new Date(year, month, 1 - startOffset).toISOString().split('T')[0];
  const endDateStr = new Date(year, month + 1, 6 - lastDay.getDay()).toISOString().split('T')[0];

  // Fetch activities + แปลงที่กำลังปลูก (เพื่อคำนวณวันเก็บผัก)
  const [{ data: activities }, { data: plots }] = await Promise.all([
    db.from('calendar_activities').select('*').gte('activity_date', startDateStr).lte('activity_date', endDateStr),
    db.from('plots').select('plot_code,vegetable_type,plant_date,plant_age_days,harvest_date,estimated_kg,is_harvested')
  ]);

  calActivitiesCache = {};
  activities?.forEach(a => {
    if (!calActivitiesCache[a.activity_date]) calActivitiesCache[a.activity_date] = [];
    calActivitiesCache[a.activity_date].push(a);
  });

  // วันเก็บผัก = แปลงที่กำลังปลูก (วันเก็บ = วันปลูก + 45 − อายุต้นกล้า)
  calHarvestCache = {};
  (plots || []).forEach(p => {
    if (!p.plant_date || p.is_harvested) return;
    const h = p.harvest_date || addDays(p.plant_date, Math.max(0, 45 - (p.plant_age_days || 0)));
    if (h < startDateStr || h > endDateStr) return;
    (calHarvestCache[h] = calHarvestCache[h] || []).push({ code: p.plot_code, veg: p.vegetable_type, kg: parseFloat(p.estimated_kg || 0) });
  });

  const grid = document.getElementById('cal-grid');
  const dayNames = ['อา','จ','อ','พ','พฤ','ศ','ส'];
  let html = dayNames.map(d => `<div class="cal-day-name">${d}</div>`).join('');

  const todayStr = new Date().toISOString().split('T')[0];

  // Leading empty days
  for (let i = 0; i < startOffset; i++) {
    const d = new Date(year, month, 1 - (startOffset - i));
    html += renderCalDay(d, todayStr, true);
  }
  // Month days
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = new Date(year, month, d);
    html += renderCalDay(date, todayStr, false);
  }
  // Trailing days to complete week
  const totalCells = startOffset + lastDay.getDate();
  const trailing = (7 - (totalCells % 7)) % 7;
  for (let i = 1; i <= trailing; i++) {
    const d = new Date(year, month + 1, i);
    html += renderCalDay(d, todayStr, true);
  }

  grid.innerHTML = html;
  setLoading(false);

  // Click handlers
  grid.querySelectorAll('.cal-day').forEach(el => {
    el.addEventListener('click', () => showDayDetail(el.dataset.date));
  });
}

function renderCalDay(date, todayStr, isOtherMonth) {
  const dateStr = date.toISOString().split('T')[0];
  const events = calActivitiesCache[dateStr] || [];
  const harvest = calHarvestCache[dateStr] || [];
  const hasProblems = events.some(e => e.activity_type === 'problem');
  const classes = ['cal-day'];
  if (dateStr === todayStr) classes.push('today');
  if (events.length) classes.push('has-events');
  if (hasProblems) classes.push('has-problems');
  if (harvest.length) classes.push('cal-harvest');
  if (isOtherMonth) classes.push('text-sub');

  const dots = events.slice(0, 4).map(e => {
    const dotClass = { seeding: 'dot-seed', planting: 'dot-plant', harvesting: 'dot-harvest', problem: 'dot-problem' }[e.activity_type] || '';
    return `<span class="cal-dot ${dotClass}"></span>`;
  }).join('');

  return `<div class="${classes.join(' ')}" data-date="${dateStr}" style="${isOtherMonth ? 'opacity:0.35' : ''}">
    <div class="day-num">${date.getDate()}</div>
    ${harvest.length ? '<div class="cal-harvest-label">เก็บผัก</div>' : `<div>${dots}</div>`}
  </div>`;
}

function showDayDetail(dateStr) {
  const events = calActivitiesCache[dateStr] || [];
  const harvest = calHarvestCache[dateStr] || [];
  const panel = document.getElementById('cal-detail-panel');
  const kg = n => n.toLocaleString('th-TH', { maximumFractionDigits: 1 });
  const vegName = v => (typeof vegLabelMulti === 'function') ? vegLabelMulti(v) : (v || '-');

  // การ์ดวันเก็บผัก (สำหรับวางแผนขาย)
  let harvestHtml = '';
  if (harvest.length) {
    const totalKg = harvest.reduce((s, h) => s + (h.kg || 0), 0);
    harvestHtml = `<div class="card cal-harvest-card" style="padding:8px 14px;margin-bottom:10px">
      <div class="card-title" style="margin:6px 0 6px">🧺 วันเก็บผัก · ${harvest.length} แปลง · รวม ~${kg(totalKg)} กก.</div>
      ${harvest.map(h => `<div class="cyc-sub" style="padding:2px 0"><span class="badge badge-green">${h.code}</span> ${vegName(h.veg)}${h.kg ? ` · ~${kg(h.kg)} กก.` : ''}</div>`).join('')}
    </div>`;
  }

  if (!events.length && !harvest.length) {
    panel.innerHTML = `<div class="card"><div class="card-title">${formatDateTH(dateStr)}</div><div class="empty-state" style="padding:16px">ไม่มีกิจกรรม</div></div>`;
    return;
  }
  if (!events.length) { panel.innerHTML = `<div class="card-title" style="margin:6px 0">${formatDateTH(dateStr)}</div>` + harvestHtml; return; }

  const typeIcon = { seeding: '🌱', planting: '🪴', harvesting: '🧺', problem: '⚠️', todo: '📋' };
  const typeLabel = { seeding: 'เพาะเมล็ด', planting: 'ปลูกผัก', harvesting: 'เก็บเกี่ยว', problem: 'ปัญหา', todo: 'งาน' };

  panel.innerHTML = harvestHtml + `<div class="card" style="padding:8px 14px">
    <div class="card-title" style="margin:6px 0 4px">${formatDateTH(dateStr)}</div>
    ${events.map(e => `
      <div class="cyc-card">
        <span style="font-size:18px;flex:none">${typeIcon[e.activity_type] || '📌'}</span>
        <div class="cyc-main">
          <div class="cyc-title">${typeLabel[e.activity_type] || e.activity_type}</div>
          <div class="cyc-sub">${e.summary || ''}</div>
        </div>
      </div>`).join('')}
  </div>`;
}

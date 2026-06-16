// js/calendar.js — ปฏิทินภาพรวม

let calCurrentDate = new Date();
let calActivitiesCache = {};

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

  // Fetch activities for visible range
  const { data: activities } = await db
    .from('calendar_activities')
    .select('*')
    .gte('activity_date', startDateStr)
    .lte('activity_date', endDateStr);

  calActivitiesCache = {};
  activities?.forEach(a => {
    if (!calActivitiesCache[a.activity_date]) calActivitiesCache[a.activity_date] = [];
    calActivitiesCache[a.activity_date].push(a);
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
  const hasProblems = events.some(e => e.activity_type === 'problem');
  const classes = ['cal-day'];
  if (dateStr === todayStr) classes.push('today');
  if (events.length) classes.push('has-events');
  if (hasProblems) classes.push('has-problems');
  if (isOtherMonth) classes.push('text-sub');

  const dots = events.slice(0, 4).map(e => {
    const dotClass = { seeding: 'dot-seed', planting: 'dot-plant', harvesting: 'dot-harvest', problem: 'dot-problem' }[e.activity_type] || '';
    return `<span class="cal-dot ${dotClass}"></span>`;
  }).join('');

  return `<div class="${classes.join(' ')}" data-date="${dateStr}" style="${isOtherMonth ? 'opacity:0.35' : ''}">
    <div class="day-num">${date.getDate()}</div>
    <div>${dots}</div>
  </div>`;
}

function showDayDetail(dateStr) {
  const events = calActivitiesCache[dateStr] || [];
  const panel = document.getElementById('cal-detail-panel');

  if (!events.length) {
    panel.innerHTML = `<div class="card"><div class="card-title">${formatDateTH(dateStr)}</div><div class="empty-state" style="padding:16px">ไม่มีกิจกรรม</div></div>`;
    return;
  }

  const typeIcon = { seeding: '🌱', planting: '🪴', harvesting: '🧺', problem: '⚠️', todo: '📋' };
  const typeLabel = { seeding: 'เพาะเมล็ด', planting: 'ปลูกผัก', harvesting: 'เก็บเกี่ยว', problem: 'ปัญหา', todo: 'งาน' };

  panel.innerHTML = `<div class="card">
    <div class="card-title">${formatDateTH(dateStr)}</div>
    ${events.map(e => `
      <div class="todo-item" style="border-left:3px solid ${e.activity_type === 'problem' ? 'var(--danger)' : 'var(--primary)'}">
        <span style="font-size:20px">${typeIcon[e.activity_type] || '📌'}</span>
        <div style="flex:1">
          <div style="font-weight:600">${typeLabel[e.activity_type] || e.activity_type}</div>
          <div class="text-sub">${e.summary || ''}</div>
        </div>
      </div>`).join('')}
  </div>`;
}

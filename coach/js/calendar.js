// js/calendar.js — เมนู Calendar: ปฏิทินนัดหมาย + แสดง To-do

let calCursor = todayISO().slice(0, 7); // 'YYYY-MM' เดือนที่กำลังดู
let calSelected = todayISO();           // วันที่เลือก
let calEvents = [];
let calTasks = [];

function initCalendar() {
  const el = document.querySelector('#page-calendar .page-content');
  el.innerHTML = `
    <header class="page-head">
      <div>
        <p class="greeting">ตารางของฉัน 🗓️</p>
        <h1 class="page-title">Calendar</h1>
      </div>
    </header>

    <section class="card cal-card">
      <div class="cal-nav">
        <button id="cal-prev" class="btn-step">‹</button>
        <h2 id="cal-month"></h2>
        <button id="cal-next" class="btn-step">›</button>
      </div>
      <div class="cal-grid-head">
        ${['อา','จ','อ','พ','พฤ','ศ','ส'].map(d => `<span>${d}</span>`).join('')}
      </div>
      <div id="cal-grid" class="cal-grid"></div>
    </section>

    <form id="event-form" class="add-bar">
      <input type="time" id="event-time" value="09:00">
      <input type="text" id="event-title" placeholder="เพิ่มนัดหมาย..." autocomplete="off" required>
      <button type="submit" class="btn-add">+</button>
    </form>

    <section class="card">
      <h3 class="day-label" id="agenda-label"></h3>
      <div id="agenda-list"></div>
    </section>
  `;
  document.getElementById('cal-prev').addEventListener('click', () => moveMonth(-1));
  document.getElementById('cal-next').addEventListener('click', () => moveMonth(1));
  document.getElementById('event-form').addEventListener('submit', addEvent);
  refreshCalendar();
}
window.refreshCalendar = refreshCalendar;

function moveMonth(delta) {
  const [y, m] = calCursor.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  calCursor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  renderCalendar();
}

async function refreshCalendar() {
  calEvents = await Store.select('calendar_events');
  calTasks = await Store.select('tasks');
  renderCalendar();
  renderAgenda();
}

function renderCalendar() {
  document.getElementById('cal-month').textContent = thaiMonth(calCursor);
  const [y, m] = calCursor.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(y, m, 0).getDate();

  const counts = {};
  calEvents.forEach(e => { counts[e.date] = (counts[e.date] || 0) + 1; });
  calTasks.forEach(t => { counts[t.date] = (counts[t.date] || 0) + 1; });

  let cells = '';
  for (let i = 0; i < startDow; i++) cells += `<span class="cal-cell empty"></span>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${calCursor}-${String(d).padStart(2, '0')}`;
    const cls = [
      'cal-cell',
      ds === todayISO() ? 'today' : '',
      ds === calSelected ? 'selected' : '',
      counts[ds] ? 'has-dot' : ''
    ].join(' ').trim();
    cells += `<button class="${cls}" data-date="${ds}">${d}${counts[ds] ? '<i class="cal-dot"></i>' : ''}</button>`;
  }
  const grid = document.getElementById('cal-grid');
  grid.innerHTML = cells;
  grid.querySelectorAll('.cal-cell[data-date]').forEach(c =>
    c.addEventListener('click', () => { calSelected = c.dataset.date; renderCalendar(); renderAgenda(); }));
}

function renderAgenda() {
  document.getElementById('agenda-label').textContent =
    formatDateTH(calSelected, { weekday: 'long', day: 'numeric', month: 'long' });

  const events = calEvents.filter(e => e.date === calSelected)
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const tasks = calTasks.filter(t => t.date === calSelected);

  const list = document.getElementById('agenda-list');
  if (events.length === 0 && tasks.length === 0) {
    list.innerHTML = `<div class="empty">ว่างทั้งวัน ☀️</div>`;
    return;
  }

  let html = events.map(e => `
    <div class="agenda-row">
      <span class="agenda-time">${e.time || '--:--'}</span>
      <span class="agenda-title">${escapeHtml(e.title)}</span>
      <button class="task-del" data-id="${e.id}">✕</button>
    </div>`).join('');

  if (tasks.length) {
    html += `<p class="agenda-sub">📋 To-do วันนี้</p>` + tasks.map(t => {
      const st = (window.TASK_STATUS || {})[t.status];
      return `<div class="agenda-row todo">
        <span class="agenda-time">${st ? st.dot : '•'}</span>
        <span class="agenda-title ${t.status === 'done' ? 'done' : ''}">${escapeHtml(t.title)}</span>
      </div>`;
    }).join('');
  }

  list.innerHTML = html;
  list.querySelectorAll('.task-del').forEach(b =>
    b.addEventListener('click', () => delEvent(b.dataset.id)));
}

async function addEvent(e) {
  e.preventDefault();
  const title = document.getElementById('event-title').value.trim();
  const time = document.getElementById('event-time').value;
  if (!title) return;
  await Store.insert('calendar_events', { date: calSelected, time, title });
  document.getElementById('event-title').value = '';
  showToast('เพิ่มนัดหมายแล้ว');
  refreshCalendar();
}

async function delEvent(id) {
  await Store.remove('calendar_events', id);
  refreshCalendar();
}

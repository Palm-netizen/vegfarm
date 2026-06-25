// js/tasks.js — เมนู Tasks / To Do

const TASK_STATUS = {
  pending: { label: 'ค้างอยู่', dot: '🔴', cls: 'st-pending', next: 'doing' },
  doing:   { label: 'กำลังทำ', dot: '🟡', cls: 'st-doing',   next: 'done' },
  done:    { label: 'เสร็จแล้ว', dot: '🟢', cls: 'st-done',   next: 'pending' }
};
window.TASK_STATUS = TASK_STATUS;

function initTasks() {
  const el = document.querySelector('#page-tasks .page-content');
  el.innerHTML = `
    <header class="page-head">
      <div>
        <p class="greeting">งานที่ต้องทำ ✅</p>
        <h1 class="page-title">Tasks</h1>
      </div>
      <div class="head-stat">
        <span class="head-stat-num" id="tasks-done">0/0</span>
        <span class="head-stat-label">เสร็จแล้ว</span>
      </div>
    </header>

    <form id="task-form" class="add-bar">
      <input type="text" id="task-title" placeholder="เพิ่มงานใหม่..." autocomplete="off" required>
      <input type="date" id="task-date" value="${todayISO()}">
      <button type="submit" class="btn-add">+</button>
    </form>

    <div class="status-legend">
      ${Object.values(TASK_STATUS).map(s => `<span>${s.dot} ${s.label}</span>`).join('')}
    </div>

    <div id="tasks-list"></div>
  `;
  document.getElementById('task-form').addEventListener('submit', addTask);
  refreshTasks();
}
window.refreshTasks = refreshTasks;

async function addTask(e) {
  e.preventDefault();
  const title = document.getElementById('task-title').value.trim();
  const date = document.getElementById('task-date').value || todayISO();
  if (!title) return;
  await Store.insert('tasks', { title, date, status: 'pending' });
  document.getElementById('task-title').value = '';
  showToast('เพิ่มงานแล้ว');
  refreshTasks();
}

async function refreshTasks() {
  const rows = await Store.select('tasks', { order: 'date', asc: true });
  const today = todayISO();

  const done = rows.filter(r => r.status === 'done').length;
  const stat = document.getElementById('tasks-done');
  if (stat) stat.textContent = `${done}/${rows.length}`;

  // จัดกลุ่มตามวันที่
  const groups = {};
  rows.forEach(r => { (groups[r.date] ||= []).push(r); });
  const dates = Object.keys(groups).sort();

  const list = document.getElementById('tasks-list');
  if (rows.length === 0) {
    list.innerHTML = `<div class="empty">ยังไม่มีงาน เพิ่มงานแรกของวันนี้เลย 🚀</div>`;
    return;
  }

  list.innerHTML = dates.map(date => {
    let label = formatDateTH(date, { weekday: 'long', day: 'numeric', month: 'long' });
    if (date === today) label = 'วันนี้ · ' + label;
    return `
    <section class="card day-group ${date === today ? 'is-today' : ''}">
      <h3 class="day-label">${label}</h3>
      ${groups[date].map(t => {
        const st = TASK_STATUS[t.status] || TASK_STATUS.pending;
        return `
        <div class="task-row ${st.cls}">
          <button class="task-status" data-id="${t.id}" title="แตะเพื่อเปลี่ยนสถานะ">${st.dot}</button>
          <span class="task-text ${t.status === 'done' ? 'done' : ''}">${escapeHtml(t.title)}</span>
          <button class="task-del" data-id="${t.id}">✕</button>
        </div>`;
      }).join('')}
    </section>`;
  }).join('');

  list.querySelectorAll('.task-status').forEach(b =>
    b.addEventListener('click', () => cycleStatus(b.dataset.id)));
  list.querySelectorAll('.task-del').forEach(b =>
    b.addEventListener('click', () => delTask(b.dataset.id)));
}

async function cycleStatus(id) {
  const rows = await Store.select('tasks');
  const t = rows.find(r => r.id === id);
  if (!t) return;
  const next = (TASK_STATUS[t.status] || TASK_STATUS.pending).next;
  await Store.update('tasks', id, { status: next });
  refreshTasks();
}

async function delTask(id) {
  await Store.remove('tasks', id);
  refreshTasks();
}

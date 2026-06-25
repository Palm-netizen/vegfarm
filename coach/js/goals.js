// js/goals.js — เมนู Goals: เป้าหมายรายเดือน + แถบความคืบหน้า

let goals = [];
let goalsMonth = currentMonth();

function initGoals() {
  const el = document.querySelector('#page-goals .page-content');
  el.innerHTML = `
    <header class="page-head">
      <div>
        <p class="greeting">เป้าหมายเดือนนี้ 🎯</p>
        <h1 class="page-title">Goals</h1>
      </div>
      <div class="head-stat">
        <span class="head-stat-num" id="goals-avg">0%</span>
        <span class="head-stat-label">เฉลี่ย</span>
      </div>
    </header>

    <div class="cal-nav month-switch">
      <button id="g-prev" class="btn-step">‹</button>
      <h2 id="g-month"></h2>
      <button id="g-next" class="btn-step">›</button>
    </div>

    <form id="goal-form" class="add-bar">
      <input type="text" id="g-title" placeholder="เป้าหมายใหม่..." required>
      <input type="number" id="g-target" placeholder="เป้า" min="1" value="20" title="ค่าเป้าหมาย">
      <button type="submit" class="btn-add">+</button>
    </form>

    <div id="goals-list"></div>
  `;
  document.getElementById('g-prev').addEventListener('click', () => switchGoalMonth(-1));
  document.getElementById('g-next').addEventListener('click', () => switchGoalMonth(1));
  document.getElementById('goal-form').addEventListener('submit', addGoal);
  refreshGoals();
}
window.refreshGoals = refreshGoals;

function switchGoalMonth(delta) {
  const [y, m] = goalsMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  goalsMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  refreshGoals();
}

async function refreshGoals() {
  goals = await Store.select('goals', { eq: { month: goalsMonth }, order: 'created_at', asc: true });
  document.getElementById('g-month').textContent = thaiMonth(goalsMonth);
  renderGoals();
}

function pct(g) {
  const t = Number(g.target) || 0;
  if (t <= 0) return 0;
  return Math.min(100, Math.round((Number(g.current) || 0) / t * 100));
}

function renderGoals() {
  const avg = goals.length
    ? Math.round(goals.reduce((s, g) => s + pct(g), 0) / goals.length) : 0;
  document.getElementById('goals-avg').textContent = avg + '%';

  const list = document.getElementById('goals-list');
  if (goals.length === 0) {
    list.innerHTML = `<div class="empty">ยังไม่มีเป้าหมายเดือนนี้ ตั้งเป้าแรกเลย 🎯</div>`;
    return;
  }
  list.innerHTML = goals.map(g => {
    const p = pct(g);
    return `
    <section class="card goal-card">
      <div class="goal-head">
        <p class="goal-title">${escapeHtml(g.title)}</p>
        <button class="task-del" data-id="${g.id}">✕</button>
      </div>
      <div class="goal-bar"><span style="width:${p}%"></span></div>
      <div class="goal-foot">
        <div class="goal-step">
          <button class="btn-step" data-dec="${g.id}">−</button>
          <span class="goal-val">${g.current || 0} / ${g.target}</span>
          <button class="btn-step" data-inc="${g.id}">+</button>
        </div>
        <span class="goal-pct ${p >= 100 ? 'done' : ''}">${p}%</span>
      </div>
    </section>`;
  }).join('');

  list.querySelectorAll('[data-inc]').forEach(b =>
    b.addEventListener('click', () => stepGoal(b.dataset.inc, 1)));
  list.querySelectorAll('[data-dec]').forEach(b =>
    b.addEventListener('click', () => stepGoal(b.dataset.dec, -1)));
  list.querySelectorAll('.task-del').forEach(b =>
    b.addEventListener('click', async () => { await Store.remove('goals', b.dataset.id); refreshGoals(); }));
}

async function addGoal(e) {
  e.preventDefault();
  const title = document.getElementById('g-title').value.trim();
  const target = parseInt(document.getElementById('g-target').value) || 1;
  if (!title) return;
  await Store.insert('goals', { title, target, current: 0, month: goalsMonth });
  document.getElementById('g-title').value = '';
  showToast('ตั้งเป้าหมายแล้ว 🎯');
  refreshGoals();
}

async function stepGoal(id, delta) {
  const g = goals.find(x => x.id === id);
  if (!g) return;
  const next = Math.max(0, Math.min(Number(g.target) || 0, (Number(g.current) || 0) + delta));
  g.current = next; // optimistic
  renderGoals();
  await Store.update('goals', id, { current: next });
}

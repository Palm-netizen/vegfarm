// js/dashboard.js — เมนู 2: Dashboard

let dashChartInstance = null;

async function loadDashboard() {
  setLoading(true);
  const { data, error } = await db.from('notes').select('*').order('created_at', { ascending: false });
  setLoading(false);
  if (error) { showToast('โหลด Dashboard ไม่สำเร็จ', 'error'); return; }

  renderQuoteOfDay(data);
  renderDashStats(data);
  renderRecentNotes(data.slice(0, 5));
  renderWeeklyChart(data);
}

function renderQuoteOfDay(notes) {
  const pool = [];
  notes.forEach(n => (n.highlights || []).forEach(h => pool.push({ text: h, book: n.book_title })));
  if (!pool.length) {
    document.getElementById('qotd-text').textContent = 'ยังไม่มีไฮไลท์ในระบบ เริ่มบันทึกเล่มแรกกันเลย!';
    document.getElementById('qotd-source').textContent = '–';
    return;
  }
  const rand = seededRandom(todayStr());
  const pick = pool[Math.floor(rand() * pool.length)];
  document.getElementById('qotd-text').textContent = `“${pick.text}”`;
  document.getElementById('qotd-source').textContent = `จากหนังสือ: ${pick.book}`;
}

function renderDashStats(notes) {
  const dateSet = new Set(notes.map(n => n.read_date));
  let cursor = new Date();
  if (!dateSet.has(toDateStr(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (dateSet.has(toDateStr(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  document.getElementById('dash-streak').textContent = streak;

  const bookSet = new Set(notes.map(n => n.book_title));
  document.getElementById('dash-books').textContent = bookSet.size;

  const highlightCount = notes.reduce((sum, n) => sum + (n.highlights?.length || 0), 0);
  document.getElementById('dash-highlights').textContent = highlightCount;

  const actionsTotal = notes.filter(n => n.action && n.action.trim()).length;
  const actionsDone = notes.filter(n => n.action_done).length;
  document.getElementById('dash-actions-done').textContent = actionsDone;
  document.getElementById('dash-actions-total-label').textContent = `จาก ${actionsTotal} ข้อ`;
}

function renderRecentNotes(notes) {
  const wrap = document.getElementById('dash-recent-notes');
  if (!notes.length) {
    wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">📖</div>ยังไม่มีบันทึก</div>';
    return;
  }
  wrap.innerHTML = notes.map(renderNoteCard).join('');
}

function renderWeeklyChart(notes) {
  const weeks = 8;
  const labels = [];
  const counts = [];
  const now = new Date();
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() - i * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const startStr = toDateStr(weekStart);
    const endStr = toDateStr(weekEnd);
    labels.push(weekStart.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }));
    counts.push(notes.filter(n => n.read_date >= startStr && n.read_date <= endStr).length);
  }

  const ctx = document.getElementById('dashChart');
  if (dashChartInstance) dashChartInstance.destroy();
  dashChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'บันทึก', data: counts, backgroundColor: '#4F46E5', borderRadius: 6 }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
    }
  });
}

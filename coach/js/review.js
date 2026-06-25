// js/review.js — เมนู Daily Review: สรุปบทเรียนประจำวัน

const REVIEW_Q = [
  { key: 'did_well', icon: '🌟', label: 'วันนี้ทำอะไรได้ดี', ph: 'เช่น ติดตามลูกค้า 5 คน' },
  { key: 'learned',  icon: '💡', label: 'วันนี้เรียนรู้อะไร', ph: 'เช่น ลูกค้าต้องการฟังมากกว่าการขาย' },
  { key: 'improve',  icon: '🔧', label: 'พรุ่งนี้ต้องปรับปรุงอะไร', ph: 'เช่น เตรียมคำถามให้ดีขึ้น' }
];

let reviews = [];

function initReview() {
  const el = document.querySelector('#page-review .page-content');
  el.innerHTML = `
    <header class="page-head">
      <div>
        <p class="greeting">ก่อนนอน 🌙</p>
        <h1 class="page-title">Daily Review</h1>
      </div>
    </header>

    <section class="card review-form">
      <h3 class="day-label" id="review-today-label"></h3>
      <form id="review-form" class="form-grid">
        ${REVIEW_Q.map(q => `
          <label class="rev-q">
            <span>${q.icon} ${q.label}</span>
            <textarea id="rv-${q.key}" rows="2" placeholder="${q.ph}"></textarea>
          </label>`).join('')}
        <button type="submit" class="btn-primary full">บันทึกสรุปวันนี้</button>
      </form>
    </section>

    <h3 class="section-title">บันทึกย้อนหลัง</h3>
    <div id="review-history"></div>
  `;
  document.getElementById('review-today-label').textContent =
    formatDateTH(todayISO(), { weekday: 'long', day: 'numeric', month: 'long' });
  document.getElementById('review-form').addEventListener('submit', saveReview);
  refreshReview();
}
window.refreshReview = refreshReview;

async function refreshReview() {
  reviews = await Store.select('daily_reviews', { order: 'date', asc: false });
  const today = reviews.find(r => r.date === todayISO());
  REVIEW_Q.forEach(q => {
    const ta = document.getElementById(`rv-${q.key}`);
    if (ta) ta.value = today?.[q.key] || '';
  });
  renderReviewHistory();
}

async function saveReview(e) {
  e.preventDefault();
  const data = { date: todayISO() };
  REVIEW_Q.forEach(q => { data[q.key] = document.getElementById(`rv-${q.key}`).value.trim(); });
  const existing = reviews.find(r => r.date === todayISO());
  if (existing) await Store.update('daily_reviews', existing.id, data);
  else await Store.insert('daily_reviews', data);
  showToast('บันทึกสรุปวันนี้แล้ว 🌙');
  refreshReview();
}

function renderReviewHistory() {
  const past = reviews.filter(r => r.date !== todayISO());
  const wrap = document.getElementById('review-history');
  if (past.length === 0) {
    wrap.innerHTML = `<div class="empty">ยังไม่มีบันทึกย้อนหลัง</div>`;
    return;
  }
  wrap.innerHTML = past.map(r => `
    <section class="card rev-item">
      <div class="rev-item-head">
        <span class="rev-date">${formatDateTH(r.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
        <button class="task-del" data-id="${r.id}">✕</button>
      </div>
      ${REVIEW_Q.map(q => r[q.key] ? `<p class="rev-line"><b>${q.icon}</b> ${escapeHtml(r[q.key])}</p>` : '').join('')}
    </section>`).join('');

  wrap.querySelectorAll('.task-del').forEach(b =>
    b.addEventListener('click', async () => { await Store.remove('daily_reviews', b.dataset.id); refreshReview(); }));
}

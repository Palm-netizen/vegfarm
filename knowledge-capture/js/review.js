// js/review.js — เมนู 3: สุ่มทบทวน (Spaced Repetition)

const REVIEW_INTERVALS = [1, 7, 30, 90, 365];
let reviewActiveDays = 30;

function initReview() {
  const tabsWrap = document.getElementById('review-tabs');
  tabsWrap.innerHTML = REVIEW_INTERVALS.map(d => `
    <button class="review-tab ${d === reviewActiveDays ? 'active' : ''}" data-days="${d}" onclick="switchReviewTab(${d})">${d} วันก่อน</button>
  `).join('');
  loadReviewContent(reviewActiveDays);
}

function switchReviewTab(days) {
  reviewActiveDays = days;
  document.querySelectorAll('.review-tab').forEach(t => t.classList.toggle('active', parseInt(t.dataset.days, 10) === days));
  loadReviewContent(days);
}

async function loadReviewContent(days) {
  const wrap = document.getElementById('review-content');
  wrap.innerHTML = '<div class="text-sub">กำลังโหลด...</div>';
  const targetDate = daysAgoStr(days);

  const { data, error } = await db.from('notes').select('*').eq('read_date', targetDate).order('created_at', { ascending: true });
  if (error) { wrap.innerHTML = '<div class="text-sub">โหลดข้อมูลไม่สำเร็จ</div>'; return; }

  const header = `<div class="section-sub" style="margin:0 0 14px">วันนี้เมื่อ ${days} วันที่แล้ว (${formatDateTH(targetDate)}) คุณอ่านอะไรไว้?</div>`;

  if (!data.length) {
    wrap.innerHTML = header + `<div class="empty-state"><div class="empty-icon">🗓️</div>ไม่มีบันทึกในวันนั้น</div>`;
    return;
  }
  wrap.innerHTML = header + data.map(renderNoteCard).join('');
}

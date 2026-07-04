// js/calendar.js — เมนู 1: ปฏิทิน (จุดเข้าไปบันทึกความรู้)

let calMonthCursor = new Date();
let currentModalDate = null;

const CAL_DAY_NAMES = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

function initCalendar() {
  document.getElementById('cal-prev').addEventListener('click', () => {
    calMonthCursor.setMonth(calMonthCursor.getMonth() - 1);
    renderCalendar();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    calMonthCursor.setMonth(calMonthCursor.getMonth() + 1);
    renderCalendar();
  });
  renderCalendar();
}

async function renderCalendar() {
  const year = calMonthCursor.getFullYear();
  const month = calMonthCursor.getMonth();

  document.getElementById('cal-month-label').textContent =
    calMonthCursor.toLocaleDateString('th-TH', { year: 'numeric', month: 'long' });

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const firstStr = toDateStr(firstDay);
  const lastStr = toDateStr(lastDay);
  const today = todayStr();

  let notedDates = new Set();
  const { data, error } = await db.from('notes').select('read_date').gte('read_date', firstStr).lte('read_date', lastStr);
  if (!error && data) notedDates = new Set(data.map(r => r.read_date));

  const grid = document.getElementById('cal-grid');
  let html = CAL_DAY_NAMES.map(n => `<div class="cal-day-name">${n}</div>`).join('');

  for (let i = 0; i < startWeekday; i++) html += `<div class="cal-day empty"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = toDateStr(new Date(year, month, d));
    const classes = ['cal-day'];
    if (dateStr === today) classes.push('today');
    if (notedDates.has(dateStr)) classes.push('has-note');
    html += `
      <div class="${classes.join(' ')}" onclick="openDayModal('${dateStr}')">
        <div class="day-num">${d}</div>
        ${notedDates.has(dateStr) ? '<span class="cal-dot"></span>' : ''}
      </div>
    `;
  }

  grid.innerHTML = html;
}

async function openDayModal(dateStr) {
  currentModalDate = dateStr;
  document.getElementById('day-modal-title').textContent = formatDateTH(dateStr);
  document.getElementById('day-modal').style.display = 'flex';
  await loadDayNotes(dateStr);
}

function closeDayModal() {
  document.getElementById('day-modal').style.display = 'none';
}

async function loadDayNotes(dateStr) {
  const wrap = document.getElementById('day-modal-notes');
  wrap.innerHTML = '<div class="text-sub">กำลังโหลด...</div>';
  const { data, error } = await db.from('notes').select('*').eq('read_date', dateStr).order('created_at', { ascending: true });
  if (error) { wrap.innerHTML = '<div class="text-sub">โหลดข้อมูลไม่สำเร็จ</div>'; return; }
  if (!data.length) {
    wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">📖</div>ยังไม่มีบันทึกในวันนี้</div>';
    return;
  }
  wrap.innerHTML = data.map(renderNoteCard).join('');
}

function renderNoteCard(note) {
  return `
    <div class="note-card">
      <div class="note-card-head">
        <div>
          <div class="note-book">${escapeHTML(note.book_title)}</div>
          <div class="note-date">${formatDateTH(note.read_date)} · <span class="stars-display">${starsHTML(note.importance)}</span></div>
        </div>
      </div>
      ${(note.highlights || []).map(h => `<div class="note-highlight">${escapeHTML(h)}</div>`).join('')}
      ${note.insight ? `<div class="note-insight">💡 ${escapeHTML(note.insight)}</div>` : ''}
      ${note.action ? `<div class="note-action">🎯 ${escapeHTML(note.action)} ${note.action_done ? '<span class="note-done-badge">ทำแล้ว ✓</span>' : ''}</div>` : ''}
      ${(note.tags || []).length ? `<div class="note-tags">${note.tags.map(t => `<span class="note-tag">${escapeHTML(t)}</span>`).join('')}</div>` : ''}
      ${(note.image_urls || []).length ? `<div class="note-photos">${note.image_urls.map(u => `<img src="${u}">`).join('')}</div>` : ''}
      <div class="note-actions-row">
        <button class="btn btn-outline btn-sm" onclick="openEntryForm('${note.read_date}', '${note.id}')">แก้ไข</button>
        <button class="btn btn-outline btn-sm" onclick="quickDeleteNote('${note.id}', '${note.read_date}')">ลบ</button>
      </div>
    </div>
  `;
}

async function quickDeleteNote(id, dateStr) {
  if (!confirm('ลบบันทึกนี้ใช่หรือไม่?')) return;
  setLoading(true);
  const { error } = await db.from('notes').delete().eq('id', id);
  setLoading(false);
  if (error) { showToast('ลบไม่สำเร็จ', 'error'); return; }
  showToast('ลบบันทึกแล้ว');
  await renderCalendar();
  await loadDayNotes(dateStr);
}

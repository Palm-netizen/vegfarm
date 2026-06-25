// js/customers.js — เมนู Customer CRM

let customers = [];
let customerNotes = [];

function initCustomers() {
  const el = document.querySelector('#page-customers .page-content');
  el.innerHTML = `
    <header class="page-head">
      <div>
        <p class="greeting">ลูกค้าของฉัน 👥</p>
        <h1 class="page-title">Customers</h1>
      </div>
      <div class="head-stat">
        <span class="head-stat-num" id="cust-count">0</span>
        <span class="head-stat-label">คน</span>
      </div>
    </header>

    <button id="cust-add-btn" class="btn-primary full">+ เพิ่มลูกค้า</button>
    <div id="cust-list" class="cust-list"></div>

    <!-- ฟอร์มเพิ่ม/แก้ไข -->
    <div id="cust-modal" class="modal">
      <div class="modal-box">
        <div class="modal-head">
          <h2 id="cust-modal-title">เพิ่มลูกค้า</h2>
          <button class="modal-close" data-close>✕</button>
        </div>
        <form id="cust-form" class="form-grid">
          <input type="hidden" id="c-id">
          <label>ชื่อ <input type="text" id="c-name" required></label>
          <div class="row2">
            <label>อาชีพ <input type="text" id="c-occupation"></label>
            <label>อายุ <input type="number" id="c-age" min="0"></label>
          </div>
          <label>ความสนใจ <input type="text" id="c-interests" placeholder="สุขภาพ, ลดน้ำหนัก, ธุรกิจ"></label>
          <label>เป้าหมาย <input type="text" id="c-goal" placeholder="ลดน้ำหนัก 10 กก."></label>
          <label>กำลังโฟกัส <input type="text" id="c-focus" placeholder="คุมอาหาร"></label>
          <label>ชอบ <input type="text" id="c-likes" placeholder="กาแฟดำ, อาหารคลีน"></label>
          <button type="submit" class="btn-primary full">บันทึก</button>
        </form>
      </div>
    </div>

    <!-- รายละเอียด + ประวัติการคุย -->
    <div id="cust-detail" class="modal">
      <div class="modal-box">
        <div class="modal-head">
          <h2 id="d-name"></h2>
          <button class="modal-close" data-close-detail>✕</button>
        </div>
        <div id="d-body"></div>
      </div>
    </div>
  `;

  document.getElementById('cust-add-btn').addEventListener('click', () => openCustForm());
  document.getElementById('cust-form').addEventListener('submit', saveCustomer);
  el.querySelectorAll('[data-close]').forEach(b =>
    b.addEventListener('click', () => document.getElementById('cust-modal').classList.remove('open')));
  el.querySelectorAll('[data-close-detail]').forEach(b =>
    b.addEventListener('click', () => document.getElementById('cust-detail').classList.remove('open')));

  refreshCustomers();
}
window.refreshCustomers = refreshCustomers;

async function refreshCustomers() {
  customers = await Store.select('customers', { order: 'created_at', asc: false });
  customerNotes = await Store.select('customer_notes');
  document.getElementById('cust-count').textContent = customers.length;

  const list = document.getElementById('cust-list');
  if (customers.length === 0) {
    list.innerHTML = `<div class="empty">ยังไม่มีลูกค้า เพิ่มคนแรกเลย 🙌</div>`;
    return;
  }
  list.innerHTML = customers.map(c => {
    const noteCount = customerNotes.filter(n => n.customer_id === c.id).length;
    return `
    <div class="card cust-card" data-id="${c.id}">
      <div class="cust-avatar">${escapeHtml((c.name || '?').trim().charAt(0))}</div>
      <div class="cust-main">
        <p class="cust-name">${escapeHtml(c.name)}</p>
        <p class="cust-meta">${[c.occupation, c.age ? c.age + ' ปี' : ''].filter(Boolean).map(escapeHtml).join(' · ') || '—'}</p>
        ${c.goal ? `<span class="cust-goal">🎯 ${escapeHtml(c.goal)}</span>` : ''}
      </div>
      <span class="cust-notes-badge">💬 ${noteCount}</span>
    </div>`;
  }).join('');

  list.querySelectorAll('.cust-card').forEach(card =>
    card.addEventListener('click', () => openDetail(card.dataset.id)));
}

function openCustForm(c = null) {
  document.getElementById('cust-modal-title').textContent = c ? 'แก้ไขลูกค้า' : 'เพิ่มลูกค้า';
  document.getElementById('c-id').value = c?.id || '';
  document.getElementById('c-name').value = c?.name || '';
  document.getElementById('c-occupation').value = c?.occupation || '';
  document.getElementById('c-age').value = c?.age || '';
  document.getElementById('c-interests').value = c?.interests || '';
  document.getElementById('c-goal').value = c?.goal || '';
  document.getElementById('c-focus').value = c?.focus || '';
  document.getElementById('c-likes').value = c?.likes || '';
  document.getElementById('cust-modal').classList.add('open');
}

async function saveCustomer(e) {
  e.preventDefault();
  const id = document.getElementById('c-id').value;
  const data = {
    name: document.getElementById('c-name').value.trim(),
    occupation: document.getElementById('c-occupation').value.trim(),
    age: parseInt(document.getElementById('c-age').value) || null,
    interests: document.getElementById('c-interests').value.trim(),
    goal: document.getElementById('c-goal').value.trim(),
    focus: document.getElementById('c-focus').value.trim(),
    likes: document.getElementById('c-likes').value.trim()
  };
  if (!data.name) return;
  if (id) await Store.update('customers', id, data);
  else await Store.insert('customers', data);
  document.getElementById('cust-modal').classList.remove('open');
  showToast('บันทึกลูกค้าแล้ว');
  refreshCustomers();
}

function openDetail(id) {
  const c = customers.find(x => x.id === id);
  if (!c) return;
  document.getElementById('d-name').textContent = c.name;
  const notes = customerNotes.filter(n => n.customer_id === id)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const field = (label, val) => val ? `<div class="d-field"><span>${label}</span><b>${escapeHtml(val)}</b></div>` : '';

  document.getElementById('d-body').innerHTML = `
    <div class="d-fields">
      ${field('อาชีพ', c.occupation)}
      ${field('อายุ', c.age ? c.age + ' ปี' : '')}
      ${field('ความสนใจ', c.interests)}
      ${field('เป้าหมาย', c.goal)}
      ${field('กำลังโฟกัส', c.focus)}
      ${field('ชอบ', c.likes)}
    </div>
    <div class="d-actions">
      <button class="btn-ghost" id="d-edit">✏️ แก้ไข</button>
      <button class="btn-ghost danger" id="d-del">🗑 ลบ</button>
    </div>

    <h3 class="day-label">ประวัติการคุย</h3>
    <form id="note-form" class="add-bar">
      <input type="date" id="note-date" value="${todayISO()}">
      <input type="text" id="note-text" placeholder="บันทึกการคุย..." required>
      <button type="submit" class="btn-add">+</button>
    </form>
    <div class="timeline">
      ${notes.length ? notes.map(n => `
        <div class="tl-item">
          <span class="tl-date">${formatDateTH(n.date)}</span>
          <p class="tl-note">${escapeHtml(n.note)}</p>
          <button class="task-del" data-note="${n.id}">✕</button>
        </div>`).join('') : '<div class="empty">ยังไม่มีบันทึก</div>'}
    </div>
  `;

  document.getElementById('d-edit').addEventListener('click', () => {
    document.getElementById('cust-detail').classList.remove('open');
    openCustForm(c);
  });
  document.getElementById('d-del').addEventListener('click', () => deleteCustomer(id));
  document.getElementById('note-form').addEventListener('submit', e => addNote(e, id));
  document.querySelectorAll('#d-body .task-del').forEach(b =>
    b.addEventListener('click', () => delNote(b.dataset.note, id)));

  document.getElementById('cust-detail').classList.add('open');
}

async function addNote(e, customerId) {
  e.preventDefault();
  const date = document.getElementById('note-date').value || todayISO();
  const note = document.getElementById('note-text').value.trim();
  if (!note) return;
  await Store.insert('customer_notes', { customer_id: customerId, date, note });
  customerNotes = await Store.select('customer_notes');
  openDetail(customerId);
}

async function delNote(noteId, customerId) {
  await Store.remove('customer_notes', noteId);
  customerNotes = await Store.select('customer_notes');
  openDetail(customerId);
}

async function deleteCustomer(id) {
  if (!confirm('ลบลูกค้าคนนี้?')) return;
  await Store.remove('customers', id);
  for (const n of customerNotes.filter(n => n.customer_id === id)) {
    await Store.remove('customer_notes', n.id);
  }
  document.getElementById('cust-detail').classList.remove('open');
  showToast('ลบแล้ว');
  refreshCustomers();
}

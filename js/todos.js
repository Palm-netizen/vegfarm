// js/todos.js — To-do list รายวัน

function initTodos() {
  document.getElementById('todo-date-picker').value = new Date().toISOString().split('T')[0];
  document.getElementById('todo-date-picker').addEventListener('change', () => { loadTodos(); loadDayOrders(); });
  document.getElementById('todo-add-form').addEventListener('submit', (e) => {
    e.preventDefault();
    addTodo();
  });
  loadTodos();
  loadDayOrders();
}

async function loadTodos() {
  const date = document.getElementById('todo-date-picker').value;
  const { data: todos } = await db
    .from('todos')
    .select('*')
    .eq('todo_date', date)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  const list = document.getElementById('todo-list');

  if (!todos?.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div>ยังไม่มีงานในวันนี้ — เพิ่มได้สูงสุด 5 ข้อ</div>';
  } else {
    list.innerHTML = todos.map(t => `
      <div class="todo-item ${t.is_done ? 'done' : ''}">
        <input type="checkbox" class="todo-check" ${t.is_done ? 'checked' : ''} onchange="toggleTodo('${t.id}', this.checked)">
        <span class="todo-text">${t.task}</span>
        <button class="btn-icon" onclick="deleteTodo('${t.id}')">ลบ</button>
      </div>`).join('');
  }

  // Limit add to 5 per day
  const count = todos?.length || 0;
  document.getElementById('todo-count-label').textContent = `${count}/5 งาน`;
  document.getElementById('todo-input').disabled = count >= 5;
  document.querySelector('#todo-add-form button').disabled = count >= 5;
}

async function addTodo() {
  const date = document.getElementById('todo-date-picker').value;
  const input = document.getElementById('todo-input');
  const task = input.value.trim();
  if (!task) return;

  const { count } = await db.from('todos').select('*', { count: 'exact', head: true }).eq('todo_date', date);
  if (count >= 5) return showToast('เพิ่มได้สูงสุด 5 งานต่อวัน', 'error');

  setLoading(true);
  try {
    const { error } = await db.from('todos').insert({ todo_date: date, task, sort_order: count });
    if (error) throw error;

    await db.from('calendar_activities').insert({
      activity_date: date,
      activity_type: 'todo',
      summary: task
    });

    input.value = '';
    loadTodos();
  } catch (err) {
    showToast('เพิ่มไม่สำเร็จ: ' + (err.message || err), 'error');
    console.error(err);
  } finally {
    setLoading(false);
  }
}

async function toggleTodo(id, isDone) {
  await db.from('todos').update({ is_done: isDone }).eq('id', id);
  loadTodos();
}

async function deleteTodo(id) {
  await db.from('todos').delete().eq('id', id);
  loadTodos();
}

// ===== ออเดอร์ผักวันนี้ที่ต้องส่ง (รายวัน) =====
const DORDER_VEG = { green_oak:'กรีนโอ๊ค', red_oak:'เรดโอ๊ค', finley:'ฟินเลย์', cos:'คอส', butterhead:'บัตเตอร์เฮด' };
const DORDER_PRICE = (typeof INCOME_PRICE_PER_KG !== 'undefined') ? INCOME_PRICE_PER_KG : 100;
let editDayOrderId = null;

function dorderWeekStart(d) { const x = new Date(d); const day = (x.getDay()+6)%7; x.setDate(x.getDate()-day); return x.toISOString().split('T')[0]; }

async function loadDayOrders() {
  const date = document.getElementById('todo-date-picker').value;
  // customer dropdown
  const sel = document.getElementById('dorder-customer');
  if (sel) {
    const { data: customers } = await db.from('customers').select('name').order('name', { ascending: true });
    const cur = sel.value;
    sel.innerHTML = (customers && customers.length)
      ? customers.map(c => `<option value="${c.name}">${c.name}</option>`).join('')
      : '<option value="">— ยังไม่มีลูกค้า —</option>';
    if (cur) sel.value = cur;
  }

  const { data } = await db.from('orders').select('*').eq('order_date', date).order('created_at', { ascending: true });
  const orders = data || [];
  const kg = orders.reduce((s, o) => s + parseFloat(o.kg || 0), 0);
  const baht = kg * DORDER_PRICE;
  const done = orders.filter(o => o.delivered).reduce((s, o) => s + parseFloat(o.kg || 0), 0);
  const fmt = n => n.toLocaleString('th-TH', { maximumFractionDigits: 1 });

  document.getElementById('dorder-total').innerHTML = orders.length
    ? `รวม <b style="color:var(--primary)">${fmt(kg)} กก. · ฿${baht.toLocaleString('th-TH',{maximumFractionDigits:0})}</b> · ส่งแล้ว ${fmt(done)} กก. (${orders.length} ราย)`
    : '';
  const list = document.getElementById('dorder-list');
  list.innerHTML = orders.length
    ? '<div class="card" style="padding:4px 14px;margin-top:8px">' + orders.map(o => `
        <div class="pe-row">
          <span class="pe-desc"><strong>${o.customer_name}</strong> <span class="pe-date">${o.vegetable_type ? (DORDER_VEG[o.vegetable_type]||o.vegetable_type) : ''}</span></span>
          <span class="pe-amt" style="color:var(--primary)">${fmt(parseFloat(o.kg))} กก.</span>
          <button class="status-pill ${o.delivered ? 'done-pill' : 'wait-pill'}" onclick="toggleDayOrder('${o.id}', ${!o.delivered})">${o.delivered ? '✅ ส่งแล้ว' : '⬜ ยังไม่ส่ง'}</button>
          <button class="pe-edit" onclick="editDayOrder('${o.id}')" aria-label="แก้ไข">✎</button>
          <button class="pe-del" onclick="deleteDayOrder('${o.id}')" aria-label="ลบ">×</button>
        </div>`).join('') + '</div>'
    : '<div class="text-sub" style="margin-top:8px">ยังไม่มีออเดอร์วันนี้ — เลือกลูกค้า/ผัก/กก. แล้วกดเพิ่ม</div>';
}

async function addDayOrder() {
  const date = document.getElementById('todo-date-picker').value;
  const name = document.getElementById('dorder-customer').value;
  const veg = document.getElementById('dorder-veg').value || null;
  const kg = parseFloat(document.getElementById('dorder-kg').value);
  if (!name) return showToast('ยังไม่มีลูกค้าให้เลือก', 'error');
  if (!kg || kg <= 0) return showToast('กรุณาระบุจำนวนกิโล', 'error');
  let error;
  if (editDayOrderId) {
    ({ error } = await db.from('orders').update({ customer_name: name, vegetable_type: veg, kg }).eq('id', editDayOrderId));
  } else {
    ({ error } = await db.from('orders').insert({ order_date: date, week_start: dorderWeekStart(date), customer_name: name, vegetable_type: veg, kg }));
  }
  if (error) return showToast('บันทึกไม่สำเร็จ: ' + (error.message || error), 'error');
  showToast(editDayOrderId ? 'แก้ไขออเดอร์แล้ว' : 'เพิ่มออเดอร์แล้ว');
  editDayOrderId = null;
  const btn = document.getElementById('dorder-add-btn'); if (btn) btn.textContent = 'เพิ่ม';
  document.getElementById('dorder-kg').value = '';
  loadDayOrders();
}

async function editDayOrder(id) {
  const { data: o } = await db.from('orders').select('*').eq('id', id).single();
  if (!o) return;
  editDayOrderId = id;
  document.getElementById('dorder-customer').value = o.customer_name;
  document.getElementById('dorder-veg').value = o.vegetable_type || '';
  document.getElementById('dorder-kg').value = o.kg;
  const btn = document.getElementById('dorder-add-btn'); if (btn) btn.textContent = 'อัปเดต';
}

async function toggleDayOrder(id, val) {
  await db.from('orders').update({ delivered: val }).eq('id', id);
  loadDayOrders();
}

async function deleteDayOrder(id) {
  if (!(await vfConfirm('ลบออเดอร์นี้?', { okLabel: 'ลบ' }))) return;
  await db.from('orders').delete().eq('id', id);
  showToast('ลบแล้ว'); loadDayOrders();
}

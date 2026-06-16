// js/todos.js — To-do list รายวัน

function initTodos() {
  document.getElementById('todo-date-picker').value = new Date().toISOString().split('T')[0];
  document.getElementById('todo-date-picker').addEventListener('change', loadTodos);
  document.getElementById('todo-add-form').addEventListener('submit', (e) => {
    e.preventDefault();
    addTodo();
  });
  loadTodos();
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

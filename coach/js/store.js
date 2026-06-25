// js/store.js — Data layer
// ทำงานได้ทันทีด้วย localStorage และสลับไปใช้ Supabase อัตโนมัติเมื่อใส่ค่าจริงด้านล่าง

// ========= ตั้งค่า Supabase =========
// ใส่ค่าจริงจาก Supabase Dashboard → Project Settings → API
// ถ้ายังเป็น placeholder แอปจะเก็บข้อมูลในเครื่อง (localStorage) ให้ใช้งานได้เลย
const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY_HERE';

const USING_SUPABASE =
  !SUPABASE_URL.includes('YOUR_PROJECT') && !SUPABASE_ANON_KEY.includes('YOUR_ANON_KEY');

let db = null;
if (USING_SUPABASE && window.supabase) {
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// ========= Store API (async, ใช้เหมือนกันทั้ง Supabase และ localStorage) =========
const Store = {
  mode: USING_SUPABASE ? 'supabase' : 'local',

  // ----- localStorage helpers -----
  _lsKey(table) { return `coach.${table}`; },
  _lsAll(table) {
    try { return JSON.parse(localStorage.getItem(this._lsKey(table))) || []; }
    catch { return []; }
  },
  _lsSave(table, rows) {
    localStorage.setItem(this._lsKey(table), JSON.stringify(rows));
  },

  // ----- อ่านทั้งตาราง (กรอง/เรียงได้) -----
  // opts: { eq:{col:val}, order:'col', asc:true }
  async select(table, opts = {}) {
    if (db) {
      let q = db.from(table).select('*');
      if (opts.eq) for (const [k, v] of Object.entries(opts.eq)) q = q.eq(k, v);
      if (opts.order) q = q.order(opts.order, { ascending: opts.asc !== false });
      const { data, error } = await q;
      if (error) { console.error(error); showToast('โหลดข้อมูลไม่สำเร็จ', 'error'); return []; }
      return data || [];
    }
    // local
    let rows = this._lsAll(table);
    if (opts.eq) {
      for (const [k, v] of Object.entries(opts.eq)) rows = rows.filter(r => r[k] === v);
    }
    if (opts.order) {
      rows = [...rows].sort((a, b) => {
        const av = a[opts.order], bv = b[opts.order];
        if (av === bv) return 0;
        const r = av > bv ? 1 : -1;
        return opts.asc === false ? -r : r;
      });
    }
    return rows;
  },

  async insert(table, obj) {
    if (db) {
      const { data, error } = await db.from(table).insert(obj).select().single();
      if (error) { console.error(error); showToast('บันทึกไม่สำเร็จ', 'error'); return null; }
      return data;
    }
    const rows = this._lsAll(table);
    const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...obj };
    rows.push(row);
    this._lsSave(table, rows);
    return row;
  },

  async update(table, id, patch) {
    if (db) {
      const { data, error } = await db.from(table).update(patch).eq('id', id).select().single();
      if (error) { console.error(error); showToast('แก้ไขไม่สำเร็จ', 'error'); return null; }
      return data;
    }
    const rows = this._lsAll(table);
    const i = rows.findIndex(r => r.id === id);
    if (i >= 0) { rows[i] = { ...rows[i], ...patch }; this._lsSave(table, rows); return rows[i]; }
    return null;
  },

  async remove(table, id) {
    if (db) {
      const { error } = await db.from(table).delete().eq('id', id);
      if (error) { console.error(error); showToast('ลบไม่สำเร็จ', 'error'); return false; }
      return true;
    }
    let rows = this._lsAll(table);
    rows = rows.filter(r => r.id !== id);
    this._lsSave(table, rows);
    return true;
  }
};

// ========= Helpers ทั่วไป =========
function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split('T')[0];
}

function formatDateTH(dateStr, opts = { day: 'numeric', month: 'short' }) {
  if (!dateStr) return '-';
  return new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('th-TH', opts);
}

function thaiMonth(monthStr) {
  // monthStr = 'YYYY-MM'
  const [y, m] = monthStr.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('th-TH', { year: 'numeric', month: 'long' });
}

function currentMonth() {
  return todayISO().slice(0, 7);
}

function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) { console.log(msg); return; }
  toast.textContent = msg;
  toast.className = `toast toast-${type} show`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove('show'), 2600);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// แปลงตัวเลขเป็นขีดนับแบบ |||| (กลุ่มละ 5)
function tallyMarks(n) {
  n = Math.max(0, n | 0);
  const groups = [];
  while (n > 0) { groups.push(Math.min(5, n)); n -= 5; }
  if (groups.length === 0) return '<span class="tally-empty">ยังไม่เริ่ม</span>';
  return groups.map(g => `<span class="tally-group" data-n="${g}"></span>`).join('');
}

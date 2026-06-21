// js/supabase.js — Local data layer (offline)
//
// เดิมไฟล์นี้เชื่อมต่อ Supabase ออนไลน์ แต่ในสภาพแวดล้อมที่ไม่มีเน็ต
// (หรือยังไม่ได้ตั้งค่า Supabase) เราใช้ data layer ในเครื่องที่เก็บข้อมูล
// ลง localStorage และเลียนแบบ query builder ของ supabase-js ให้โค้ดเดิม
// ใช้งานได้โดยไม่ต้องแก้ไฟล์อื่น  (.from().select()/.insert()/.update()/
// .delete()/.eq()/.gte()/.lte()/.order()/.limit()/.single()/.not() + storage)
//
// อยากต่อ Supabase จริง: ดู README — แทนที่บล็อก LOCAL DB ด้านล่างด้วย
//   const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
//  LOCAL DB (localStorage-backed mock of the Supabase client)
// ============================================================
const VF_PREFIX = 'vf_v1_';

const Store = {
  get(table) {
    try { return JSON.parse(localStorage.getItem(VF_PREFIX + table)) || []; }
    catch { return []; }
  },
  set(table, rows) {
    localStorage.setItem(VF_PREFIX + table, JSON.stringify(rows));
  }
};

function vfUuid() {
  return (crypto.randomUUID && crypto.randomUUID()) ||
    ('id-' + Date.now() + '-' + Math.random().toString(16).slice(2));
}

const OPS = {
  eq:  (a, b) => a == b,
  neq: (a, b) => a != b,
  gt:  (a, b) => a > b,
  gte: (a, b) => a >= b,
  lt:  (a, b) => a < b,
  lte: (a, b) => a <= b,
};

class Query {
  constructor(table) {
    this.table = table;
    this._op = 'select';
    this._payload = null;
    this._filters = [];
    this._order = null;
    this._limit = null;
    this._single = false;
    this._count = null;
    this._head = false;
  }
  select(_cols = '*', opts = {}) {
    if (opts.count) this._count = opts.count;
    if (opts.head) this._head = true;
    return this;
  }
  insert(payload) { this._op = 'insert'; this._payload = payload; return this; }
  update(payload) { this._op = 'update'; this._payload = payload; return this; }
  delete() { this._op = 'delete'; return this; }

  eq(c, v)  { this._filters.push(['eq', c, v]);  return this; }
  neq(c, v) { this._filters.push(['neq', c, v]); return this; }
  gt(c, v)  { this._filters.push(['gt', c, v]);  return this; }
  gte(c, v) { this._filters.push(['gte', c, v]); return this; }
  lt(c, v)  { this._filters.push(['lt', c, v]);  return this; }
  lte(c, v) { this._filters.push(['lte', c, v]); return this; }
  // .not('col','is',null)  -> keep rows where col is not null
  not(c, op, v) {
    if (op === 'is' && v === null) this._filters.push(['notnull', c, null]);
    return this;
  }
  is(c, v) {
    if (v === null) this._filters.push(['isnull', c, null]);
    return this;
  }
  order(c, opts = {}) { this._order = { col: c, asc: opts.ascending !== false }; return this; }
  limit(n) { this._limit = n; return this; }
  single() { this._single = true; return this; }
  maybeSingle() { this._single = true; return this; }

  _match(row) {
    return this._filters.every(([op, c, v]) => {
      if (op === 'notnull') return row[c] !== null && row[c] !== undefined;
      if (op === 'isnull')  return row[c] === null || row[c] === undefined;
      return OPS[op](row[c], v);
    });
  }

  _run() {
    const rows = Store.get(this.table);

    if (this._op === 'insert') {
      const now = new Date().toISOString();
      const items = (Array.isArray(this._payload) ? this._payload : [this._payload])
        .map(p => ({ id: vfUuid(), created_at: now, ...p }));
      Store.set(this.table, rows.concat(items));
      return { data: items, error: null };
    }

    if (this._op === 'update') {
      const now = new Date().toISOString();
      const updated = [];
      rows.forEach(r => {
        if (this._match(r)) { Object.assign(r, this._payload, { updated_at: now }); updated.push(r); }
      });
      Store.set(this.table, rows);
      return { data: updated, error: null };
    }

    if (this._op === 'delete') {
      const kept = rows.filter(r => !this._match(r));
      Store.set(this.table, kept);
      return { data: null, error: null };
    }

    // select
    let result = rows.filter(r => this._match(r));
    if (this._order) {
      const { col, asc } = this._order;
      result = result.slice().sort((a, b) => {
        const x = a[col], y = b[col];
        if (x === y) return 0;
        if (x === null || x === undefined) return 1;
        if (y === null || y === undefined) return -1;
        return (x > y ? 1 : -1) * (asc ? 1 : -1);
      });
    }
    if (this._limit != null) result = result.slice(0, this._limit);

    if (this._head && this._count) return { data: null, count: result.length, error: null };
    if (this._single) return { data: result[0] || null, error: null };
    return { data: result, count: this._count ? result.length : null, error: null };
  }

  // make the builder awaitable
  then(resolve) {
    try { resolve(this._run()); }
    catch (e) { resolve({ data: null, error: e }); }
  }
}

// Storage mock — keeps uploaded images as data URLs in localStorage
const StorageBucket = (bucket) => ({
  async upload(path, file) {
    const dataUrl = await new Promise((res) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result);
      reader.onerror = () => res('');
      reader.readAsDataURL(file);
    });
    const map = Store.get('_storage_' + bucket);
    const existing = map.find(m => m.path === path);
    if (existing) existing.url = dataUrl; else map.push({ path, url: dataUrl });
    Store.set('_storage_' + bucket, map);
    return { data: { path }, error: null };
  },
  getPublicUrl(path) {
    const map = Store.get('_storage_' + bucket);
    const hit = map.find(m => m.path === path);
    return { data: { publicUrl: hit ? hit.url : '' } };
  }
});

// Local (offline) client — the localStorage-backed mock above
const localDb = {
  from: (table) => new Query(table),
  storage: { from: (bucket) => StorageBucket(bucket) }
};

// ============================================================
//  Choose backend: Supabase cloud if configured, else local
//  Configure in js/config.js (window.VF_CONFIG). Falls back to
//  offline localStorage when no config or supabase-js isn't loaded.
// ============================================================
const VF_CFG = (typeof window !== 'undefined' && window.VF_CONFIG) || {};
const VF_USE_CLOUD = !!(VF_CFG.SUPABASE_URL && VF_CFG.SUPABASE_ANON_KEY &&
  typeof window !== 'undefined' && window.supabase && window.supabase.createClient);

const db = VF_USE_CLOUD
  ? window.supabase.createClient(VF_CFG.SUPABASE_URL, VF_CFG.SUPABASE_ANON_KEY)
  : localDb;

// Small badge so it's obvious which mode is live (helps debugging)
if (typeof console !== 'undefined') {
  console.info(`[VegFarm] data backend: ${VF_USE_CLOUD ? 'Supabase cloud ☁️' : 'local (offline) 💾'}`);
}

// ============================================================
//  Auth (เฉพาะโหมดคลาวด์) — โหมดออฟไลน์ข้ามล็อกอิน
// ============================================================
async function vfHasSession() {
  if (!VF_USE_CLOUD) return true;            // ออฟไลน์: ไม่ต้องล็อกอิน
  try { const { data } = await db.auth.getSession(); return !!(data && data.session); }
  catch (e) { return false; }
}

async function vfSignIn() {
  let email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  if (!email || !password) { errEl.textContent = 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน'; return; }
  // ล็อกอินด้วยชื่อ: ถ้าไม่ใช่อีเมล (ไม่มี @) เติมโดเมนให้อัตโนมัติ
  if (!email.includes('@')) email = email.toLowerCase() + '@vegfarm.local';
  const btn = document.getElementById('login-btn');
  btn.disabled = true; btn.textContent = 'กำลังเข้าสู่ระบบ...';
  const { error } = await db.auth.signInWithPassword({ email, password });
  btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ';
  if (error) { errEl.textContent = 'เข้าสู่ระบบไม่สำเร็จ — ตรวจชื่อผู้ใช้/รหัสผ่าน'; return; }
  document.getElementById('login-screen').style.display = 'none';
  if (typeof vfStartApp === 'function') vfStartApp();
}

async function vfSignOut() {
  try { if (VF_USE_CLOUD && db.auth) await db.auth.signOut(); } catch (e) {}
  location.reload();
}

// ============================================================
//  Backup / Restore — export & import all data as one JSON file
// ============================================================
const VF_TABLES = [
  'plots', 'seed_batches', 'plot_cycles', 'problems', 'todos',
  'calendar_activities', 'income', 'expenses', 'personal_expenses', 'customers', 'orders', '_storage_photos'
];

function exportAllData() {
  const dump = { _app: 'vegfarm', _version: 'v1', exported_at: new Date().toISOString(), data: {} };
  VF_TABLES.forEach(t => { dump.data[t] = Store.get(t); });
  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `vegfarm-backup-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
  showToast('สำรองข้อมูลเป็นไฟล์แล้ว');
}

async function importAllData(file) {
  if (!file) return;
  if (!(await vfConfirm('การกู้คืนจะเขียนทับข้อมูลปัจจุบันทั้งหมด ดำเนินการต่อหรือไม่?', { okLabel: 'กู้คืน', danger: false, icon: '⬆️' }))) return;
  try {
    const dump = JSON.parse(await file.text());
    if (!dump || dump._app !== 'vegfarm' || !dump.data) throw new Error('ไม่ใช่ไฟล์สำรองของ VegFarm');
    Object.entries(dump.data).forEach(([t, rows]) => Store.set(t, rows));
    localStorage.setItem(VF_PREFIX + 'seeded', '1');
    showToast('กู้คืนข้อมูลสำเร็จ — กำลังโหลดใหม่');
    setTimeout(() => location.reload(), 900);
  } catch (e) {
    showToast('กู้คืนไม่สำเร็จ: ' + e.message, 'error');
  }
}

// ============================================================
//  Helpers (เดิม) — declared before seeding because seed uses them
// ============================================================
function formatDateTH(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function getSurvivalRate(weather) {
  const rates = { hot: 70, rainy: 70, cold: 90 };
  return rates[weather] || 70;
}

function calcEstimatedKg(seedCount, weather, survivalRate) {
  const survived = Math.floor(seedCount * (survivalRate / 100));
  const kgPerPlant = (weather === 'cold') ? (1 / 10) : (1 / 12);
  return (survived * kgPerPlant).toFixed(2);
}

function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className = `toast toast-${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function setLoading(show) {
  const loader = document.getElementById('loader');
  if (loader) loader.style.display = show ? 'flex' : 'none';
}

// ============================================================
//  Styled confirm dialog (replaces native confirm)
// ============================================================
let _vfConfirmResolve = null;
function vfConfirm(message, { okLabel = 'ตกลง', danger = true, icon = '🗑️' } = {}) {
  return new Promise(resolve => {
    _vfConfirmResolve = resolve;
    const el = document.getElementById('vf-confirm');
    if (!el) { resolve(window.confirm(message)); return; }
    document.getElementById('vf-confirm-msg').textContent = message;
    document.getElementById('vf-confirm-icon').textContent = icon;
    const ok = document.getElementById('vf-confirm-ok');
    ok.textContent = okLabel;
    ok.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');
    el.style.display = 'flex';
  });
}
function vfConfirmResolve(val) {
  const el = document.getElementById('vf-confirm');
  if (el) el.style.display = 'none';
  if (_vfConfirmResolve) { _vfConfirmResolve(val); _vfConfirmResolve = null; }
}

// ============================================================
//  SEED DATA — runs once so the UI has content to display
// ============================================================
(function seedOnce() {
  if (VF_USE_CLOUD) return;                                  // never seed a real cloud DB
  if (localStorage.getItem(VF_PREFIX + 'seeded')) return;

  const today = new Date();
  const iso = (offsetDays) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().split('T')[0];
  };
  const VEG = ['green_oak', 'red_oak', 'finley', 'cos', 'butterhead'];

  // Plots T1–T15
  const plots = [];
  for (let i = 1; i <= 15; i++) {
    const code = 'T' + i;
    if (i <= 8) {
      const veg = VEG[i % VEG.length];
      const plantOffset = -(10 + i * 2);
      const harvested = i <= 3;
      plots.push({
        id: vfUuid(), plot_code: code, vegetable_type: veg,
        plant_date: iso(plantOffset), plant_age_days: -plantOffset,
        harvest_date: iso(plantOffset + 30),
        estimated_kg: +(8 + i * 1.5).toFixed(2),
        actual_kg: harvested ? +(7 + i * 1.3).toFixed(2) : null,
        is_harvested: harvested,
        harvest_notes: harvested ? 'เก็บเกี่ยวตามรอบ' : null,
        cycle_count: harvested ? 2 : 1,
        seed_batch_id: null, qr_code_url: null,
        created_at: new Date().toISOString()
      });
    } else {
      plots.push({
        id: vfUuid(), plot_code: code, vegetable_type: null,
        plant_date: null, plant_age_days: null, harvest_date: null,
        estimated_kg: null, actual_kg: null, is_harvested: false,
        harvest_notes: null, cycle_count: 1, seed_batch_id: null,
        qr_code_url: null, created_at: new Date().toISOString()
      });
    }
  }
  Store.set('plots', plots);

  // Seed batches (6 — for dashboard chart)
  const weathers = ['hot', 'rainy', 'cold', 'hot', 'cold', 'rainy'];
  const seed_batches = weathers.map((w, idx) => {
    const sd = iso(-(60 - idx * 9));
    const count = 400 + idx * 120;
    const survival = getSurvivalRate(w);
    return {
      id: vfUuid(), seed_date: sd,
      vegetable_types: [VEG[idx % VEG.length], VEG[(idx + 1) % VEG.length]],
      seed_count: count, weather_condition: w, survival_rate: survival,
      harvest_date: addDays(sd, 45),
      estimated_kg: +calcEstimatedKg(count, w, survival),
      notes: 'รอบเพาะปกติ', created_at: new Date(Date.now() - (6 - idx) * 86400000).toISOString()
    };
  });
  Store.set('seed_batches', seed_batches);

  // Problems
  Store.set('problems', [
    { id: vfUuid(), plot_code: 'T2', problem_date: iso(-3), problem_type: 'worm', severity: 'medium', description: 'พบหนอนกัดใบ', solution: 'ฉีดสมุนไพรไล่แมลง', photo_url: null, cycle_number: 1, resolved: false, created_at: new Date().toISOString() },
    { id: vfUuid(), plot_code: 'T5', problem_date: iso(-5), problem_type: 'fungus', severity: 'high', description: 'เชื้อราที่โคนต้น', solution: '', photo_url: null, cycle_number: 1, resolved: false, created_at: new Date().toISOString() },
    { id: vfUuid(), plot_code: 'T1', problem_date: iso(-12), problem_type: 'burned_leaf', severity: 'low', description: 'ใบไหม้จากแดด', solution: 'ขึงสแลน', photo_url: null, cycle_number: 1, resolved: true, created_at: new Date().toISOString() },
  ]);

  // Todos (today + a couple)
  Store.set('todos', [
    { id: vfUuid(), todo_date: iso(0), task: 'รดน้ำแปลง T1–T8', is_done: true, sort_order: 0, created_at: new Date().toISOString() },
    { id: vfUuid(), todo_date: iso(0), task: 'ตรวจหนอนแปลง T2', is_done: false, sort_order: 1, created_at: new Date().toISOString() },
    { id: vfUuid(), todo_date: iso(0), task: 'เตรียมแพ็คผักส่งลูกค้า', is_done: false, sort_order: 2, created_at: new Date().toISOString() },
  ]);

  // Income & Expenses (recent — for finance chart)
  const income = [];
  const expenses = [];
  const cats = ['seed', 'fertilizer', 'labor', 'utility', 'packaging', 'transport'];
  for (let k = 0; k < 8; k++) {
    const kg = 10 + k * 3;
    const price = 45 + (k % 3) * 5;
    income.push({
      id: vfUuid(), income_date: iso(-(k * 5 + 1)), plot_code: 'T' + ((k % 8) + 1),
      vegetable_type: VEG[k % VEG.length], kg_sold: kg, price_per_kg: price,
      total_amount: kg * price, buyer: ['ตลาดสด', 'ร้านสลัด', 'ส่งตรง'][k % 3],
      channel: ['market', 'delivery', 'direct', 'wholesale'][k % 4],
      notes: '', created_at: new Date().toISOString()
    });
    expenses.push({
      id: vfUuid(), expense_date: iso(-(k * 5 + 2)), category: cats[k % cats.length],
      amount: 200 + k * 80, description: 'ค่าใช้จ่ายฟาร์ม', notes: '',
      created_at: new Date().toISOString()
    });
  }
  Store.set('income', income);
  Store.set('expenses', expenses);

  // Customers
  Store.set('customers', [
    { id: vfUuid(), name: 'ร้านสลัดเฮลตี้', address: 'อ.เมือง', weekly_kg: 25, type: 'customer', tag: 'regular', notes: 'รับทุกวันจันทร์', created_at: new Date().toISOString() },
    { id: vfUuid(), name: 'ตลาดสดเทศบาล', address: 'ในเมือง', weekly_kg: 40, type: 'customer', tag: 'regular', notes: '', created_at: new Date().toISOString() },
    { id: vfUuid(), name: 'ฟาร์มเพื่อนบ้าน', address: 'ต.หนองหาร', weekly_kg: 15, type: 'farm', tag: 'general', notes: 'แลกเปลี่ยนผลผลิต', created_at: new Date().toISOString() },
    { id: vfUuid(), name: 'ลูกค้าใหม่ออนไลน์', address: 'กรุงเทพฯ', weekly_kg: 8, type: 'customer', tag: 'new', notes: 'สั่งผ่านเพจ', created_at: new Date().toISOString() },
  ]);

  // Calendar activities (a few)
  Store.set('calendar_activities', [
    { id: vfUuid(), activity_date: iso(-3), activity_type: 'problem', reference_id: null, plot_code: 'T2', summary: 'พบหนอนแปลง T2', created_at: new Date().toISOString() },
    { id: vfUuid(), activity_date: iso(0), activity_type: 'todo', reference_id: null, plot_code: null, summary: 'งานวันนี้ 3 รายการ', created_at: new Date().toISOString() },
    { id: vfUuid(), activity_date: iso(2), activity_type: 'harvesting', reference_id: null, plot_code: 'T4', summary: 'กำหนดเก็บเกี่ยว T4', created_at: new Date().toISOString() },
  ]);

  // Plot cycle history
  Store.set('plot_cycles', [
    { id: vfUuid(), plot_code: 'T1', cycle_number: 1, vegetable_type: 'green_oak', plant_date: iso(-45), harvest_date: iso(-15), actual_kg: 9.2, notes: 'รอบแรก', created_at: new Date().toISOString() },
  ]);

  localStorage.setItem(VF_PREFIX + 'seeded', '1');
})();

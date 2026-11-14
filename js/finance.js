// js/finance.js — ระบบรายรับ รายจ่าย กำไร (Updated)

let financeTab = 'income';

const LABOR_DAILY  = 350;   // ฿/วัน
const LABOR_DAYS   = 26;    // วัน/เดือน
const LABOR_FIXED  = LABOR_DAILY * LABOR_DAYS; // 9,100
const UTILITY_FIXED = 2000;  // ฿/เดือน
const FIXED_MONTHLY = LABOR_FIXED + UTILITY_FIXED;  // ค่าใช้จ่ายคงที่อัตโนมัติ/เดือน = 11,100
const INCOME_PRICE_PER_KG = 100;  // ราคาขายคงที่ ฿/กก.

function initFinance() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('finance-date-income').value  = today;
  document.getElementById('finance-date-expense').value = today;
  const pd = document.getElementById('personal-date'); if (pd) pd.value = today;
  document.getElementById('finance-kg').addEventListener('input', calcIncomeTotal);

  // ตัวเลือกเดือนสรุป — จำกัดไม่ให้เลือกเกินเดือนปัจจุบัน
  const mp = document.getElementById('fin-month-picker');
  if (mp) mp.max = today.slice(0,7);

  switchFinanceTab('income');
  loadFinanceSummary();
}

function switchFinanceTab(tab) {
  financeTab = tab;
  ['income','expense','personal','summary','report'].forEach(t => {
    document.getElementById(`ftab-${t}`)?.classList.toggle('active', t===tab);
    document.getElementById(`fpanel-${t}`)?.classList.toggle('hidden', t!==tab);
  });
  if (tab==='income')   loadIncomeList();
  if (tab==='expense')  loadExpenseList();
  if (tab==='personal') loadPersonalList();
  if (tab==='summary')  loadFinanceSummary();
  if (tab==='report')   openSalesReport();
}

function openSalesReport() {
  populateReportBuyers();
  if (!document.getElementById('rep-from')?.value) setReportRange('month');
  else runSalesReport();
}

function calcIncomeTotal() {
  const kg    = parseFloat(document.getElementById('finance-kg')?.value) || 0;
  const total = kg * INCOME_PRICE_PER_KG;
  const el = document.getElementById('finance-total-preview');
  if (el) el.textContent = total > 0 ? `฿${total.toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2})}` : '-';
}

// ===== SALES REPORT =====
let lastReportRows = [];
let lastReportMeta = {};

function setReportRange(preset) {
  const now = new Date(), yr = now.getFullYear(), mo = String(now.getMonth() + 1).padStart(2, '0');
  let from, to = now.toISOString().split('T')[0];
  if (preset === 'month') from = `${yr}-${mo}-01`;
  else if (preset === 'year') from = `${yr}-01-01`;
  else { from = '2000-01-01'; to = '2999-12-31'; }
  document.getElementById('rep-from').value = from === '2000-01-01' ? '' : from;
  document.getElementById('rep-to').value = to === '2999-12-31' ? '' : to;
  runSalesReport();
}

async function populateReportBuyers() {
  const sel = document.getElementById('rep-buyer');
  if (!sel) return;
  const { data } = await db.from('income').select('buyer');
  const buyers = [...new Set((data || []).map(r => r.buyer).filter(Boolean))].sort();
  const cur = sel.value;
  sel.innerHTML = '<option value="">ลูกค้าทั้งหมด</option>' + buyers.map(b => `<option value="${b}">${b}</option>`).join('');
  sel.value = cur;
}

async function runSalesReport() {
  const from = document.getElementById('rep-from').value || '2000-01-01';
  const to   = document.getElementById('rep-to').value || '2999-12-31';
  const buyer = document.getElementById('rep-buyer').value;

  let q = db.from('income').select('*').gte('income_date', from).lte('income_date', to).order('income_date', { ascending: false });
  if (buyer) q = q.eq('buyer', buyer);
  const { data } = await q;
  lastReportRows = data || [];
  lastReportMeta = { from, to, buyer };

  const total = lastReportRows.reduce((s, r) => s + parseFloat(r.total_amount || 0), 0);
  const kg = lastReportRows.reduce((s, r) => s + parseFloat(r.kg_sold || 0), 0);
  const fmt = n => `฿${n.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`;
  const el = document.getElementById('rep-result');
  const exp = document.getElementById('rep-export');

  if (!lastReportRows.length) {
    el.innerHTML = '<div class="empty-state" style="padding:14px">ไม่พบยอดขายในช่วงนี้</div>';
    if (exp) exp.style.display = 'none';
    return;
  }
  el.innerHTML = `
    <div class="savings-card" style="margin-top:12px;padding:14px 0">
      <div class="savings-row"><span>จำนวนรายการ</span><b>${lastReportRows.length}</b></div>
      <div class="savings-row"><span>น้ำหนักรวม</span><b>${kg.toLocaleString('th-TH',{maximumFractionDigits:1})} กก.</b></div>
      <div class="savings-divider"></div>
      <div class="savings-row savings-total"><span>ยอดขายรวม</span><span style="color:var(--primary)">${fmt(total)}</span></div>
    </div>
    <div class="card" style="padding:4px 14px;margin-top:8px">
      ${lastReportRows.slice(0, 100).map(r => `
        <div class="pe-row">
          <span class="pe-desc"><strong>${r.buyer || 'ขายผัก'}</strong> <span class="pe-date">${formatDateTH(r.income_date)} · ${r.kg_sold} kg</span></span>
          <span class="pe-amt" style="color:var(--primary)">${fmt(parseFloat(r.total_amount))}</span>
        </div>`).join('')}
    </div>`;
  if (exp) exp.style.display = 'flex';
}

function exportReportExcel() {
  if (!lastReportRows.length) return showToast('ไม่มีข้อมูล', 'error');
  const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const rows = lastReportRows.map(r =>
    `<tr><td>${r.income_date}</td><td>${esc(r.buyer)}</td><td>${r.kg_sold}</td><td>${r.price_per_kg}</td><td>${r.total_amount}</td></tr>`).join('');
  const total = lastReportRows.reduce((s, r) => s + parseFloat(r.total_amount || 0), 0);
  const kg = lastReportRows.reduce((s, r) => s + parseFloat(r.kg_sold || 0), 0);
  const html = `<html><head><meta charset="utf-8"></head><body><table border="1">
    <thead><tr><th>วันที่</th><th>ผู้ซื้อ</th><th>น้ำหนัก(กก.)</th><th>ราคา/กก.</th><th>ยอดรวม</th></tr></thead>
    <tbody>${rows}<tr><td colspan="2">รวม ${lastReportRows.length} รายการ</td><td>${kg}</td><td></td><td>${total}</td></tr></tbody>
    </table></body></html>`;
  const blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `รายงานยอดขาย_${lastReportMeta.from}_${lastReportMeta.to}.xls`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  showToast('ส่งออก Excel แล้ว');
}

function exportReportPDF() {
  if (!lastReportRows.length) return showToast('ไม่มีข้อมูล', 'error');
  const fmt = n => '฿' + parseFloat(n).toLocaleString('th-TH', { maximumFractionDigits: 0 });
  const total = lastReportRows.reduce((s, r) => s + parseFloat(r.total_amount || 0), 0);
  const kg = lastReportRows.reduce((s, r) => s + parseFloat(r.kg_sold || 0), 0);
  const rows = lastReportRows.map(r =>
    `<tr><td>${formatDateTH(r.income_date)}</td><td>${r.buyer || '-'}</td><td class="r">${r.kg_sold}</td><td class="r">${fmt(r.total_amount)}</td></tr>`).join('');
  const range = `${formatDateTH(lastReportMeta.from === '2000-01-01' ? lastReportRows[lastReportRows.length-1].income_date : lastReportMeta.from)} – ${formatDateTH(lastReportMeta.to === '2999-12-31' ? lastReportRows[0].income_date : lastReportMeta.to)}`;
  const win = window.open('', '_blank');
  if (!win) return showToast('เบราว์เซอร์บล็อกป๊อปอัป', 'error');
  win.document.write(`<html><head><meta charset="utf-8"><title>รายงานยอดขาย</title>
    <style>body{font-family:'Sarabun',sans-serif;padding:24px;color:#111}h2{margin:0 0 4px}.sub{color:#666;margin-bottom:16px;font-size:13px}
    table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:7px 9px;font-size:13px}th{background:#16A34A;color:#fff;text-align:left}
    .r{text-align:right}tfoot td{font-weight:bold;background:#f3f6f3}</style></head><body>
    <h2>รายงานยอดขาย — ImpromsukFarm (สวนอิ่มพร้อมสุข)</h2>
    <div class="sub">ช่วง ${range} · ${lastReportMeta.buyer || 'ลูกค้าทั้งหมด'}</div>
    <table><thead><tr><th>วันที่</th><th>ผู้ซื้อ</th><th class="r">น้ำหนัก</th><th class="r">ยอดรวม</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="2">รวม ${lastReportRows.length} รายการ</td><td class="r">${kg.toLocaleString('th-TH',{maximumFractionDigits:1})} กก.</td><td class="r">${fmt(total)}</td></tr></tfoot>
    </table>
    <script>setTimeout(function(){window.print();},400);<\/script></body></html>`);
  win.document.close();
}

// ===== INCOME =====
let editIncomeId = null;

async function saveIncome() {
  const date    = document.getElementById('finance-date-income').value;
  const kg      = parseFloat(document.getElementById('finance-kg').value);
  const price   = INCOME_PRICE_PER_KG;   // ราคาคงที่
  const buyer   = document.getElementById('finance-buyer').value.trim();
  const notes   = document.getElementById('finance-notes-income').value;

  if (!date)          return showToast('กรุณาระบุวันที่','error');
  if (!kg || kg<=0)   return showToast('กรุณาระบุน้ำหนัก','error');

  const total = parseFloat((kg*price).toFixed(2));
  const payload = { income_date:date, kg_sold:kg, price_per_kg:price, total_amount:total, buyer:buyer||null, notes:notes||null };
  setLoading(true);
  try {
    if (editIncomeId) {
      const { error } = await db.from('income').update(payload).eq('id', editIncomeId);
      if (error) throw error;
      if (buyer) await ensureCustomerFromBuyer(buyer);
      showToast('อัปเดตรายรับสำเร็จ');
      editIncomeId = null;
    } else {
      const addedCustomer = buyer ? await ensureCustomerFromBuyer(buyer) : false;
      const msg = addedCustomer ? `บันทึกรายรับ + เพิ่ม "${buyer}" เข้าลูกค้า` : 'บันทึกรายรับสำเร็จ';
      const { error } = await vfInsertUndoable('income', payload, msg, () => { loadIncomeList(); loadFinanceSummary(); });
      if (error) throw error;
    }
    resetIncomeForm();
    loadIncomeList(); loadFinanceSummary();
  } catch(e) { showToast('บันทึกไม่สำเร็จ: '+(e.message||e),'error'); console.error(e); }
  finally { setLoading(false); }
}

function resetIncomeForm() {
  editIncomeId = null;
  const btn = document.getElementById('income-save-btn'); if (btn) btn.textContent = 'บันทึกรายรับ';
  document.getElementById('finance-date-income').value = new Date().toISOString().split('T')[0];
  ['finance-kg','finance-buyer','finance-notes-income'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  document.getElementById('finance-total-preview').textContent='-';
}

async function editIncome(id) {
  const { data } = await db.from('income').select('*').eq('id', id).single();
  if (!data) return;
  editIncomeId = id;
  document.getElementById('finance-date-income').value = data.income_date;
  document.getElementById('finance-kg').value = data.kg_sold;
  document.getElementById('finance-buyer').value = data.buyer || '';
  document.getElementById('finance-notes-income').value = data.notes || '';
  calcIncomeTotal();
  const btn = document.getElementById('income-save-btn'); if (btn) btn.textContent = 'อัปเดตรายรับ';
  document.querySelector('#fpanel-income .card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadIncomeList() {
  const {data} = await db.from('income').select('*').order('income_date',{ascending:false}).limit(200);
  const el = document.getElementById('income-list');
  if (!data?.length) { el.innerHTML='<div class="empty-state">ยังไม่มีรายรับ</div>'; return; }
  el.innerHTML = '<div class="card" style="padding:4px 14px">' + data.map(r=>`
    <div class="pe-row">
      <span class="pe-desc"><strong>${r.buyer || 'ขายผัก'}</strong> <span class="pe-date">${formatDateTH(r.income_date)} · ${r.kg_sold} kg</span></span>
      <span class="pe-amt" style="color:var(--primary)">฿${parseFloat(r.total_amount).toLocaleString()}</span>
      <button class="pe-edit" onclick="editIncome('${r.id}')" aria-label="แก้ไข">✎</button>
      <button class="pe-del" onclick="deleteIncome('${r.id}')" aria-label="ลบ">×</button>
    </div>`).join('') + '</div>';
}

async function deleteIncome(id) {
  if (!(await vfConfirm('ลบรายรับนี้?', { okLabel: 'ลบ' }))) return;
  await db.from('income').delete().eq('id',id);
  showToast('ลบแล้ว'); loadIncomeList(); loadFinanceSummary();
}

// ===== EXPENSE =====
let editExpenseId = null;

async function saveExpense() {
  const date     = document.getElementById('finance-date-expense').value;
  const category = document.getElementById('expense-category').value;
  const amount   = parseFloat(document.getElementById('expense-amount').value);
  const desc     = document.getElementById('expense-desc').value;
  const notes    = document.getElementById('finance-notes-expense').value;

  if (!date)              return showToast('กรุณาระบุวันที่','error');
  if (!category)          return showToast('กรุณาเลือกหมวดหมู่','error');
  if (!amount||amount<=0) return showToast('กรุณาระบุจำนวนเงิน','error');

  const payload = { expense_date:date, category, amount, description:desc||null, notes:notes||null };
  setLoading(true);
  try {
    if (editExpenseId) {
      const { error } = await db.from('expenses').update(payload).eq('id', editExpenseId);
      if (error) throw error;
      showToast('อัปเดตรายจ่ายสำเร็จ'); editExpenseId = null;
    } else {
      const { error } = await vfInsertUndoable('expenses', payload, 'บันทึกรายจ่ายสำเร็จ', () => { loadExpenseList(); loadFinanceSummary(); });
      if (error) throw error;
    }
    resetExpenseForm(); loadExpenseList(); loadFinanceSummary();
  } catch(e) { showToast('บันทึกไม่สำเร็จ: '+(e.message||e),'error'); console.error(e); }
  finally { setLoading(false); }
}

function resetExpenseForm() {
  editExpenseId = null;
  const btn = document.getElementById('expense-save-btn'); if (btn) btn.textContent = 'บันทึกรายจ่าย';
  document.getElementById('finance-date-expense').value = new Date().toISOString().split('T')[0];
  ['expense-amount','expense-desc','finance-notes-expense'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  document.getElementById('expense-category').value='';
  document.getElementById('expense-amount-preview').textContent='';
}

async function editExpense(id) {
  const { data } = await db.from('expenses').select('*').eq('id', id).single();
  if (!data) return;
  editExpenseId = id;
  document.getElementById('finance-date-expense').value = data.expense_date;
  document.getElementById('expense-category').value = data.category;
  document.getElementById('expense-amount').value = data.amount;
  document.getElementById('expense-desc').value = data.description || '';
  document.getElementById('finance-notes-expense').value = data.notes || '';
  const btn = document.getElementById('expense-save-btn'); if (btn) btn.textContent = 'อัปเดตรายจ่าย';
  document.querySelector('#fpanel-expense .card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Auto-fill fixed amounts
function onExpenseCategoryChange() {
  const cat = document.getElementById('expense-category').value;
  const amtEl = document.getElementById('expense-amount');
  const previewEl = document.getElementById('expense-amount-preview');
  if (cat === 'labor') {
    amtEl.value = LABOR_FIXED;
    previewEl.textContent = `คำนวณจาก ฿${LABOR_DAILY}/วัน × ${LABOR_DAYS} วัน = ฿${LABOR_FIXED.toLocaleString()}`;
    previewEl.style.color = 'var(--primary)';
  } else if (cat === 'utility') {
    amtEl.value = UTILITY_FIXED;
    previewEl.textContent = `ค่าไฟคงที่ ฿${UTILITY_FIXED.toLocaleString()}/เดือน`;
    previewEl.style.color = 'var(--primary)';
  } else {
    amtEl.value = '';
    previewEl.textContent = '';
  }
}

// สรุปซื้อของเข้าเดือนนี้ แยกหมวด (เฉพาะของที่ซื้อจริง ไม่รวมค่าแรง/ค่าไฟ)
async function loadExpenseInputsSummary() {
  const el = document.getElementById('expense-inputs-summary');
  if (!el) return;
  const now = new Date(), yr = now.getFullYear(), mo = String(now.getMonth() + 1).padStart(2, '0');
  const monthStart = `${yr}-${mo}-01`;
  const nm = new Date(yr, now.getMonth() + 1, 1);
  const nextMonthStart = `${nm.getFullYear()}-${String(nm.getMonth() + 1).padStart(2, '0')}-01`;
  const { data } = await db.from('expenses').select('category,amount,expense_date')
    .gte('expense_date', monthStart).lt('expense_date', nextMonthStart);
  const catLbl = { seed: 'เมล็ดพันธุ์', fertilizer: 'ปุ๋ย/สารเคมี', equipment: 'อุปกรณ์/เครื่องมือ', packaging: 'บรรจุภัณฑ์', transport: 'ค่าขนส่ง', other: 'อื่นๆ' };
  const catIcon = { seed: '🌱', fertilizer: '🧪', equipment: '🔧', packaging: '📦', transport: '🚚', other: '📝' };
  const agg = {};
  (data || []).forEach(r => {
    if (r.category === 'labor' || r.category === 'utility') return;   // ไม่นับค่าคงที่
    agg[r.category] = (agg[r.category] || 0) + parseFloat(r.amount || 0);
  });
  const rows = Object.entries(agg).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((s, [, v]) => s + v, 0);
  const fmt = n => `฿${n.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`;
  if (!rows.length) { el.innerHTML = '<div class="text-sub" style="text-align:center;padding:12px">เดือนนี้ยังไม่มีการซื้อของเข้า</div>'; return; }
  el.innerHTML = `<div class="card savings-card">
    ${rows.map(([c, v]) => `<div class="savings-row"><span>${catIcon[c] || '📝'} ${catLbl[c] || c}</span><b style="color:var(--accent)">${fmt(v)}</b></div>`).join('')}
    <div class="savings-divider"></div>
    <div class="savings-row savings-total"><span>รวมซื้อของเข้า</span><b style="color:var(--accent)">${fmt(total)}</b></div>
  </div>`;
}

async function loadExpenseList() {
  loadExpenseInputsSummary();
  const {data} = await db.from('expenses').select('*').order('expense_date',{ascending:false}).limit(40);
  const el = document.getElementById('expense-list');
  if (!data?.length) { el.innerHTML='<div class="empty-state">ยังไม่มีรายจ่าย</div>'; return; }
  const catLbl={seed:'เมล็ดพันธุ์',fertilizer:'ปุ๋ย/สารเคมี',labor:'ค่าแรง',utility:'ค่าไฟ',equipment:'อุปกรณ์',packaging:'บรรจุภัณฑ์',transport:'ขนส่ง',other:'อื่นๆ'};
  el.innerHTML = '<div class="card" style="padding:4px 14px">' + data.map(r=>`
    <div class="pe-row">
      <span class="pe-cat" style="background:var(--accent-tint);color:var(--accent)">${catLbl[r.category]||r.category}</span>
      <span class="pe-desc">${r.description||'-'} <span class="pe-date">${formatDateTH(r.expense_date)}</span></span>
      <span class="pe-amt" style="color:var(--accent)">฿${parseFloat(r.amount).toLocaleString()}</span>
      <button class="pe-edit" onclick="editExpense('${r.id}')" aria-label="แก้ไข">✎</button>
      <button class="pe-del" onclick="deleteExpense('${r.id}')" aria-label="ลบ">×</button>
    </div>`).join('') + '</div>';
}

async function deleteExpense(id) {
  if (!(await vfConfirm('ลบรายจ่ายนี้?', { okLabel: 'ลบ' }))) return;
  await db.from('expenses').delete().eq('id',id);
  showToast('ลบแล้ว'); loadExpenseList(); loadFinanceSummary();
}

// ===== PERSONAL EXPENSES (แยกบัญชีจากฟาร์ม) =====
const PERSONAL_CAT = { food:'กิน/อาหาร', coffee:'กาแฟ', living:'ของใช้ในบ้าน', loan:'ผ่อน/หนี้', health:'สุขภาพ', transport:'เดินทาง', other:'อื่นๆ' };
let allPersonal = [];
let personalSearch = '';
let editPersonalId = null;

async function savePersonal() {
  const date     = document.getElementById('personal-date').value;
  const category = document.getElementById('personal-category').value;
  const amount   = parseFloat(document.getElementById('personal-amount').value);
  const desc     = document.getElementById('personal-desc').value;

  if (!date)              return showToast('กรุณาระบุวันที่','error');
  if (!category)          return showToast('กรุณาเลือกหมวดหมู่','error');
  if (!amount||amount<=0) return showToast('กรุณาระบุจำนวนเงิน','error');

  const payload = { expense_date:date, category, amount, description:desc||null };
  setLoading(true);
  try {
    if (editPersonalId) {
      const { error } = await db.from('personal_expenses').update(payload).eq('id', editPersonalId);
      if (error) throw error;
      showToast('อัปเดตรายจ่ายส่วนตัวสำเร็จ'); editPersonalId = null;
    } else {
      const { error } = await vfInsertUndoable('personal_expenses', payload, 'บันทึกรายจ่ายส่วนตัวสำเร็จ', () => { loadPersonalList(); loadFinanceSummary(); });
      if (error) throw error;
    }
    const btn = document.getElementById('personal-save-btn'); if (btn) btn.textContent = 'บันทึกรายจ่ายส่วนตัว';
    document.getElementById('personal-category').value = '';
    document.getElementById('personal-amount').value='';
    document.getElementById('personal-desc').value='';
    loadPersonalList(); loadFinanceSummary();
  } catch(e) { showToast('บันทึกไม่สำเร็จ: '+(e.message||e),'error'); console.error(e); }
  finally { setLoading(false); }
}

async function editPersonal(id) {
  const r = allPersonal.find(x => x.id === id);
  if (!r) return;
  editPersonalId = id;
  document.getElementById('personal-date').value = r.expense_date;
  document.getElementById('personal-category').value = r.category;
  document.getElementById('personal-amount').value = r.amount;
  document.getElementById('personal-desc').value = r.description || '';
  const btn = document.getElementById('personal-save-btn'); if (btn) btn.textContent = 'อัปเดตรายจ่ายส่วนตัว';
  document.querySelector('#fpanel-personal .card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadPersonalList() {
  const { data } = await db.from('personal_expenses').select('*').order('expense_date',{ascending:false}).limit(200);
  allPersonal = data || [];
  personalSearch = (document.getElementById('personal-search')?.value || '').trim().toLowerCase();
  renderPersonalList();
}

function renderPersonalList() {
  const el = document.getElementById('personal-list');
  if (!el) return;
  personalSearch = (document.getElementById('personal-search')?.value || '').trim().toLowerCase();

  const rows = allPersonal.filter(r => {
    if (!personalSearch) return true;
    const hay = `${PERSONAL_CAT[r.category] || r.category} ${r.description || ''}`.toLowerCase();
    return hay.includes(personalSearch);
  });

  // สรุปยอดตามที่ค้นหา
  const total = rows.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
  const totalEl = document.getElementById('personal-search-total');
  if (totalEl) totalEl.innerHTML = allPersonal.length
    ? `${personalSearch ? 'ผลค้นหา' : 'รวมทั้งหมด'}: <b style="color:var(--primary)">฿${total.toLocaleString('th-TH',{maximumFractionDigits:0})}</b> · ${rows.length} รายการ`
    : '';

  if (!allPersonal.length) { el.innerHTML = '<div class="empty-state">ยังไม่มีรายจ่ายส่วนตัว</div>'; return; }
  if (!rows.length) { el.innerHTML = '<div class="empty-state">ไม่พบรายการที่ค้นหา</div>'; return; }

  el.innerHTML = '<div class="card" style="padding:4px 14px">' + rows.map(r => `
    <div class="pe-row">
      <span class="pe-cat">${PERSONAL_CAT[r.category] || r.category}</span>
      <span class="pe-desc">${r.description || '-'} <span class="pe-date">${formatDateTH(r.expense_date)}</span></span>
      <span class="pe-amt">฿${parseFloat(r.amount).toLocaleString()}</span>
      <button class="pe-edit" onclick="editPersonal('${r.id}')" aria-label="แก้ไข">✎</button>
      <button class="pe-del" onclick="deletePersonal('${r.id}')" aria-label="ลบ">×</button>
    </div>`).join('') + '</div>';
}

async function deletePersonal(id) {
  if (!(await vfConfirm('ลบรายจ่ายส่วนตัวนี้?', { okLabel: 'ลบ' }))) return;
  await db.from('personal_expenses').delete().eq('id',id);
  showToast('ลบแล้ว'); loadPersonalList(); loadFinanceSummary();
}

// เลือกเดือนดูสรุปย้อนหลัง
function finThisMonth() {
  const picker = document.getElementById('fin-month-picker');
  if (picker) picker.value = '';
  loadFinanceSummary();
}

// ===== SUMMARY =====
async function loadFinanceSummary() {
  const now=new Date();
  // อ่านเดือนที่เลือกจากตัวเลือก (ว่าง = เดือนปัจจุบัน)
  const pick = document.getElementById('fin-month-picker')?.value;
  let yr, moIdx;
  if (pick && /^\d{4}-\d{2}$/.test(pick)) { yr = +pick.slice(0,4); moIdx = +pick.slice(5,7) - 1; }
  else { yr = now.getFullYear(); moIdx = now.getMonth(); }
  const mo = String(moIdx+1).padStart(2,'0');
  const selDate = new Date(yr, moIdx, 1);
  const isCurrentMonth = (yr === now.getFullYear() && moIdx === now.getMonth());

  const monthStart=`${yr}-${mo}-01`;
  const nm = new Date(yr, moIdx+1, 1);
  const nextMonthStart = `${nm.getFullYear()}-${String(nm.getMonth()+1).padStart(2,'0')}-01`;
  const yearStart=`${yr}-01-01`, yearEnd=`${yr}-12-31`;

  // อัปเดตป้ายเดือนที่กำลังดู
  const monthName = selDate.toLocaleDateString('th-TH',{month:'long',year:'numeric'});
  const mLabel = document.getElementById('sum-month-label');
  if (mLabel) mLabel.textContent = isCurrentMonth ? 'เดือนนี้' : monthName;
  const yLabel = document.getElementById('sum-year-label');
  const thYear = selDate.toLocaleDateString('th-TH',{year:'numeric'});
  if (yLabel) yLabel.textContent = (yr === now.getFullYear()) ? 'สะสมปีนี้' : `สะสมทั้งปี ${thYear}`;
  const bLabel = document.getElementById('sum-breakdown-label');
  if (bLabel) bLabel.textContent = `รายจ่ายแยกหมวด (${isCurrentMonth ? 'เดือนนี้' : monthName})`;

  const [incM,incY,expM,expY,allInc,allExp,persM] = await Promise.all([
    db.from('income').select('total_amount,kg_sold').gte('income_date',monthStart).lt('income_date',nextMonthStart),
    db.from('income').select('total_amount,kg_sold').gte('income_date',yearStart).lte('income_date',yearEnd),
    db.from('expenses').select('amount').gte('expense_date',monthStart).lt('expense_date',nextMonthStart),
    db.from('expenses').select('amount').gte('expense_date',yearStart).lte('expense_date',yearEnd),
    db.from('income').select('income_date,total_amount').order('income_date',{ascending:true}).limit(12),
    db.from('expenses').select('expense_date,amount,category').order('expense_date',{ascending:true}).limit(60),
    db.from('personal_expenses').select('amount').gte('expense_date',monthStart).lt('expense_date',nextMonthStart),
  ]);

  const si = arr=>arr.data?.reduce((s,r)=>s+parseFloat(r.total_amount||0),0)||0;
  const se = arr=>arr.data?.reduce((s,r)=>s+parseFloat(r.amount||0),0)||0;
  const fmt=n=>`฿${n.toLocaleString('th-TH',{minimumFractionDigits:0,maximumFractionDigits:0})}`;

  // ค่าใช้จ่ายคงที่อัตโนมัติทุกเดือน (ไม่ต้องกรอกเอง) — FIXED_MONTHLY = 11,100
  // จำนวนเดือนสำหรับสรุปทั้งปี: ปีปัจจุบัน = ถึงเดือนนี้, ปีที่ผ่านมา = 12, ปีอนาคต = ถึงเดือนที่เลือก
  const monthsElapsed = (yr < now.getFullYear()) ? 12
                      : (yr > now.getFullYear()) ? (moIdx + 1)
                      : (now.getMonth() + 1);

  const im=si(incM), iy=si(incY);
  const expVar = se(expM);                              // ต้นทุนซื้อของเข้า (ผันแปร) — ไม่รวมค่าคงที่
  const em=expVar+FIXED_MONTHLY;                        // เดือนนี้ + ค่าคงที่ 1 เดือน
  const ey=se(expY)+FIXED_MONTHLY*monthsElapsed;        // สะสมปี + ค่าคงที่ตามจำนวนเดือน

  // Net-profit hero (this month)
  const hero=document.getElementById('fin-hero');
  if (hero) {
    const profit=im-em;
    hero.classList.toggle('negative', profit<0);
    document.getElementById('hero-month-label').textContent = monthName;
    document.getElementById('hero-profit').textContent = (profit<0?'-':'')+fmt(Math.abs(profit));
    document.getElementById('hero-inc').textContent = fmt(im);
    document.getElementById('hero-exp').textContent = fmt(em);
  }

  document.getElementById('sum-inc-month').textContent   = fmt(im);
  document.getElementById('sum-exp-month').textContent   = fmt(em);
  document.getElementById('sum-profit-month').textContent= fmt(im-em);
  document.getElementById('sum-margin-month').textContent= im>0?((im-em)/im*100).toFixed(0)+'%':'–';
  document.getElementById('sum-profit-month').style.color= (im-em)>=0?'var(--primary)':'var(--danger)';
  document.getElementById('sum-inc-year').textContent    = fmt(iy);
  document.getElementById('sum-exp-year').textContent    = fmt(ey);
  document.getElementById('sum-profit-year').textContent = fmt(iy-ey);
  document.getElementById('sum-profit-year').style.color = (iy-ey)>=0?'var(--primary)':'var(--danger)';

  // ต้นทุนต่อกิโล + จุดคุ้มทุน
  const sk = arr=>arr.data?.reduce((s,r)=>s+parseFloat(r.kg_sold||0),0)||0;
  renderUnitCost({ im, kg: sk(incM), expVar, em, isCurrentMonth, yr, moIdx, iy, kgY: sk(incY), ey });

  // รายจ่ายแยกประเภท: ต้นทุนซื้อของเข้า (ผันแปร) vs ค่าคงที่ · ส่วนตัวแยกบัญชี
  const personalM = se(persM);
  const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setTxt('sum-exp-var', fmt(expVar));
  setTxt('sum-exp-fixed', fmt(FIXED_MONTHLY));
  setTxt('sum-exp-farm', fmt(em));
  setTxt('sum-exp-personal', fmt(personalM));

  // เงินเหลือเก็บ = กำไรฟาร์ม − รายจ่ายส่วนตัว (ฟาร์มไม่เพี้ยน)
  const farmProfit = im - em;
  const savings = farmProfit - personalM;
  const elFp = document.getElementById('sum-farm-profit');
  if (elFp) {
    elFp.textContent = fmt(farmProfit);
    elFp.className = farmProfit>=0 ? 'sv-pos' : 'sv-neg';
    document.getElementById('sum-personal-month').textContent = '−'+fmt(personalM);
    const elSv = document.getElementById('sum-savings-month');
    elSv.textContent = (savings<0?'-':'')+fmt(Math.abs(savings));
    elSv.style.color = savings>=0 ? 'var(--primary)' : 'var(--danger)';
  }

  // Expense breakdown — รวมค่าแรง/ค่าไฟคงที่อัตโนมัติ
  const catTotals={};
  expM.data?.forEach(r=>{catTotals[r.category]=(catTotals[r.category]||0)+parseFloat(r.amount||0);});
  catTotals['labor']   = (catTotals['labor']||0)   + LABOR_FIXED;
  catTotals['utility'] = (catTotals['utility']||0) + UTILITY_FIXED;
  const catLbl={seed:'เมล็ดพันธุ์',fertilizer:'ปุ๋ย',labor:'ค่าแรง',utility:'ค่าไฟ',equipment:'อุปกรณ์',packaging:'บรรจุภัณฑ์',transport:'ขนส่ง',other:'อื่นๆ'};
  const catRows=Object.entries(catTotals).sort((a,b)=>b[1]-a[1]).map(([cat,amt])=>{
    const pct=em>0?((amt/em)*100).toFixed(0):0;
    const fixedNote=(cat==='labor')?' <span class="text-sub">(฿350×26 อัตโนมัติ)</span>':(cat==='utility')?' <span class="text-sub">(คงที่/เดือน)</span>':'';
    return `<div class="cat-row">
      <span class="cat-name">${catLbl[cat]||cat}${fixedNote}</span>
      <div class="cat-bar-wrap"><div class="cat-bar" style="width:${pct}%"></div></div>
      <span class="cat-amt">${fmt(amt)}</span>
    </div>`;
  }).join('');
  const catHtml = catRows + '<div class="text-sub" style="margin-top:10px">* ค่าแรง ฿9,100 + ค่าไฟ ฿2,000 ถูกรวมให้อัตโนมัติทุกเดือน</div>';
  document.getElementById('expense-breakdown').innerHTML=catHtml||'<div class="empty-state" style="padding:16px">ยังไม่มีรายจ่าย</div>';

  renderFinanceChart(allInc.data||[],allExp.data||[]);
}

function renderFinanceChart(incRows,expRows) {
  const container=document.getElementById('financeChart');
  if (!container) return;
  const months={};
  const now=new Date();
  for(let i=5;i>=0;i--){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    months[key]={label:d.toLocaleDateString('th-TH',{month:'short',year:'2-digit'}),inc:0,exp:0};
  }
  incRows.forEach(r=>{const k=r.income_date?.slice(0,7);if(months[k])months[k].inc+=parseFloat(r.total_amount||0);});
  expRows.forEach(r=>{const k=r.expense_date?.slice(0,7);if(months[k])months[k].exp+=parseFloat(r.amount||0);});
  Object.values(months).forEach(m=>m.exp+=FIXED_MONTHLY);  // ค่าคงที่อัตโนมัติทุกเดือน
  const mArr=Object.values(months);
  // สไตล์ใหม่: แท่งแคปซูลคู่ (รายรับฟ้า · รายจ่ายม่วงอ่อน) + เส้นกำไรโค้งนุ่ม + เส้นกริดจาง
  const W=600,H=270,padL=44,padR=14,padT=26,padB=40;
  const chartW=W-padL-padR,chartH=H-padT-padB;
  const profits=mArr.map(m=>m.inc-m.exp);
  // แกนตัวเลขกลม ๆ (1/2/5 × 10^n) อ่านง่าย
  const rawMax=Math.max(...mArr.map(m=>Math.max(m.inc,m.exp)),1000), rawMin=Math.min(0,...profits);
  const niceStep=v=>{ const p=Math.pow(10,Math.floor(Math.log10(v))), f=v/p; return (f<=1?1:f<=2?2:f<=5?5:10)*p; };
  const step=niceStep((rawMax-rawMin)/3);
  const maxVal=Math.ceil(rawMax/step)*step, minVal=Math.floor(rawMin/step)*step;
  const span=maxVal-minVal, ticks=Math.round(span/step);
  const n=mArr.length,slot=chartW/n,bW=Math.min(18,slot*0.24);
  const yFor=v=>padT+chartH-((v-minVal)/span)*chartH;
  const xFor=i=>padL+slot*i+slot/2;
  const zeroY=yFor(0);
  let grid='',bars='',labels='';
  for(let g=0;g<=ticks;g++){
    const val=maxVal-step*g, y=yFor(val);
    grid+=`<line x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}" style="stroke:var(--line)" stroke-width="1" stroke-dasharray="3 5"/>`;
    grid+=`<text x="${padL-8}" y="${y+4}" text-anchor="end" font-size="11" font-weight="600" style="fill:var(--ink-faint)">${vfShortNum(val)}</text>`;
  }
  if(minVal<0) grid+=`<line x1="${padL}" y1="${zeroY}" x2="${W-padR}" y2="${zeroY}" style="stroke:var(--ink-faint)" stroke-width="1"/>`;
  const pill=(x,v,style)=>{ const y=yFor(v), h=Math.max(bW, zeroY-y); return `<rect x="${x}" y="${zeroY-h}" width="${bW}" height="${h}" rx="${bW/2}" style="${style}"/>`; };
  mArr.forEach((m,i)=>{
    const x=xFor(i);
    if(m.inc>0) bars+=pill(x-bW-3,m.inc,'fill:var(--blue)');
    if(m.exp>0) bars+=pill(x+3,m.exp,'fill:var(--accent)');
    labels+=`<text x="${x}" y="${H-12}" text-anchor="middle" font-size="12" font-weight="600" style="fill:var(--ink-soft)">${m.label}</text>`;
  });
  const pts=mArr.map((m,i)=>[+xFor(i).toFixed(1),+yFor(m.inc-m.exp).toFixed(1)]);
  const line=vfSmoothPath(pts);
  const dots=pts.map((p,i)=>`<circle cx="${p[0]}" cy="${p[1]}" r="4" style="fill:var(--paper);stroke:${profits[i]>=0?'#22A06B':'var(--danger)'}" stroke-width="2.5"/>`).join('');
  container.innerHTML=`
    <svg class="vf-chart" viewBox="0 0 ${W} ${H}">${grid}${bars}
      <path d="${line}" fill="none" style="stroke:var(--ink)" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="1 0" opacity=".75"/>
      ${dots}${labels}
    </svg>
    <div class="vf-legend">
      <span><i style="background:var(--blue)"></i>รายรับ</span>
      <span><i style="background:var(--accent)"></i>รายจ่าย</span>
      <span><i style="background:var(--ink);opacity:.75"></i>กำไรสุทธิ</span>
    </div>`;
}


// ===== ต้นทุนต่อกิโล & จุดคุ้มทุน =====
// เดือนปัจจุบัน: คิดค่าคงที่ตามวันที่ผ่านไปแล้ว (ไม่งั้นต้นเดือนต้นทุน/กก. จะสูงเกินจริง)
function renderUnitCost({ im, kg, expVar, em, isCurrentMonth, yr, moIdx, iy, kgY, ey }) {
  const el = document.getElementById('sum-unit-cost');
  if (!el) return;
  const baht = n => '฿' + n.toLocaleString('th-TH', { maximumFractionDigits: 0 });
  const bahtKg = n => '฿' + n.toLocaleString('th-TH', { maximumFractionDigits: n < 100 ? 1 : 0 });
  const kgF = n => n.toLocaleString('th-TH', { maximumFractionDigits: 1 });
  const now = new Date();
  const daysInMonth = new Date(yr, moIdx + 1, 0).getDate();
  const daysPassed = isCurrentMonth ? now.getDate() : daysInMonth;
  const fixedSoFar = FIXED_MONTHLY * daysPassed / daysInMonth;
  const costSoFar = expVar + fixedSoFar;
  const price = kg > 0 ? im / kg : INCOME_PRICE_PER_KG;              // ราคาขายเฉลี่ยจริง
  const needKg = price > 0 ? em / price : 0;                         // ต้องขายกี่ กก. ให้พอรายจ่ายทั้งเดือน
  const fixedKg = price > 0 ? FIXED_MONTHLY / price : 0;
  const pct = needKg > 0 ? Math.min(100, kg / needKg * 100) : 0;

  let unit = '';
  if (kg > 0) {
    const cpk = costSoFar / kg, ppk = price - cpk;
    unit = `
      <div class="uc-grid">
        <div class="uc-box"><span>ต้นทุน/กก.</span><b>${bahtKg(cpk)}</b></div>
        <div class="uc-box"><span>ขายได้/กก.</span><b>${bahtKg(price)}</b></div>
        <div class="uc-box ${ppk >= 0 ? 'pos' : 'neg'}"><span>${ppk >= 0 ? 'กำไร/กก.' : 'ขาดทุน/กก.'}</span><b>${bahtKg(Math.abs(ppk))}</b></div>
      </div>
      <div class="uc-sub">ขายแล้ว ${kgF(kg)} กก. · ต้นทุน ${baht(costSoFar)} = ซื้อของเข้า ${baht(expVar)} + ค่าคงที่ ${baht(fixedSoFar)}${isCurrentMonth ? ` (คิด ${daysPassed}/${daysInMonth} วัน)` : ''}</div>`;
  } else {
    unit = `<div class="uc-sub" style="margin-bottom:8px">ยังไม่มียอดขายที่ระบุกิโลในเดือนนี้ — คิดจุดคุ้มทุนจากราคา ${bahtKg(price)}/กก.</div>`;
  }

  let pace = '';
  if (isCurrentMonth && kg > 0 && daysPassed < daysInMonth) {
    const proj = kg / daysPassed * daysInMonth;
    pace = proj >= needKg
      ? `<div class="uc-pace ok">📈 ถ้าขายเท่านี้ทั้งเดือน ~${kgF(proj)} กก. → ผ่านจุดคุ้มทุน</div>`
      : `<div class="uc-pace bad">📉 ถ้าขายเท่านี้ทั้งเดือน ~${kgF(proj)} กก. → ยังขาดอีก ~${kgF(needKg - proj)} กก. (≈${kgF((needKg - proj) / Math.max(1, (daysInMonth - daysPassed) / 7))} กก./สัปดาห์ที่เหลือ)</div>`;
  }

  const yearLine = kgY > 0 ? `<div class="uc-year">ทั้งปี ${yr + 543}: ต้นทุนเฉลี่ย <b>${bahtKg(ey / kgY)}/กก.</b> · ขายเฉลี่ย <b>${bahtKg(iy / kgY)}/กก.</b> (${kgF(kgY)} กก.)</div>` : '';

  el.innerHTML = `
    ${unit}
    <div class="uc-be-head"><span>🎯 จุดคุ้มทุนเดือนนี้</span><b>${kgF(needKg)} กก.</b></div>
    <div class="goal-bar"><div class="goal-bar-fill ${kg >= needKg ? 'done' : ''}" style="width:${pct}%"></div></div>
    <div class="uc-be-status">${kg >= needKg
      ? `ขายแล้ว ${kgF(kg)} กก. · <b style="color:var(--primary)">ผ่านจุดคุ้มทุนแล้ว 🎉 เกินมา ${kgF(kg - needKg)} กก.</b>`
      : `ขายแล้ว ${kgF(kg)} / ${kgF(needKg)} กก. · <b style="color:var(--accent)">ต้องขายอีก ${kgF(needKg - kg)} กก.</b>`}</div>
    ${pace}
    <div class="uc-note">ค่าแรง+ค่าไฟ ${baht(FIXED_MONTHLY)}/เดือน ต้องขายอย่างน้อย <b>${kgF(fixedKg)} กก./เดือน</b> (≈${kgF(fixedKg / 4.33)} กก./สัปดาห์) ถึงจะพอ</div>
    ${yearLine}`;
}

// ===== EXPORT =====
async function exportCSV(type) {
  let data,headers,rows,filename;
  if (type==='income') {
    const r=await db.from('income').select('*').order('income_date',{ascending:false});
    data=r.data; filename='vegfarm_income.csv';
    if(!data?.length) return showToast('ไม่มีข้อมูล','error');
    headers=['วันที่','ผู้ซื้อ','น้ำหนัก(kg)','ราคา/kg','ยอดรวม','หมายเหตุ'];
    rows=data.map(r=>[r.income_date,r.buyer||'',r.kg_sold,r.price_per_kg,r.total_amount,r.notes||'']);
  } else {
    const r=await db.from('expenses').select('*').order('expense_date',{ascending:false});
    data=r.data; filename='vegfarm_expenses.csv';
    if(!data?.length) return showToast('ไม่มีข้อมูล','error');
    const catLbl={seed:'เมล็ดพันธุ์',fertilizer:'ปุ๋ย',labor:'ค่าแรง',utility:'ค่าไฟ',equipment:'อุปกรณ์',packaging:'บรรจุภัณฑ์',transport:'ขนส่ง',other:'อื่นๆ'};
    headers=['วันที่','หมวดหมู่','รายละเอียด','จำนวนเงิน','หมายเหตุ'];
    rows=data.map(r=>[r.expense_date,catLbl[r.category]||r.category,r.description||'',r.amount,r.notes||'']);
  }
  const bom='\uFEFF';
  const csv=bom+[headers,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=filename; a.click();
  URL.revokeObjectURL(url);
  showToast('ดาวน์โหลด CSV แล้ว');
}

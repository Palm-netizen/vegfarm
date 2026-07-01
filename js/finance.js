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
    <h2>รายงานยอดขาย — VegFarm</h2>
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
      const { error } = await db.from('income').insert(payload);
      if (error) throw error;
      const addedCustomer = buyer ? await ensureCustomerFromBuyer(buyer) : false;
      showToast(addedCustomer ? `บันทึกรายรับ + เพิ่ม "${buyer}" เข้ารายชื่อลูกค้า` : 'บันทึกรายรับสำเร็จ');
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
      const { error } = await db.from('expenses').insert(payload);
      if (error) throw error;
      showToast('บันทึกรายจ่ายสำเร็จ');
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

async function loadExpenseList() {
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
      const { error } = await db.from('personal_expenses').insert(payload);
      if (error) throw error;
      showToast('บันทึกรายจ่ายส่วนตัวสำเร็จ');
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
    ? `${personalSearch ? 'ผลค้นหา' : 'รวมทั้งหมด'}: <b style="color:#8B5CF6">฿${total.toLocaleString('th-TH',{maximumFractionDigits:0})}</b> · ${rows.length} รายการ`
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
    db.from('income').select('total_amount').gte('income_date',monthStart).lt('income_date',nextMonthStart),
    db.from('income').select('total_amount').gte('income_date',yearStart).lte('income_date',yearEnd),
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
  const em=se(expM)+FIXED_MONTHLY;                      // เดือนนี้ + ค่าคงที่ 1 เดือน
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

  // เงินเหลือเก็บ = กำไรฟาร์ม − รายจ่ายส่วนตัว (ฟาร์มไม่เพี้ยน)
  const farmProfit = im - em;
  const personalM = se(persM);
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
  const maxVal=Math.max(...mArr.map(m=>Math.max(m.inc,m.exp)),1000)*1.2;
  const W=600,H=260,padL=60,padR=20,padT=20,padB=48;
  const chartW=W-padL-padR,chartH=H-padT-padB;
  const n=mArr.length,slot=chartW/n,bW=Math.min(28,slot*0.3);
  const yFor=v=>padT+chartH-(v/maxVal)*chartH;
  const xFor=i=>padL+slot*i+slot/2;
  let grid='',bars='',labels='';
  for(let g=0;g<=4;g++){
    const y=padT+(chartH/4)*g,val=Math.round(maxVal*(1-g/4));
    grid+=`<line x1="${padL}" y1="${y}" x2="${padL+chartW}" y2="${y}" stroke="#E5ECE8" stroke-width="1"/>`;
    grid+=`<text x="${padL-6}" y="${y+4}" text-anchor="end" font-size="10" fill="#A3B0AB">${val>=1000?(val/1000).toFixed(0)+'K':val}</text>`;
  }
  mArr.forEach((m,i)=>{
    const x=xFor(i),yi=yFor(m.inc),hi=padT+chartH-yi,ye=yFor(m.exp),he=padT+chartH-ye;
    bars+=`<rect x="${x-bW-2}" y="${yi}" width="${bW}" height="${hi}" rx="5" fill="#16A34A" opacity="0.85"/>`;
    bars+=`<rect x="${x+2}" y="${ye}" width="${bW}" height="${he}" rx="5" fill="#F59E0B" opacity="0.85"/>`;
    if(m.inc>0)bars+=`<text x="${x-bW/2-2}" y="${yi-5}" text-anchor="middle" font-size="9" fill="#16A34A" font-weight="700">${m.inc>=1000?(m.inc/1000).toFixed(1)+'K':m.inc}</text>`;
    if(m.exp>0)bars+=`<text x="${x+bW/2+2}" y="${ye-5}" text-anchor="middle" font-size="9" fill="#F59E0B" font-weight="700">${m.exp>=1000?(m.exp/1000).toFixed(1)+'K':m.exp}</text>`;
    labels+=`<text x="${x}" y="${H-padB+18}" text-anchor="middle" font-size="10" fill="#6B7A75">${m.label}</text>`;
  });
  const pts=mArr.map((m,i)=>`${xFor(i)},${yFor(m.inc-m.exp)}`).join(' ');
  container.innerHTML=`
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">${grid}${bars}
      <polyline points="${pts}" fill="none" stroke="#8B5CF6" stroke-width="2" stroke-dasharray="4,3"/>
      ${mArr.map((m,i)=>`<circle cx="${xFor(i)}" cy="${yFor(m.inc-m.exp)}" r="3.5" fill="#8B5CF6"/>`).join('')}
      ${labels}
    </svg>
    <div style="display:flex;gap:16px;justify-content:center;margin-top:8px;font-size:12px;color:var(--ink-soft);font-weight:600;flex-wrap:wrap">
      <span><span style="display:inline-block;width:10px;height:10px;background:#16A34A;border-radius:2px;margin-right:4px"></span>รายรับ</span>
      <span><span style="display:inline-block;width:10px;height:10px;background:#F59E0B;border-radius:2px;margin-right:4px"></span>รายจ่าย</span>
      <span><span style="display:inline-block;width:10px;height:10px;background:#8B5CF6;border-radius:50%;margin-right:4px"></span>กำไรสุทธิ</span>
    </div>`;
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

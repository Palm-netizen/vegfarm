// js/finance.js — ระบบรายรับ รายจ่าย กำไร (Updated)

let financeTab = 'income';

const LABOR_DAILY  = 350;   // ฿/วัน
const LABOR_DAYS   = 26;    // วัน/เดือน
const LABOR_FIXED  = LABOR_DAILY * LABOR_DAYS; // 9,100
const UTILITY_FIXED = 2000;  // ฿/เดือน

function initFinance() {
  document.getElementById('finance-date-income').value  = new Date().toISOString().split('T')[0];
  document.getElementById('finance-date-expense').value = new Date().toISOString().split('T')[0];
  document.getElementById('finance-kg').addEventListener('input', calcIncomeTotal);
  document.getElementById('finance-price-per-kg').addEventListener('input', calcIncomeTotal);

  // Populate "จากแปลง" T1–T15
  const plotSel = document.getElementById('finance-plot');
  if (plotSel) plotSel.innerHTML = '<option value="">ไม่ระบุ</option>' +
    Array.from({ length: 15 }, (_, i) => `<option value="T${i + 1}">T${i + 1}</option>`).join('');

  switchFinanceTab('income');
  loadFinanceSummary();
}

// When a plot is chosen for an income entry, auto-fill its current crop
async function autoFillIncomeVeg() {
  const code = document.getElementById('finance-plot').value;
  if (!code) return;
  const { data: plot } = await db.from('plots').select('vegetable_type').eq('plot_code', code).single();
  if (plot?.vegetable_type) document.getElementById('finance-veg').value = plot.vegetable_type;
}

function switchFinanceTab(tab) {
  financeTab = tab;
  ['income','expense','summary'].forEach(t => {
    document.getElementById(`ftab-${t}`)?.classList.toggle('active', t===tab);
    document.getElementById(`fpanel-${t}`)?.classList.toggle('hidden', t!==tab);
  });
  if (tab==='income')  loadIncomeList();
  if (tab==='expense') loadExpenseList();
  if (tab==='summary') loadFinanceSummary();
}

function calcIncomeTotal() {
  const kg    = parseFloat(document.getElementById('finance-kg')?.value) || 0;
  const price = parseFloat(document.getElementById('finance-price-per-kg')?.value) || 0;
  const total = kg * price;
  const el = document.getElementById('finance-total-preview');
  if (el) el.textContent = total > 0 ? `฿${total.toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2})}` : '-';
}

// ===== INCOME =====
async function saveIncome() {
  const date    = document.getElementById('finance-date-income').value;
  const kg      = parseFloat(document.getElementById('finance-kg').value);
  const price   = parseFloat(document.getElementById('finance-price-per-kg').value);
  const channel = document.getElementById('finance-channel').value;
  const buyer   = document.getElementById('finance-buyer').value.trim();
  const notes   = document.getElementById('finance-notes-income').value;
  const plotCode = document.getElementById('finance-plot').value || null;
  const vegType  = document.getElementById('finance-veg').value || null;

  if (!date)          return showToast('กรุณาระบุวันที่','error');
  if (!kg || kg<=0)   return showToast('กรุณาระบุน้ำหนัก','error');
  if (!price||price<=0) return showToast('กรุณาระบุราคา/kg','error');
  if (!channel)       return showToast('กรุณาเลือกช่องทางการขาย','error');

  const total = parseFloat((kg*price).toFixed(2));
  setLoading(true);
  try {
    const { error } = await db.from('income').insert({
      income_date:date, kg_sold:kg, price_per_kg:price, total_amount:total,
      plot_code:plotCode, vegetable_type:vegType,
      channel, buyer:buyer||null, notes:notes||null
    });
    if (error) throw error;
    showToast('บันทึกรายรับสำเร็จ');
    resetIncomeForm();
    loadIncomeList(); loadFinanceSummary();
  } catch(e) { showToast('บันทึกไม่สำเร็จ: '+(e.message||e),'error'); console.error(e); }
  finally { setLoading(false); }
}

function resetIncomeForm() {
  document.getElementById('finance-date-income').value = new Date().toISOString().split('T')[0];
  ['finance-kg','finance-price-per-kg','finance-buyer','finance-notes-income'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  document.getElementById('finance-channel').value='';
  ['finance-plot','finance-veg'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('finance-total-preview').textContent='-';
}

async function loadIncomeList() {
  const {data} = await db.from('income').select('*').order('income_date',{ascending:false}).limit(40);
  const el = document.getElementById('income-list');
  if (!data?.length) { el.innerHTML='<div class="empty-state">ยังไม่มีรายรับ</div>'; return; }
  const chLbl = { market:'ตลาด', delivery:'เดลิเวอรี', direct:'ขายตรง', wholesale:'ขายส่ง', other:'อื่นๆ' };
  el.innerHTML = data.map(r=>`
    <div class="card fin-card">
      <div class="fin-row">
        <div>
          <span class="badge badge-accent">${chLbl[r.channel]||r.channel||'–'}</span>
          ${r.buyer?`<strong style="margin-left:6px">${r.buyer}</strong>`:''}
        </div>
        <div class="fin-amount income-amount">฿${parseFloat(r.total_amount).toLocaleString()}</div>
      </div>
      <div class="fin-meta">${formatDateTH(r.income_date)} · ${r.kg_sold} kg · ฿${r.price_per_kg}/kg</div>
      ${r.notes?`<div class="fin-notes">${r.notes}</div>`:''}
      <div style="display:flex;justify-content:flex-end;margin-top:8px">
        <button class="btn btn-danger btn-sm" onclick="deleteIncome('${r.id}')">ลบ</button>
      </div>
    </div>`).join('');
}

async function deleteIncome(id) {
  if (!confirm('ลบรายรับนี้?')) return;
  await db.from('income').delete().eq('id',id);
  showToast('ลบแล้ว'); loadIncomeList(); loadFinanceSummary();
}

// ===== EXPENSE =====
async function saveExpense() {
  const date     = document.getElementById('finance-date-expense').value;
  const category = document.getElementById('expense-category').value;
  const amount   = parseFloat(document.getElementById('expense-amount').value);
  const desc     = document.getElementById('expense-desc').value;
  const notes    = document.getElementById('finance-notes-expense').value;

  if (!date)              return showToast('กรุณาระบุวันที่','error');
  if (!category)          return showToast('กรุณาเลือกหมวดหมู่','error');
  if (!amount||amount<=0) return showToast('กรุณาระบุจำนวนเงิน','error');

  setLoading(true);
  try {
    const { error } = await db.from('expenses').insert({
      expense_date:date, category, amount, description:desc||null, notes:notes||null
    });
    if (error) throw error;
    showToast('บันทึกรายจ่ายสำเร็จ');
    resetExpenseForm(); loadExpenseList(); loadFinanceSummary();
  } catch(e) { showToast('บันทึกไม่สำเร็จ: '+(e.message||e),'error'); console.error(e); }
  finally { setLoading(false); }
}

function resetExpenseForm() {
  document.getElementById('finance-date-expense').value = new Date().toISOString().split('T')[0];
  ['expense-amount','expense-desc','finance-notes-expense'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  document.getElementById('expense-category').value='';
  document.getElementById('expense-amount-preview').textContent='';
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
  el.innerHTML = data.map(r=>`
    <div class="card fin-card">
      <div class="fin-row">
        <div>
          <span class="badge badge-warn">${catLbl[r.category]||r.category}</span>
          ${r.description?`<strong style="margin-left:6px">${r.description}</strong>`:''}
        </div>
        <div class="fin-amount expense-amount">฿${parseFloat(r.amount).toLocaleString()}</div>
      </div>
      <div class="fin-meta">${formatDateTH(r.expense_date)}</div>
      ${r.notes?`<div class="fin-notes">${r.notes}</div>`:''}
      <div style="display:flex;justify-content:flex-end;margin-top:8px">
        <button class="btn btn-danger btn-sm" onclick="deleteExpense('${r.id}')">ลบ</button>
      </div>
    </div>`).join('');
}

async function deleteExpense(id) {
  if (!confirm('ลบรายจ่ายนี้?')) return;
  await db.from('expenses').delete().eq('id',id);
  showToast('ลบแล้ว'); loadExpenseList(); loadFinanceSummary();
}

// ===== SUMMARY =====
async function loadFinanceSummary() {
  const now=new Date(), yr=now.getFullYear(), mo=String(now.getMonth()+1).padStart(2,'0');
  const monthStart=`${yr}-${mo}-01`, monthEnd=`${yr}-${mo}-31`;
  const yearStart=`${yr}-01-01`, yearEnd=`${yr}-12-31`;

  const [incM,incY,expM,expY,allInc,allExp,incDetail] = await Promise.all([
    db.from('income').select('total_amount').gte('income_date',monthStart).lte('income_date',monthEnd),
    db.from('income').select('total_amount').gte('income_date',yearStart).lte('income_date',yearEnd),
    db.from('expenses').select('amount').gte('expense_date',monthStart).lte('expense_date',monthEnd),
    db.from('expenses').select('amount').gte('expense_date',yearStart).lte('expense_date',yearEnd),
    db.from('income').select('income_date,total_amount').order('income_date',{ascending:true}).limit(12),
    db.from('expenses').select('expense_date,amount,category').order('expense_date',{ascending:true}).limit(60),
    db.from('income').select('plot_code,vegetable_type,kg_sold,total_amount').gte('income_date',yearStart).lte('income_date',yearEnd),
  ]);

  const si = arr=>arr.data?.reduce((s,r)=>s+parseFloat(r.total_amount||0),0)||0;
  const se = arr=>arr.data?.reduce((s,r)=>s+parseFloat(r.amount||0),0)||0;
  const im=si(incM),em=se(expM),iy=si(incY),ey=se(expY);
  const fmt=n=>`฿${n.toLocaleString('th-TH',{minimumFractionDigits:0,maximumFractionDigits:0})}`;

  // Net-profit hero (this month)
  const hero=document.getElementById('fin-hero');
  if (hero) {
    const profit=im-em;
    hero.classList.toggle('negative', profit<0);
    document.getElementById('hero-month-label').textContent = now.toLocaleDateString('th-TH',{month:'long',year:'numeric'});
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

  // Expense breakdown
  const catTotals={};
  expM.data?.forEach(r=>{catTotals[r.category]=(catTotals[r.category]||0)+parseFloat(r.amount||0);});
  const catLbl={seed:'เมล็ดพันธุ์',fertilizer:'ปุ๋ย',labor:'ค่าแรง',utility:'ค่าไฟ',equipment:'อุปกรณ์',packaging:'บรรจุภัณฑ์',transport:'ขนส่ง',other:'อื่นๆ'};
  const catHtml=Object.entries(catTotals).sort((a,b)=>b[1]-a[1]).map(([cat,amt])=>{
    const pct=em>0?((amt/em)*100).toFixed(0):0;
    return `<div class="cat-row">
      <span class="cat-name">${catLbl[cat]||cat}</span>
      <div class="cat-bar-wrap"><div class="cat-bar" style="width:${pct}%"></div></div>
      <span class="cat-amt">${fmt(amt)}</span>
    </div>`;
  }).join('');
  document.getElementById('expense-breakdown').innerHTML=catHtml||'<div class="empty-state" style="padding:16px">ยังไม่มีรายจ่าย</div>';

  // Revenue & yield by plot / by vegetable (this year)
  renderRevenueRanking('plot-revenue', incDetail.data||[], 'plot_code', v=>v||'ไม่ระบุแปลง');
  renderRevenueRanking('veg-revenue',  incDetail.data||[], 'vegetable_type', v=>typeof vegLabel==='function'?vegLabel(v):(v||'ไม่ระบุ'));

  renderFinanceChart(allInc.data||[],allExp.data||[]);
}

// Rank a metric by revenue, showing kg + ฿ with a proportional bar
function renderRevenueRanking(containerId, rows, key, labelFn) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const fmt = n => `฿${n.toLocaleString('th-TH',{maximumFractionDigits:0})}`;
  const groups = {};
  rows.forEach(r => {
    const k = r[key] || '';
    if (!groups[k]) groups[k] = { amt: 0, kg: 0 };
    groups[k].amt += parseFloat(r.total_amount || 0);
    groups[k].kg  += parseFloat(r.kg_sold || 0);
  });
  const entries = Object.entries(groups).sort((a,b)=>b[1].amt-a[1].amt);
  if (!entries.length) { el.innerHTML = '<div class="empty-state" style="padding:16px">ยังไม่มีข้อมูลรายรับที่ระบุแปลง/ชนิดผัก</div>'; return; }
  const max = entries[0][1].amt || 1;
  el.innerHTML = entries.map(([k,v]) => {
    const pct = ((v.amt/max)*100).toFixed(0);
    return `<div class="cat-row">
      <span class="cat-name">${labelFn(k)}<span class="text-sub" style="margin-left:6px">${v.kg.toLocaleString('th-TH',{maximumFractionDigits:1})} kg</span></span>
      <div class="cat-bar-wrap"><div class="cat-bar" style="width:${pct}%"></div></div>
      <span class="cat-amt">${fmt(v.amt)}</span>
    </div>`;
  }).join('');
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
    const chLbl={market:'ตลาด',delivery:'เดลิเวอรี',direct:'ขายตรง',wholesale:'ขายส่ง',other:'อื่นๆ'};
    headers=['วันที่','ช่องทาง','ผู้ซื้อ','น้ำหนัก(kg)','ราคา/kg','ยอดรวม','หมายเหตุ'];
    rows=data.map(r=>[r.income_date,chLbl[r.channel]||r.channel||'',r.buyer||'',r.kg_sold,r.price_per_kg,r.total_amount,r.notes||'']);
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

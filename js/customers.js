// js/customers.js — ระบบรายชื่อลูกค้า

let allCustomers = [];
let customerSearch = '';

function initCustomers() {
  document.getElementById('cust-search-input').addEventListener('input', e => {
    customerSearch = e.target.value.toLowerCase();
    renderCustomerList();
  });
  loadCustomers();
}

// ===== TAG LOGIC =====
function calcTag(c, purchaseCount) {
  if (purchaseCount >= 5) return 'regular';
  return c.tag || 'new';
}

function tagLabel(tag) {
  return { regular: 'ลูกค้าประจำ', new: 'ลูกค้าใหม่', general: 'ลูกค้าทั่วไป' }[tag] || 'ลูกค้าใหม่';
}
function tagClass(tag) {
  return { regular: 'tag-regular', new: 'tag-new', general: 'tag-general' }[tag] || 'tag-new';
}
function typeLabel(t) {
  return { customer: 'ลูกค้า', farm: 'ฟาร์ม' }[t] || t;
}

// ===== LOAD =====
async function loadCustomers() {
  setLoading(true);
  try {
    const { data: customers } = await db.from('customers').select('*').order('created_at', { ascending: false });
    const { data: incomeRows } = await db.from('income').select('buyer');

    // Count purchases per buyer name
    const buyCounts = {};
    incomeRows?.forEach(r => {
      if (r.buyer) buyCounts[r.buyer] = (buyCounts[r.buyer] || 0) + 1;
    });

    // Auto-upgrade tags & attach purchase count
    allCustomers = (customers || []).map(c => {
      const cnt = buyCounts[c.name] || 0;
      const tag = cnt >= 5 ? 'regular' : (c.tag || 'new');
      // auto-update in DB if upgraded
      if (tag !== c.tag && cnt >= 5) {
        db.from('customers').update({ tag: 'regular' }).eq('id', c.id);
      }
      return { ...c, tag, purchaseCount: cnt };
    });

    renderCustomerList();
    loadCustomerSummary();
  } catch(e) { console.error(e); showToast('โหลดข้อมูลลูกค้าไม่ได้','error'); }
  finally { setLoading(false); }
}

// ===== RENDER LIST =====
function renderCustomerList() {
  const filtered = allCustomers.filter(c =>
    !customerSearch ||
    c.name?.toLowerCase().includes(customerSearch) ||
    c.address?.toLowerCase().includes(customerSearch) ||
    tagLabel(c.tag).includes(customerSearch)
  );

  const el = document.getElementById('customer-list');
  if (!filtered.length) {
    el.innerHTML = '<div class="empty-state">ไม่พบลูกค้า</div>';
    return;
  }

  el.innerHTML = filtered.map(c => `
    <div class="card cust-card">
      <div class="cust-header">
        <div class="cust-avatar">${(c.name||'?')[0].toUpperCase()}</div>
        <div class="cust-info">
          <div class="cust-name">${c.name || '-'}</div>
          <div class="cust-meta">
            <span class="cust-tag ${tagClass(c.tag)}">${tagLabel(c.tag)}</span>
            <span class="cust-type-badge">${typeLabel(c.type)}</span>
          </div>
        </div>
        <div class="cust-buy-count">
          <div class="buy-num">${c.purchaseCount}</div>
          <div class="buy-label">ครั้ง</div>
        </div>
      </div>
      ${c.address ? `<div class="cust-address"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg> ${c.address}</div>` : ''}
      ${c.weekly_kg ? `<div class="cust-kg"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6l3 1m0 0l-3 9a5 5 0 006.9 4.9L21 15.5"/><path d="M6 7l3.5-1M6 7L5 3M21 7v8"/></svg> ใช้ผัก ${c.weekly_kg} kg/สัปดาห์</div>` : ''}
      <div style="display:flex;gap:6px;margin-top:10px;justify-content:flex-end">
        <button class="btn btn-outline btn-sm" onclick="openEditCustomer('${c.id}')">แก้ไข</button>
        <button class="btn btn-danger btn-sm" onclick="deleteCustomer('${c.id}')">ลบ</button>
      </div>
    </div>`).join('');
}

// ===== SUMMARY =====
async function loadCustomerSummary() {
  const now = new Date();
  const weekAgo  = new Date(now - 7*24*60*60*1000).toISOString().split('T')[0];
  const monthStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const monthStart = `${monthStr}-01`;

  const [wk, mo, all] = await Promise.all([
    db.from('income').select('total_amount,buyer').gte('income_date', weekAgo),
    db.from('income').select('total_amount,buyer').gte('income_date', monthStart),
    db.from('income').select('total_amount,buyer'),
  ]);

  const sum = rows => rows.data?.reduce((s,r)=>s+parseFloat(r.total_amount||0),0)||0;
  const uniq = rows => new Set(rows.data?.map(r=>r.buyer).filter(Boolean)).size;
  const fmt = n => `฿${n.toLocaleString('th-TH',{minimumFractionDigits:0,maximumFractionDigits:0})}`;

  document.getElementById('csum-week-amt').textContent  = fmt(sum(wk));
  document.getElementById('csum-week-cust').textContent  = uniq(wk) + ' คน';
  document.getElementById('csum-month-amt').textContent  = fmt(sum(mo));
  document.getElementById('csum-month-cust').textContent = uniq(mo) + ' คน';
  document.getElementById('csum-all-amt').textContent    = fmt(sum(all));
  document.getElementById('csum-all-cust').textContent   = allCustomers.length + ' คน';

  // Tag counts
  const tagCounts = { regular: 0, new: 0, general: 0 };
  allCustomers.forEach(c => { if (tagCounts[c.tag] !== undefined) tagCounts[c.tag]++; });
  document.getElementById('csum-regular').textContent = tagCounts.regular;
  document.getElementById('csum-new').textContent     = tagCounts.new;
  document.getElementById('csum-general').textContent = tagCounts.general;
}

// ===== ADD / EDIT =====
let editCustomerId = null;

function openAddCustomer() {
  editCustomerId = null;
  document.getElementById('cust-modal-title').textContent = 'เพิ่มลูกค้าใหม่';
  document.getElementById('cust-name').value = '';
  document.getElementById('cust-address').value = '';
  document.getElementById('cust-weekly-kg').value = '';
  document.getElementById('cust-type').value = 'customer';
  document.getElementById('cust-tag-select').value = 'new';
  document.getElementById('cust-modal').style.display = 'flex';
}

async function openEditCustomer(id) {
  const c = allCustomers.find(x => x.id === id);
  if (!c) return;
  editCustomerId = id;
  document.getElementById('cust-modal-title').textContent = 'แก้ไขข้อมูลลูกค้า';
  document.getElementById('cust-name').value = c.name || '';
  document.getElementById('cust-address').value = c.address || '';
  document.getElementById('cust-weekly-kg').value = c.weekly_kg || '';
  document.getElementById('cust-type').value = c.type || 'customer';
  document.getElementById('cust-tag-select').value = c.tag || 'new';
  document.getElementById('cust-modal').style.display = 'flex';
}

function closeCustomerModal() {
  document.getElementById('cust-modal').style.display = 'none';
}

async function saveCustomer() {
  const name     = document.getElementById('cust-name').value.trim();
  const address  = document.getElementById('cust-address').value.trim();
  const weeklyKg = parseFloat(document.getElementById('cust-weekly-kg').value) || null;
  const type     = document.getElementById('cust-type').value;
  const tag      = document.getElementById('cust-tag-select').value;

  if (!name) return showToast('กรุณาระบุชื่อลูกค้า', 'error');

  setLoading(true);
  try {
    const payload = { name, address: address||null, weekly_kg: weeklyKg, type, tag };
    if (editCustomerId) {
      const { error } = await db.from('customers').update(payload).eq('id', editCustomerId);
      if (error) throw error;
      showToast('แก้ไขข้อมูลสำเร็จ');
    } else {
      const { error } = await db.from('customers').insert(payload);
      if (error) throw error;
      showToast('เพิ่มลูกค้าสำเร็จ');
    }
    closeCustomerModal();
    loadCustomers();
  } catch(e) { showToast('บันทึกไม่สำเร็จ: '+(e.message||e),'error'); console.error(e); }
  finally { setLoading(false); }
}

async function deleteCustomer(id) {
  if (!confirm('ลบลูกค้านี้?')) return;
  await db.from('customers').delete().eq('id', id);
  showToast('ลบแล้ว');
  loadCustomers();
}

// ===== EXPORT =====
async function exportCustomersCSV() {
  if (!allCustomers.length) return showToast('ไม่มีข้อมูลลูกค้า','error');
  const headers = ['ชื่อ','ที่อยู่','ประเภท','แท็ก','ผักที่ใช้/สัปดาห์(kg)','จำนวนซื้อ(ครั้ง)'];
  const rows = allCustomers.map(c => [
    c.name, c.address||'', typeLabel(c.type), tagLabel(c.tag), c.weekly_kg||'', c.purchaseCount
  ]);
  const bom = '\uFEFF';
  const csv = bom + [headers,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv],{type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='vegfarm_customers.csv'; a.click();
  URL.revokeObjectURL(url);
  showToast('ดาวน์โหลด CSV แล้ว');
}

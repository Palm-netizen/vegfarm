// js/batches.js — Weekly Batch (ล็อตรายสัปดาห์)
// ล็อต = 1 สัปดาห์ (จันทร์–อาทิตย์ ตาม ISO week) รวมเมล็ดที่เพาะในสัปดาห์นั้นเป็นล็อตเดียว ไม่สนว่าเพาะวันย่อยไหน

const BATCH_PREFIX = { green_oak:'GO', red_oak:'RO', finley:'FL', cos:'CO', butterhead:'BH' };
const NURSERY1_DAYS = 15;   // ครบ 15 วัน → ย้ายลงอนุบาล 2
const PLANT_DAYS    = 25;   // ครบ 25 วัน → ย้ายลงปลูก
const HARVEST_DAYS  = 45;   // เก็บเกี่ยวครบ 45 วันจากวันเพาะ

let batchTab = 'nursery1';

function initBatches() {
  const dp = document.getElementById('batch-seed-date');
  if (dp && !dp.value) dp.value = new Date().toISOString().split('T')[0];
  loadBatches();
}

// ===== helper: ISO week ของวันที่ =====
function isoWeekInfo(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const day = (date.getDay() + 6) % 7;               // 0 = จันทร์
  const monday = new Date(date); monday.setDate(date.getDate() - day);
  const thursday = new Date(monday); thursday.setDate(monday.getDate() + 3);  // วันพฤหัสของสัปดาห์ ISO
  const isoYear = thursday.getFullYear();
  const firstThursday = new Date(isoYear, 0, 4);
  const ftDay = (firstThursday.getDay() + 6) % 7;
  const firstMonday = new Date(firstThursday); firstMonday.setDate(firstThursday.getDate() - ftDay);
  const week = Math.round((monday - firstMonday) / (7 * 86400000)) + 1;
  return { year: isoYear, week, monday: monday.toISOString().split('T')[0] };
}

function batchAgeDays(b) {
  const anchor = b.seed_start || b.week_start;
  const today = new Date(new Date().toISOString().split('T')[0]);
  return Math.max(0, Math.floor((today - new Date(anchor)) / 86400000));
}

function batchTabLabel(stage) {
  return { nursery1:'อนุบาล 1', nursery2:'อนุบาล 2', planted:'ลงแปลงแล้ว' }[stage] || stage;
}

// ===== เพิ่มเมล็ดเข้าล็อตของสัปดาห์นั้น =====
async function addWeeklySeeding() {
  const date = document.getElementById('batch-seed-date').value;
  const veg  = document.getElementById('batch-veg').value;
  const count = parseInt(document.getElementById('batch-count').value);
  const target = parseInt(document.getElementById('batch-target').value) || 0;

  if (!date) return showToast('กรุณาระบุวันที่เพาะ', 'error');
  if (!veg)  return showToast('กรุณาเลือกชนิดผัก', 'error');
  if (!count || count <= 0) return showToast('กรุณาระบุจำนวนต้น', 'error');

  const { year, week, monday } = isoWeekInfo(date);

  setLoading(true);
  try {
    // หาล็อตเดิมของสัปดาห์+ชนิดผักนี้
    const { data: existing } = await db.from('weekly_batches')
      .select('*').eq('year', year).eq('week', week).eq('vegetable_type', veg);
    const lot = (existing || [])[0];

    if (lot) {
      const patch = {
        total_seeds: (parseInt(lot.total_seeds) || 0) + count,
        seed_start: (!lot.seed_start || date < lot.seed_start) ? date : lot.seed_start,
        seed_end:   (!lot.seed_end   || date > lot.seed_end)   ? date : lot.seed_end,
        updated_at: new Date().toISOString()
      };
      if (target) patch.target = target;
      const { error } = await db.from('weekly_batches').update(patch).eq('id', lot.id);
      if (error) throw error;
      showToast(`เพิ่มเข้าล็อต ${lot.lot_code} แล้ว`);
    } else {
      const lotCode = `${BATCH_PREFIX[veg] || 'XX'}-W${week}`;
      const { error } = await db.from('weekly_batches').insert({
        lot_code: lotCode, vegetable_type: veg, year, week, week_start: monday,
        seed_start: date, seed_end: date, total_seeds: count, target, stage: 'nursery1'
      });
      if (error) throw error;
      showToast(`สร้างล็อต ${lotCode} แล้ว`);
    }
    document.getElementById('batch-count').value = '';
    loadBatches();
  } catch (err) {
    console.error(err);
    showToast('บันทึกไม่สำเร็จ: ' + (err.message || err), 'error');
  } finally {
    setLoading(false);
  }
}

function setBatchTab(tab) {
  batchTab = tab;
  ['nursery1', 'nursery2', 'planted'].forEach(t =>
    document.getElementById(`btab-${t}`)?.classList.toggle('active', t === tab));
  loadBatches();
}

async function loadBatches() {
  const { data: all } = await db.from('weekly_batches').select('*').order('week_start', { ascending: false });
  const rows = all || [];

  // จำนวนบนแท็บ
  ['nursery1', 'nursery2', 'planted'].forEach(t => {
    const el = document.getElementById(`btab-count-${t}`);
    if (el) el.textContent = `(${rows.filter(b => b.stage === t).length})`;
  });

  const list = document.getElementById('batch-list');
  const lots = rows.filter(b => b.stage === batchTab);
  if (!lots.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">🌱</div>ยังไม่มีล็อตใน${batchTabLabel(batchTab)}</div>`;
    return;
  }
  list.innerHTML = lots.map(renderBatchCard).join('');
}

function renderBatchCard(b) {
  const veg = (typeof vegLabel === 'function') ? vegLabel(b.vegetable_type) : b.vegetable_type;
  const age = batchAgeDays(b);
  const total = parseInt(b.total_seeds) || 0;
  const target = parseInt(b.target) || 0;
  const pct = target > 0 ? Math.min(100, Math.round(total / target * 100)) : 0;
  const reached = target > 0 && total >= target;
  const fmt = n => n.toLocaleString('th-TH');
  const rangeTxt = b.seed_start
    ? (b.seed_start === b.seed_end ? formatDateTH(b.seed_start) : `${formatDateShort(b.seed_start)}–${formatDateShort(b.seed_end)}`)
    : '-';

  let frame = '', alertHtml = '', btnHtml = '', statusTxt = '';

  if (b.stage === 'nursery1') {
    statusTxt = `อนุบาล 1 · อายุ ${age} วัน`;
    if (age >= NURSERY1_DAYS) {
      frame = 'warn';
      alertHtml = `<div class="batch-alert warn">🟡 ครบ ${NURSERY1_DAYS} วันแล้ว — ควรย้ายลงอนุบาล 2</div>`;
      btnHtml = `<button class="btn btn-warn btn-sm" style="width:100%;margin-top:8px" onclick="moveBatch('${b.id}','nursery2')">➡️ ย้ายลงอนุบาล 2</button>`;
    }
  } else if (b.stage === 'nursery2') {
    const harvest = addDays(b.seed_start || b.week_start, HARVEST_DAYS);
    statusTxt = `อนุบาล 2 · อายุ ${age} วัน · เก็บได้ ${formatDateTH(harvest)}`;
    if (age >= PLANT_DAYS) {
      frame = 'ready';
      alertHtml = `<div class="batch-alert ready">🟢 ครบ ${PLANT_DAYS} วันแล้ว — พร้อมย้ายลงปลูก</div>`;
      btnHtml = `<button class="btn btn-primary btn-sm" style="width:100%;margin-top:8px" onclick="moveBatchToPlanting('${b.id}')">🌱 ย้ายลงปลูก (เลือกแปลง)</button>`;
    }
  } else {
    const harvest = addDays(b.seed_start || b.week_start, HARVEST_DAYS);
    statusTxt = `ลงแปลงแล้ว · เก็บได้ ${formatDateTH(harvest)}`;
  }

  return `
    <div class="batch-card ${frame}">
      <div class="batch-head">
        <div class="batch-code">${b.lot_code}</div>
        <div class="batch-veg">${veg} · สัปดาห์ ${b.week}</div>
      </div>
      <div class="batch-grid">
        <div><span class="bl">เป้าหมาย</span><span class="bv">${target ? fmt(target) + ' ต้น' : '—'}</span></div>
        <div><span class="bl">เพาะแล้ว</span><span class="bv ${reached ? 'ok' : ''}">${fmt(total)} ต้น${reached ? ' ✓' : ''}</span></div>
      </div>
      ${target ? `<div class="batch-bar"><div class="batch-bar-fill ${reached ? 'ok' : ''}" style="width:${pct}%"></div></div>
      <div class="batch-bar-label">${pct}% ของเป้าหมาย${reached ? ' · ครบเป้าแล้ว 🎯' : ''}</div>` : ''}
      <div class="batch-meta">ช่วงเพาะ: ${rangeTxt}</div>
      <div class="batch-status">สถานะ: <strong>${statusTxt}</strong></div>
      ${alertHtml}
      ${btnHtml}
      <div class="batch-actions">
        <button class="pa-btn pa-del" onclick="deleteBatch('${b.id}')" aria-label="ลบ">🗑</button>
      </div>
    </div>`;
}

async function moveBatch(id, stage) {
  const { error } = await vfUpdateUndoable('weekly_batches', id, { stage, updated_at: new Date().toISOString() },
    stage === 'nursery2' ? 'ย้ายลงอนุบาล 2 แล้ว' : 'ย้ายสถานะแล้ว', () => loadBatches());
  if (error) return showToast('ย้ายไม่สำเร็จ: ' + (error.message || error), 'error');
  loadBatches();
}

// ย้ายลงปลูก → ตั้งสถานะ planted แล้วสลับไปหน้าแปลงปลูก เพื่อเลือกแปลง (กรอกชนิดผัก+อายุให้อัตโนมัติ)
async function moveBatchToPlanting(id) {
  const { data: lot } = await db.from('weekly_batches').select('*').eq('id', id).single();
  if (!lot) return;
  const age = batchAgeDays(lot);
  const { error } = await db.from('weekly_batches').update({ stage: 'planted', updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return showToast('ย้ายไม่สำเร็จ: ' + (error.message || error), 'error');
  // ส่งข้อมูลให้หน้าแปลงปลูกกรอกอัตโนมัติเมื่อเลือกแปลง
  vfPendingPlant = { veg: lot.vegetable_type, age, lot: lot.lot_code };
  loadBatches();
  showToast(`ล็อต ${lot.lot_code} พร้อมปลูก — เลือกแปลงที่จะลง`);
  showPage('plots');
}

async function deleteBatch(id) {
  if (!(await vfConfirm('ลบล็อตนี้?', { okLabel: 'ลบ' }))) return;
  const { error } = await db.from('weekly_batches').delete().eq('id', id);
  if (error) return showToast('ลบไม่สำเร็จ: ' + (error.message || error), 'error');
  showToast('ลบล็อตแล้ว');
  loadBatches();
}

// วันที่แบบสั้น (ไม่มีปี) เช่น "6 ก.ค."
function formatDateShort(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

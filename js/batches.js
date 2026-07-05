// js/batches.js — Weekly Batch (ล็อตรายสัปดาห์)
// ดึงข้อมูลจากเมนู "เพาะเมล็ด" (seed_batches) อัตโนมัติ แล้วจัดกลุ่มเป็นล็อตรายสัปดาห์
// ล็อต = 1 สัปดาห์ (จันทร์–อาทิตย์ ตาม ISO week) + ชนิดผัก  ไม่ต้องกรอกข้อมูลเพิ่ม
// สถานะ (อนุบาล 1/2/ลงแปลง) + เป้าหมาย เก็บเป็น overlay ในตาราง weekly_batches

const BATCH_PREFIX = { green_oak:'GO', red_oak:'RO', finley:'FL', cos:'CO', butterhead:'BH' };
const NURSERY1_DAYS = 15;   // ครบ 15 วัน → ย้ายลงอนุบาล 2
const PLANT_DAYS    = 25;   // ครบ 25 วัน → ย้ายลงปลูก
const HARVEST_DAYS  = 45;   // เก็บเกี่ยวครบ 45 วันจากวันเพาะ
const DEFAULT_TARGET = 3000; // เป้าหมายต่อล็อต (ต้น)

let batchTab = 'nursery1';
let batchLots = [];         // ล็อตที่จัดกลุ่มแล้ว (แคชไว้ให้ปุ่มต่างๆ ใช้)

function initBatches() {
  loadBatches();
}

// ===== helper: ISO week ของวันที่ (จันทร์–อาทิตย์) =====
function isoWeekInfo(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const day = (date.getDay() + 6) % 7;               // 0 = จันทร์
  const monday = new Date(date); monday.setDate(date.getDate() - day);
  const thursday = new Date(monday); thursday.setDate(monday.getDate() + 3);
  const isoYear = thursday.getFullYear();
  const firstThursday = new Date(isoYear, 0, 4);
  const ftDay = (firstThursday.getDay() + 6) % 7;
  const firstMonday = new Date(firstThursday); firstMonday.setDate(firstThursday.getDate() - ftDay);
  const week = Math.round((monday - firstMonday) / (7 * 86400000)) + 1;
  return { year: isoYear, week, monday: monday.toISOString().split('T')[0] };
}

function batchAgeDays(seedStart) {
  const today = new Date(new Date().toISOString().split('T')[0]);
  return Math.max(0, Math.floor((today - new Date(seedStart)) / 86400000));
}

function batchTabLabel(stage) {
  return { nursery1:'อนุบาล 1', nursery2:'อนุบาล 2', planted:'ลงแปลงแล้ว' }[stage] || stage;
}

async function loadBatches() {
  // ดึงข้อมูลจากเมนูเพาะเมล็ด + สถานะ overlay
  const [seedsRes, stateRes] = await Promise.all([
    db.from('seed_batches').select('*'),
    db.from('weekly_batches').select('*')
  ]);
  const seeds = seedsRes.data || [];
  const states = stateRes.data || [];

  // จัดกลุ่มเป็นล็อต: (ปี + สัปดาห์ + ชนิดผัก)
  const lots = {};
  seeds.forEach(sb => {
    const types = Array.isArray(sb.vegetable_types)
      ? sb.vegetable_types
      : (sb.vegetable_types ? [sb.vegetable_types] : []);
    if (!types.length || !sb.seed_date) return;
    const per = (parseInt(sb.seed_count) || 0) / types.length;   // แบ่งจำนวนเมล็ดเท่าๆ กันตามชนิด
    const { year, week, monday } = isoWeekInfo(sb.seed_date);
    types.forEach(veg => {
      const key = `${year}-${week}-${veg}`;
      if (!lots[key]) lots[key] = { key, veg, year, week, monday, total: 0, seed_start: sb.seed_date, seed_end: sb.seed_date };
      const L = lots[key];
      L.total += per;
      if (sb.seed_date < L.seed_start) L.seed_start = sb.seed_date;
      if (sb.seed_date > L.seed_end) L.seed_end = sb.seed_date;
    });
  });

  // ผูกสถานะ + เป้าหมายจาก overlay
  const stateMap = {};
  states.forEach(s => { stateMap[`${s.year}-${s.week}-${s.vegetable_type}`] = s; });

  batchLots = Object.values(lots).map(L => {
    const s = stateMap[L.key];
    return {
      ...L,
      lot_code: `${BATCH_PREFIX[L.veg] || 'XX'}-W${L.week}`,
      total_seeds: Math.round(L.total),
      target: (s && s.target) ? parseInt(s.target) : DEFAULT_TARGET,
      stage: (s && s.stage) ? s.stage : 'nursery1',
      stateId: s ? s.id : null
    };
  }).sort((a, b) => (a.monday < b.monday ? 1 : -1));

  // จำนวนบนแท็บ
  ['nursery1', 'nursery2', 'planted'].forEach(t => {
    const el = document.getElementById(`btab-count-${t}`);
    if (el) el.textContent = `(${batchLots.filter(b => b.stage === t).length})`;
  });

  const list = document.getElementById('batch-list');
  const shown = batchLots.filter(b => b.stage === batchTab);
  if (!seeds.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">🌱</div>ยังไม่มีข้อมูลเพาะเมล็ด — บันทึกที่เมนู "เพาะ" ก่อน ระบบจะจัดกลุ่มให้อัตโนมัติ</div>';
    return;
  }
  if (!shown.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">🌱</div>ยังไม่มีล็อตใน${batchTabLabel(batchTab)}</div>`;
    return;
  }
  list.innerHTML = shown.map(renderBatchCard).join('');
}

function renderBatchCard(b) {
  const veg = (typeof vegLabel === 'function') ? vegLabel(b.vegetable_type || b.veg) : b.veg;
  const age = batchAgeDays(b.seed_start);
  const total = b.total_seeds;
  const target = b.target;
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
      btnHtml = `<button class="btn btn-warn btn-sm" style="width:100%;margin-top:8px" onclick="moveBatch('${b.key}','nursery2')">➡️ ย้ายลงอนุบาล 2</button>`;
    }
  } else if (b.stage === 'nursery2') {
    const harvest = addDays(b.seed_start, HARVEST_DAYS);
    statusTxt = `อนุบาล 2 · อายุ ${age} วัน · เก็บได้ ${formatDateTH(harvest)}`;
    if (age >= PLANT_DAYS) {
      frame = 'ready';
      alertHtml = `<div class="batch-alert ready">🟢 ครบ ${PLANT_DAYS} วันแล้ว — พร้อมย้ายลงปลูก</div>`;
      btnHtml = `<button class="btn btn-primary btn-sm" style="width:100%;margin-top:8px" onclick="moveBatchToPlanting('${b.key}')">🌱 ย้ายลงปลูก (เลือกแปลง)</button>`;
    } else {
      btnHtml = `<button class="btn btn-outline btn-sm" style="width:100%;margin-top:8px" onclick="moveBatch('${b.key}','nursery1')">↩ กลับอนุบาล 1</button>`;
    }
  } else {
    const harvest = addDays(b.seed_start, HARVEST_DAYS);
    statusTxt = `ลงแปลงแล้ว · เก็บได้ ${formatDateTH(harvest)}`;
    btnHtml = `<button class="btn btn-outline btn-sm" style="width:100%;margin-top:8px" onclick="moveBatch('${b.key}','nursery2')">↩ กลับอนุบาล 2</button>`;
  }

  return `
    <div class="batch-card ${frame}">
      <div class="batch-head">
        <div class="batch-code">${b.lot_code}</div>
        <div class="batch-veg">${veg} · สัปดาห์ ${b.week}</div>
      </div>
      <div class="batch-grid">
        <div><span class="bl">เป้าหมาย</span><span class="bv">${fmt(target)} ต้น</span></div>
        <div><span class="bl">เพาะแล้ว</span><span class="bv ${reached ? 'ok' : ''}">${fmt(total)} ต้น${reached ? ' ✓' : ''}</span></div>
      </div>
      <div class="batch-bar"><div class="batch-bar-fill ${reached ? 'ok' : ''}" style="width:${pct}%"></div></div>
      <div class="batch-bar-label">${pct}% ของเป้าหมาย${reached ? ' · ครบเป้าแล้ว 🎯' : ''}</div>
      <div class="batch-meta">ช่วงเพาะ: ${rangeTxt}</div>
      <div class="batch-status">สถานะ: <strong>${statusTxt}</strong></div>
      ${alertHtml}
      ${btnHtml}
    </div>`;
}

// ย้ายสถานะล็อต — เก็บ/อัปเดต overlay ในตาราง weekly_batches
async function moveBatch(key, stage) {
  const lot = batchLots.find(l => l.key === key);
  if (!lot) return;
  const msg = stage === 'nursery2' ? 'ย้ายลงอนุบาล 2 แล้ว'
            : stage === 'nursery1' ? 'ย้ายกลับอนุบาล 1 แล้ว' : 'ย้ายสถานะแล้ว';
  let error;
  if (lot.stateId) {
    ({ error } = await vfUpdateUndoable('weekly_batches', lot.stateId, { stage, updated_at: new Date().toISOString() }, msg, () => loadBatches()));
  } else {
    ({ error } = await vfInsertUndoable('weekly_batches', overlayRow(lot, stage), msg, () => loadBatches()));
  }
  if (error) return showToast('ย้ายไม่สำเร็จ: ' + (error.message || error), 'error');
  loadBatches();
}

// ย้ายลงปลูก → ตั้งสถานะ planted แล้วสลับไปหน้าแปลงปลูก เพื่อเลือกแปลง (กรอกชนิดผัก+อายุอัตโนมัติ)
async function moveBatchToPlanting(key) {
  const lot = batchLots.find(l => l.key === key);
  if (!lot) return;
  const age = batchAgeDays(lot.seed_start);
  let error;
  if (lot.stateId) {
    ({ error } = await db.from('weekly_batches').update({ stage: 'planted', updated_at: new Date().toISOString() }).eq('id', lot.stateId));
  } else {
    ({ error } = await db.from('weekly_batches').insert(overlayRow(lot, 'planted')));
  }
  if (error) return showToast('ย้ายไม่สำเร็จ: ' + (error.message || error), 'error');
  vfPendingPlant = { veg: lot.veg, age, lot: lot.lot_code };
  loadBatches();
  showToast(`ล็อต ${lot.lot_code} พร้อมปลูก — เลือกแปลงที่จะลง`);
  showPage('plots');
}

// สร้าง overlay row จากล็อตที่จัดกลุ่มไว้
function overlayRow(lot, stage) {
  return {
    lot_code: lot.lot_code, vegetable_type: lot.veg, year: lot.year, week: lot.week,
    week_start: lot.monday, seed_start: lot.seed_start, seed_end: lot.seed_end,
    total_seeds: lot.total_seeds, target: lot.target, stage
  };
}

function setBatchTab(tab) {
  batchTab = tab;
  ['nursery1', 'nursery2', 'planted'].forEach(t =>
    document.getElementById(`btab-${t}`)?.classList.toggle('active', t === tab));
  loadBatches();
}

// วันที่แบบสั้น (ไม่มีปี) เช่น "6 ก.ค."
function formatDateShort(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

// js/foliar.js — ตารางฉีดบำรุงใบ (ทุกสัปดาห์) + เช็คลิสต์ + แจ้งเตือนหน้าแรก + สีในปฏิทิน
// เก็บ 1 แถวต่อสัปดาห์ที่ฉีดแล้ว ในตาราง foliar_sprays (week_start = วันจันทร์ของสัปดาห์)

// day: 0=อา 1=จ 2=อ 3=พ 4=พฤ 5=ศ 6=ส · startWeek = สัปดาห์แรกที่เริ่มนับ (ก่อนหน้านี้ไม่ทำสี)
const FOLIAR_SCHEDULE = { day: 3, dayName: 'พุธ', label: 'ฉีดบำรุงใบ', startWeek: '2026-11-02' };

let foliarRows = null;

// วันที่แบบ YYYY-MM-DD ตามเวลาเครื่อง (ไม่เพี้ยนจาก timezone)
function vfLocalISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function foliarParse(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); }
// วันจันทร์ของสัปดาห์ที่วันนี้อยู่ (สัปดาห์ จ.–อา.)
function foliarWeekStart(date) {
  const x = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return vfLocalISO(x);
}
// วันฉีดของสัปดาห์นั้น
function foliarDayOf(weekStart) {
  const x = foliarParse(weekStart);
  x.setDate(x.getDate() + ((FOLIAR_SCHEDULE.day + 6) % 7));
  return vfLocalISO(x);
}
function foliarShortDate(iso) {
  return foliarParse(iso).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
}

async function foliarLoad(force) {
  if (foliarRows && !force) return foliarRows;
  const { data, error } = await db.from('foliar_sprays').select('*');
  foliarRows = error ? [] : (data || []);
  return foliarRows;
}
function foliarRecord(weekStart) { return (foliarRows || []).find(r => r.week_start === weekStart) || null; }

// done = ฉีดแล้ว · missed = ถึง/เลยวันฉีดแล้วแต่ยังไม่ฉีด · upcoming = ยังไม่ถึง · none = ก่อนเริ่มนับ
function foliarStatus(weekStart) {
  if (weekStart < FOLIAR_SCHEDULE.startWeek) return 'none';
  if (foliarRecord(weekStart)) return 'done';
  return foliarDayOf(weekStart) <= vfLocalISO(new Date()) ? 'missed' : 'upcoming';
}

async function foliarRefreshAll() {
  await foliarLoad(true);
  renderFoliarDash();
  if (document.getElementById('foliar-modal')?.style.display === 'flex') renderFoliarLog();
  if (document.getElementById('page-calendar')?.classList.contains('active') && typeof renderCalendar === 'function') renderCalendar();
}

// ติ๊กว่าฉีดแล้ว (สัปดาห์นี้ = วันนี้ · สัปดาห์ก่อน = วันฉีดของสัปดาห์นั้น)
async function foliarMark(weekStart) {
  await foliarLoad();
  if (foliarRecord(weekStart)) return;
  const today = vfLocalISO(new Date());
  const inWeek = today >= weekStart && foliarWeekStart(new Date()) === weekStart;
  const payload = { week_start: weekStart, spray_date: inWeek ? today : foliarDayOf(weekStart) };
  setLoading(true);
  try {
    const { error } = await vfInsertUndoable('foliar_sprays', payload, `✅ บันทึกฉีดบำรุงใบแล้ว`, foliarRefreshAll);
    if (error) throw error;
    await foliarRefreshAll();
  } catch (e) {
    console.error(e);
    showToast('บันทึกไม่สำเร็จ — ต้องสร้างตาราง foliar_sprays ใน Supabase ก่อน', 'error');
  } finally { setLoading(false); }
}

// ยกเลิกติ๊ก (กดผิด)
async function foliarUnmark(weekStart) {
  const rec = foliarRecord(weekStart);
  if (!rec) return;
  if (!(await vfConfirm(`ยกเลิกการติ๊กฉีดบำรุงใบ ${foliarShortDate(foliarDayOf(weekStart))}?`, { okLabel: 'ยกเลิกติ๊ก', icon: '↩️' }))) return;
  setLoading(true);
  try {
    await db.from('foliar_sprays').delete().eq('id', rec.id);
    showToast('ยกเลิกติ๊กแล้ว');
    await foliarRefreshAll();
  } catch (e) { console.error(e); showToast('ยกเลิกไม่สำเร็จ', 'error'); }
  finally { setLoading(false); }
}

// ===== แจ้งเตือนหน้าแรก =====
async function renderFoliarDash() {
  const el = document.getElementById('dash-foliar');
  if (!el) return;
  await foliarLoad();
  const now = new Date();
  const today = vfLocalISO(now);
  const ws = foliarWeekStart(now);
  const sprayDay = foliarDayOf(ws);
  const st = foliarStatus(ws);
  const tmr = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const nextWs = foliarWeekStart(tmr);
  const isEve = foliarDayOf(nextWs) === vfLocalISO(tmr) && foliarStatus(nextWs) === 'upcoming';
  const btn = (w, txt) => `<button class="foliar-btn" onclick="event.stopPropagation();foliarMark('${w}')">${txt}</button>`;

  let level = '', icon = '', title = '', action = '', extra = '';
  if (st === 'done') {
    const rec = foliarRecord(ws);
    level = 'good'; icon = '✅'; title = `ฉีดบำรุงใบสัปดาห์นี้แล้ว`;
    action = `ฉีดเมื่อ ${foliarShortDate(rec.spray_date || sprayDay)} · รอบหน้า ${foliarShortDate(foliarDayOf(vfLocalISO(new Date(foliarParse(ws).getTime() + 7 * 86400000))))}`;
  } else if (isEve) {
    level = 'info'; icon = '💧'; title = `พรุ่งนี้ (วัน${FOLIAR_SCHEDULE.dayName}) ฉีดบำรุงใบ`;
    action = 'เตรียมปุ๋ยทางใบ/ถังพ่นให้พร้อม · ฉีดเสร็จแล้วกดติ๊ก';
    extra = btn(nextWs, '✓ ฉีดแล้ว');
  } else if (st === 'missed' && sprayDay === today) {
    level = 'warn'; icon = '💧'; title = 'วันนี้ต้องฉีดบำรุงใบ';
    action = 'ฉีดเสร็จแล้วกดติ๊ก เพื่อให้ปฏิทินขึ้นสีเขียว';
    extra = btn(ws, '✓ ฉีดแล้ว');
  } else if (st === 'missed') {
    const late = Math.round((foliarParse(today) - foliarParse(sprayDay)) / 86400000);
    level = 'danger'; icon = '🔴'; title = 'สัปดาห์นี้ยังไม่ได้ฉีดบำรุงใบ!';
    action = `เลยกำหนดวัน${FOLIAR_SCHEDULE.dayName}มา ${late} วัน · ถ้าฉีดแล้วกดติ๊ก`;
    extra = btn(ws, '✓ ฉีดแล้ว');
  } else {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `<div class="advice-card ${level} foliar-card" onclick="openFoliarLog()">
    <div class="advice-emoji">${icon}</div>
    <div class="advice-body"><div class="advice-title">${title}</div><div class="advice-action">${action}</div></div>
    ${extra}
  </div>`;
}

// ===== ป้ายในปฏิทิน =====
function foliarCalLabel(date) {
  if (date.getDay() !== FOLIAR_SCHEDULE.day) return '';
  const st = foliarStatus(foliarWeekStart(date));
  if (st === 'none') return '';
  const txt = { done: '💧ฉีดแล้ว', missed: '💧ไม่ฉีด', upcoming: '💧บำรุง' }[st];
  return `<div class="cal-foliar ${st}">${txt}</div>`;
}

// การ์ดในรายละเอียดวัน (กดวันพุธในปฏิทิน)
function foliarDayCard(dateStr) {
  const d = foliarParse(dateStr);
  if (d.getDay() !== FOLIAR_SCHEDULE.day) return '';
  const ws = foliarWeekStart(d);
  const st = foliarStatus(ws);
  if (st === 'none') return '';
  const rec = foliarRecord(ws);
  const body = st === 'done'
    ? `<div class="cyc-sub">✅ ฉีดแล้ว เมื่อ ${foliarShortDate(rec.spray_date || dateStr)}</div>
       <button class="btn btn-outline btn-sm" style="margin-top:8px" onclick="foliarUnmark('${ws}')">↩️ ยกเลิกติ๊ก</button>`
    : st === 'missed'
      ? `<div class="cyc-sub" style="color:var(--danger);font-weight:700">🔴 สัปดาห์นี้ยังไม่ได้ฉีด</div>
         <button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="foliarMark('${ws}')">✓ ติ๊กว่าฉีดแล้ว</button>`
      : `<div class="cyc-sub">กำหนดฉีดบำรุงใบวันนี้ — ฉีดเสร็จแล้วกดติ๊กในหน้าแรกหรือที่นี่</div>`;
  return `<div class="card foliar-day-card ${st}" style="padding:8px 14px;margin-bottom:10px">
    <div class="card-title" style="margin:6px 0 4px">💧 ${FOLIAR_SCHEDULE.label} (ทุกวัน${FOLIAR_SCHEDULE.dayName})</div>
    ${body}
  </div>`;
}

// ===== หน้าต่างตาราง/ประวัติการฉีด =====
function openFoliarLog() {
  document.getElementById('foliar-modal').style.display = 'flex';
  renderFoliarLog();
}
function closeFoliarLog() { document.getElementById('foliar-modal').style.display = 'none'; }

async function renderFoliarLog() {
  const body = document.getElementById('foliar-log-body');
  if (!body) return;
  await foliarLoad(true);
  const cur = foliarWeekStart(new Date());
  const next = vfLocalISO(new Date(foliarParse(cur).getTime() + 7 * 86400000));
  const weeks = [];
  for (let w = next; w >= FOLIAR_SCHEDULE.startWeek && weeks.length < 26;) {
    weeks.push(w);
    const x = foliarParse(w); x.setDate(x.getDate() - 7); w = vfLocalISO(x);
  }
  const counted = weeks.filter(w => foliarStatus(w) !== 'upcoming');
  const done = counted.filter(w => foliarStatus(w) === 'done').length;
  const pill = { done: '✅ ฉีดแล้ว', missed: '🔴 ไม่ฉีด', upcoming: '⏳ รอฉีด' };
  body.innerHTML = `
    <div class="foliar-summary">ฉีดแล้ว <b>${done}</b> / ${counted.length} สัปดาห์${counted.length - done > 0 ? ` · <span style="color:var(--danger)">ขาด ${counted.length - done} สัปดาห์</span>` : ''}</div>
    ${weeks.map(w => {
      const st = foliarStatus(w);
      const rec = foliarRecord(w);
      const sub = st === 'done' ? `ฉีดเมื่อ ${foliarShortDate(rec.spray_date || foliarDayOf(w))}` : (w === cur ? 'สัปดาห์นี้' : w === next ? 'สัปดาห์หน้า' : '');
      const action = st === 'done'
        ? `<button class="foliar-chk on" onclick="foliarUnmark('${w}')" aria-label="ยกเลิกติ๊ก">✓</button>`
        : st === 'missed'
          ? `<button class="foliar-chk" onclick="foliarMark('${w}')" aria-label="ติ๊กว่าฉีดแล้ว"></button>`
          : `<span class="foliar-chk off"></span>`;
      return `<div class="foliar-row ${st}">
        <div class="foliar-row-main"><b>${foliarShortDate(foliarDayOf(w))}</b>${sub ? `<span>${sub}</span>` : ''}</div>
        <span class="foliar-pill ${st}">${pill[st]}</span>
        ${action}
      </div>`;
    }).join('')}`;
}

// js/capacity.js — กำลังการผลิต (Capacity Planner)
// กรอก 5 ค่า → คำนวณว่าต้องปลูก/เพาะเท่าไหร่ต่อสัปดาห์ · แปลง/อนุบาลพอมั้ย · ถ้าโตช้าจะเป็นยังไง

function openCapacity() {
  const set = (id, v) => { const e = document.getElementById(id); if (e && !e.value) e.value = v; };
  set('cap-order', (typeof LOT_ORDER_TARGET_KG !== 'undefined') ? LOT_ORDER_TARGET_KG : 90);
  set('cap-ppk', 12);      // ต้นต่อกิโล
  set('cap-ppp', 270);     // ต้นต่อแปลง
  set('cap-plots', 15);    // จำนวนแปลง
  set('cap-days', 30);     // ระยะเวลาปลูกจริง (วัน ในแปลง)
  document.getElementById('capacity-modal').style.display = 'flex';
  calcCapacity();
}
function closeCapacity() { document.getElementById('capacity-modal').style.display = 'none'; }

function calcCapacity() {
  const num = id => parseFloat(document.getElementById(id).value) || 0;
  const O = num('cap-order'), PPK = num('cap-ppk'), PPP = num('cap-ppp'), N = num('cap-plots'), D = num('cap-days');
  const out = document.getElementById('cap-result');
  if (!(O > 0 && PPK > 0 && PPP > 0 && D > 0)) {
    out.innerHTML = '<div class="text-sub" style="text-align:center;padding:12px">กรอกค่าให้ครบเพื่อคำนวณ</div>';
    return;
  }
  const cnt = n => n.toLocaleString('th-TH', { maximumFractionDigits: 0 });
  const season = (typeof currentSeason === 'function') ? currentSeason() : { key: 'hot', label: 'ฤดูปัจจุบัน' };
  const survival = ((typeof getSurvivalRate === 'function') ? getSurvivalRate(season.key) : 70) / 100;

  const plantsWeek = Math.round(O * PPK);
  const plotsWeek = Math.ceil(plantsWeek / PPP);
  const seedsWeek = Math.ceil(plantsWeek / survival / 10) * 10;
  // แปลงที่ต้องใช้หมุนเวียน = แปลง/สัปดาห์ × (ระยะปลูก ÷ 7) แล้วปัดขึ้นทีเดียว
  const weeksField = D / 7;
  const plotsNeeded = Math.ceil(plotsWeek * weeksField);
  const plotsOK = N >= plotsNeeded;
  const weeksField2 = (D + 10) / 7;
  const plotsNeeded2 = Math.ceil(plotsWeek * weeksField2);
  const ok2 = N >= plotsNeeded2;

  const row = (icon, label, val, sub) =>
    `<div class="cap-row"><span class="cap-lbl">${icon} ${label}${sub ? `<br><span class="cap-sub">${sub}</span>` : ''}</span><b class="cap-val">${val}</b></div>`;

  out.innerHTML =
    row('🎯', 'ต้องเก็บผลผลิต/สัปดาห์', cnt(plantsWeek) + ' ต้น', `${cnt(O)} กก. × ${cnt(PPK)} ต้น/กก.`) +
    row('🌿', 'ต้องปลูก/สัปดาห์', `<span style="color:var(--primary)">${cnt(plotsWeek)} แปลง</span>`, `${cnt(plantsWeek)} ต้น ÷ ${cnt(PPP)} ต้น/แปลง`) +
    row('🌱', 'ต้องเพาะ/สัปดาห์', `<span style="color:var(--primary)">${cnt(seedsWeek)} เมล็ด</span>`, `เผื่ออัตรารอด ${Math.round(survival * 100)}% (${season.label})`) +
    '<div class="cap-divider"></div>' +
    row('📦', 'แปลงที่ต้องใช้หมุนเวียน', cnt(plotsNeeded) + ' แปลง', `${cnt(plotsWeek)} แปลง/สัปดาห์ × (${cnt(D)}÷7 = ${weeksField.toFixed(2)} สัปดาห์) = ${(plotsWeek * weeksField).toFixed(2)} → ปัดขึ้น`) +
    `<div class="cap-verdict ${plotsOK ? 'ok' : 'bad'}">${plotsOK
      ? `✅ แปลงพอ — มี ${cnt(N)} แปลง (ใช้ ${cnt(plotsNeeded)})`
      : `🔴 แปลงไม่พอ! มี ${cnt(N)} แปลง ต้องใช้ ${cnt(plotsNeeded)} — ขาดอีก ${cnt(plotsNeeded - N)} แปลง`}</div>` +
    row('🪴', 'อนุบาลต้องผลิตต้นกล้า', cnt(plotsWeek) + ' แปลง/สัปดาห์', `เพาะ ${cnt(seedsWeek)} เมล็ด/สัปดาห์ ให้ต่อเนื่อง`) +
    '<div class="cap-divider"></div>' +
    `<div class="cap-whatif ${ok2 ? '' : 'bad'}">⏳ <b>ถ้าผักโตช้าอีก 10 วัน</b> (รวม ${cnt(D + 10)} วัน = ${weeksField2.toFixed(2)} สัปดาห์)<br>
      ต้องใช้แปลงเพิ่มเป็น <b>${cnt(plotsNeeded2)} แปลง</b> (จาก ${cnt(plotsNeeded)}) — ${ok2
        ? `✅ ยังพอ`
        : `<b style="color:var(--danger)">🔴 จะขาด ${cnt(plotsNeeded2 - N)} แปลง</b> ต้องรีบวางแผน`}</div>`;
}

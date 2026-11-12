// js/dashboard.js — หน้า Dashboard

async function loadDashboard() {
  setLoading(true);
  if (typeof renderFoliarDash === 'function') renderFoliarDash();   // แจ้งเตือนฉีดบำรุงใบ (โหลดแยก ไม่รอ)
  try {
    const today = new Date().toISOString().split('T')[0];
    // วันจันทร์ของสัปดาห์นี้
    const wd = new Date(today); const dow = (wd.getDay() + 6) % 7; wd.setDate(wd.getDate() - dow);
    const weekStart = wd.toISOString().split('T')[0];

    // ยิงทุก query พร้อมกัน (parallel) แทนที่จะรอทีละอัน → หน้าแรกโหลดเร็วขึ้นมาก
    const [
      activePlotsR, batchesR, problemPlotsR, todosR,
      chartBatchesR, weekOrdersR, todayOrdersR, futureSeedsR, todaySeedsR
    ] = await Promise.all([
      db.from('plots').select('*').eq('is_harvested', false).not('plant_date', 'is', null),
      db.from('seed_batches').select('survival_rate').order('created_at', { ascending: false }).limit(5),
      db.from('problems').select('plot_code').eq('resolved', false),
      db.from('todos').select('*').gte('todo_date', today).lte('todo_date', addDays(today, 1)).order('sort_order', { ascending: true }),
      db.from('seed_batches').select('seed_date, seed_count, estimated_kg, weather_condition').order('seed_date', { ascending: false }).limit(6),
      db.from('orders').select('id,customer_name,kg,delivered,order_date,week_start').gte('week_start', weekStart),
      db.from('orders').select('id,customer_name,vegetable_type,kg,delivered').eq('order_date', today),
      db.from('seed_batches').select('harvest_date, estimated_kg').gte('harvest_date', today),
      db.from('seed_batches').select('seed_count,sower').eq('seed_date', today),
    ]);

    // 1. จำนวนรอบปลูกปัจจุบัน (ใช้ซ้ำเป็น "แปลงที่กำลังปลูก" ด้วย)
    const activePlots = activePlotsR.data || [];

    // 2. อัตรารอดเฉลี่ย
    const batches = batchesR.data || [];
    const avgSurvival = batches.length
      ? (batches.reduce((s, b) => s + (b.survival_rate || 0), 0) / batches.length).toFixed(1)
      : 0;

    // 3. แปลงที่มีปัญหา
    const uniqueProblemPlots = [...new Set((problemPlotsR.data || []).map(p => p.plot_code))];

    // 4-6. งานวันนี้ / ปัญหาล่าสุด / กราฟ
    // งานวันนี้ + พรุ่งนี้ (To-do)
    const allTodos = todosR.data || [];
    const todayTodos = allTodos.filter(t => t.todo_date === today);
    const tomorrowTodos = allTodos.filter(t => t.todo_date === addDays(today, 1));
    const chartBatches = chartBatchesR.data || [];

    // 7. แปลงที่กำลังปลูก — พร้อมวันเก็บเกี่ยว (วันปลูก + 45 − อายุต้นกล้า)
    const growingPlots = activePlots
      .map(p => {
        const harvest = p.harvest_date || addDays(p.plant_date, Math.max(0, 45 - (p.plant_age_days || 0)));
        return { ...p, harvest, daysLeft: Math.round((new Date(harvest) - new Date(today)) / 86400000) };
      })
      .sort((a, b) => a.daysLeft - b.daysLeft);

    // 8. แผนส่งผักสัปดาห์นี้
    const supplyPlots = growingPlots.filter(p => p.daysLeft <= 7);
    const supplyKg = supplyPlots.reduce((s, p) => s + (parseFloat(p.estimated_kg) || 0), 0);
    // ผักที่จะเก็บได้ใน 14 วัน (สำหรับวางแผนกลางเดือน) — แยกส่วนเพิ่ม 8-14 วัน
    const supplyPlots14 = growingPlots.filter(p => p.daysLeft > 7 && p.daysLeft <= 14);
    const supplyKg14 = supplyKg + supplyPlots14.reduce((s, p) => s + (parseFloat(p.estimated_kg) || 0), 0);
    // ผลผลิตแบ่งตาม "สัปดาห์จริง" (สำหรับสรุปเหลือ/ขาด) — สัปดาห์นี้ = เก็บได้ถึงสิ้นสัปดาห์นี้ · สัปดาห์หน้า = เก็บเฉพาะช่วงสัปดาห์หน้า (ไม่เกิน)
    const thisWeekEnd = addDays(weekStart, 6);
    const nWeekStart = addDays(weekStart, 7), nWeekEnd = addDays(weekStart, 13);
    const sumKg = arr => arr.reduce((s, p) => s + (parseFloat(p.estimated_kg) || 0), 0);
    const supplyWk0 = sumKg(growingPlots.filter(p => p.harvest <= thisWeekEnd));                       // รวมเลยกำหนด+ที่จะเก็บภายในสัปดาห์นี้
    const supplyWk1Harvest = sumKg(growingPlots.filter(p => p.harvest >= nWeekStart && p.harvest <= nWeekEnd));

    // ออเดอร์ที่จะส่ง — สัปดาห์นี้ + สัปดาห์หน้า (เลือกดูได้ + สรุปรวม)
    const nextWeekStart = addDays(weekStart, 7);
    const upcomingOrders = weekOrdersR.data || [];
    const thisWeekOrders = upcomingOrders.filter(o => o.week_start === weekStart && o.order_date !== today);
    const nextWeekOrders = upcomingOrders.filter(o => o.week_start === nextWeekStart);
    const { data: customersData } = await db.from('customers').select('id,name,weekly_kg,type');
    const standing = (customersData || []).filter(c => parseFloat(c.weekly_kg) > 0)
      .sort((a, b) => (parseFloat(b.weekly_kg) || 0) - (parseFloat(a.weekly_kg) || 0));
    const buildWeek = (orders, start, label, useStanding) => {
      if (orders.length) return {
        start, label, ordersMode: true,
        items: orders.map(o => ({ id: o.id, name: o.customer_name, kg: parseFloat(o.kg) || 0, delivered: o.delivered, type: 'customer' })).sort((a, b) => b.kg - a.kg),
        kg: orders.reduce((s, o) => s + (parseFloat(o.kg) || 0), 0)
      };
      if (useStanding && standing.length) return {
        start, label, ordersMode: false,
        items: standing.map(c => ({ id: c.id, name: c.name, kg: parseFloat(c.weekly_kg) || 0, type: c.type })),
        kg: standing.reduce((s, c) => s + (parseFloat(c.weekly_kg) || 0), 0)
      };
      return { start, label, ordersMode: true, items: [], kg: 0 };
    };
    const planWeeks = [
      buildWeek(thisWeekOrders, weekStart, 'สัปดาห์นี้', true),
      buildWeek(nextWeekOrders, nextWeekStart, 'สัปดาห์หน้า', false)
    ];

    // 9. ออเดอร์วันนี้ที่ต้องส่ง
    const todayOrders = todayOrdersR.data || [];

    // จำนวนเมล็ดที่มาริโอ้เพาะวันนี้ (รวมชื่อเดิม "ปาล์ม")
    const marioSeededToday = (todaySeedsR.data || [])
      .filter(b => b.sower === SEED_SCHEDULE.sower || b.sower === 'ปาล์ม')
      .reduce((s, b) => s + (parseInt(b.seed_count) || 0), 0);

    // 10. คำแนะนำ/แจ้งเตือนอัจฉริยะ
    renderAdvice({
      today, weekStart, marioSeededToday,
      futureSeeds: futureSeedsR.data || [],
      growingPlots, todayOrders,
      thisWeekPlots: activePlots.filter(p => {
        const wd = new Date(p.plant_date); const dow = (wd.getDay() + 6) % 7; wd.setDate(wd.getDate() - dow);
        return wd.toISOString().split('T')[0] === weekStart;
      }).length,
      overdue: growingPlots.filter(p => p.daysLeft < 0).length,
      nearHarvest: growingPlots.filter(p => p.daysLeft >= 0 && p.daysLeft <= 5).length
    });

    // Render
    renderDashboardStats({
      activePlots: activePlots.length,
      avgSurvival,
      problemPlotsCount: uniqueProblemPlots.length,
      problemPlotsList: uniqueProblemPlots,
      todayTodos,
      tomorrowTodos,
      todayStr: today,
      chartBatches: chartBatches.slice().reverse(),
      growingPlots,
      weeklyPlan: { supplyKg, supplyKg14, supplyWk0, supplyWk1Harvest, supplyPlots, supplyPlots14, weeks: planWeeks },
      todayOrders
    });

  } catch (err) {
    console.error(err);
    showToast('โหลดข้อมูล Dashboard ไม่ได้', 'error');
  } finally {
    setLoading(false);
  }
}

function renderDashboardStats(data) {
  const el = id => document.getElementById(id);

  // Stats
  el('dash-active-plots').textContent = data.activePlots;
  el('dash-survival').textContent = data.avgSurvival + '%';
  el('dash-problem-plots').textContent = data.problemPlotsCount;
  el('dash-todos-today').textContent = data.todayTodos.filter(t => !t.is_done).length + ' งาน';

  // Problem plots list
  el('dash-problem-list').textContent = data.problemPlotsList.length
    ? data.problemPlotsList.join(', ')
    : 'ไม่มีปัญหา';

  // To-do วันนี้ + พรุ่งนี้ (ติ๊กได้เลยจากหน้าแรก)
  dashTodoData = { today: data.todayTodos, tomorrow: data.tomorrowTodos, todayStr: data.todayStr };
  renderDashTodos();

  // ออเดอร์วันนี้ที่ต้องส่ง
  const toEl = el('dash-today-orders');
  if (toEl) {
    dashTodayOrders = data.todayOrders || [];
    renderTodayOrders();
  }

  // แผนส่งผักสัปดาห์นี้
  dashWeeklyPlan = data.weeklyPlan || null;
  if (dashWeeklyPlan) {
    const w = dashWeeklyPlan.weeks || [];
    // ถ้าสัปดาห์นี้ยังไม่มีออเดอร์ แต่สัปดาห์หน้ามี → เปิดที่สัปดาห์หน้าให้เลย
    dashPlanWeekIdx = (w[0] && !w[0].items.length && w[1] && w[1].items.length) ? 1 : 0;
  }
  renderWeeklyPlan();

  // Chart
  renderDashboardChart(data.chartBatches);
}

// ===== To-do วันนี้ + พรุ่งนี้ =====
let dashTodoData = null;
function renderDashTodos() {
  const box = document.getElementById('dash-todo-list');
  if (!box || !dashTodoData) return;
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const group = (label, list, dateStr) => {
    const left = list.filter(t => !t.is_done).length;
    const rows = list.length
      ? list.map(t => `
        <label class="todo-item ${t.is_done ? 'done' : ''}">
          <input type="checkbox" class="todo-check" ${t.is_done ? 'checked' : ''} onchange="dashToggleTodo('${t.id}', this.checked)">
          <span class="todo-text">${esc(t.task)}</span>
        </label>`).join('')
      : `<div class="text-sub dash-todo-empty">ยังไม่มีงาน</div>`;
    return `<div class="dash-todo-group">
      <div class="dash-todo-head"><b>${label}</b> <span>${formatDateTH(dateStr)}</span>
        <em>${list.length ? (left ? `เหลือ ${left} งาน` : 'เสร็จครบ ✅') : ''}</em></div>
      ${rows}
    </div>`;
  };
  box.innerHTML = group('📌 วันนี้', dashTodoData.today, dashTodoData.todayStr)
    + group('🗓 พรุ่งนี้', dashTodoData.tomorrow, addDays(dashTodoData.todayStr, 1))
    + `<button class="btn btn-outline btn-sm" style="width:100%;margin-top:8px" onclick="showPage('todos')">+ เพิ่ม/แก้ไขงาน</button>`;
}
async function dashToggleTodo(id, done) {
  ['today', 'tomorrow'].forEach(k => (dashTodoData[k] || []).forEach(t => { if (t.id === id) t.is_done = done; }));
  renderDashTodos();
  const cnt = document.getElementById('dash-todos-today');
  if (cnt) cnt.textContent = dashTodoData.today.filter(t => !t.is_done).length + ' งาน';
  const { error } = await db.from('todos').update({ is_done: done }).eq('id', id);
  if (error) { showToast('บันทึกไม่สำเร็จ', 'error'); loadDashboard(); }
}

function renderDashboardChart(batches) {
  const container = document.getElementById('dashChart');
  if (!container) return;

  if (!batches.length) {
    container.innerHTML = '<div class="empty-state">ยังไม่มีข้อมูลเพียงพอสำหรับกราฟ</div>';
    return;
  }

  // สไตล์ใหม่: แท่งทรงแคปซูลบนรางสีอ่อน (กก.) + เส้นโค้งไล่สี (จำนวนเมล็ด) + ป้ายค่าจุดล่าสุด
  const labels = batches.map(b => new Date(b.seed_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }));
  const kgData = batches.map(b => parseFloat(b.estimated_kg) || 0);
  const seedData = batches.map(b => b.seed_count || 0);

  const W = 600, H = 270, padL = 16, padR = 16, padT = 34, padB = 40;
  const chartW = W - padL - padR, chartH = H - padT - padB;
  const n = labels.length, slot = chartW / n;
  const barW = Math.min(30, slot * 0.42);
  const maxKg = Math.max(...kgData, 1) * 1.15;
  const maxSeed = Math.max(...seedData, 1) * 1.25;
  const base = padT + chartH;
  const xFor = i => padL + slot * i + slot / 2;
  const yForKg = v => base - (v / maxKg) * chartH;
  const yForSeed = v => base - (v / maxSeed) * chartH;

  let grid = '';
  for (let g = 0; g <= 3; g++) {
    const y = padT + (chartH / 3) * g;
    grid += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" style="stroke:var(--line)" stroke-width="1" stroke-dasharray="3 5"/>`;
  }

  let bars = '';
  kgData.forEach((v, i) => {
    const x = xFor(i) - barW / 2, y = yForKg(v);
    bars += `<rect x="${x}" y="${padT}" width="${barW}" height="${chartH}" rx="${barW / 2}" style="fill:var(--blue-tint)"/>`;
    bars += `<rect x="${x}" y="${y}" width="${barW}" height="${Math.max(barW, base - y)}" rx="${barW / 2}" style="fill:var(--blue)"/>`;
    bars += `<text x="${xFor(i)}" y="${padT - 10}" text-anchor="middle" font-size="12" font-weight="700" style="fill:var(--ink-soft)">${vfShortNum(v)}</text>`;
  });

  const pts = seedData.map((v, i) => [+xFor(i).toFixed(1), +yForSeed(v).toFixed(1)]);
  const line = vfSmoothPath(pts);
  const area = `${line} L${pts[pts.length - 1][0]},${base} L${pts[0][0]},${base} Z`;
  const dots = pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="4" style="fill:var(--paper);stroke:var(--chart-line)" stroke-width="2.5"/>`).join('');
  const last = pts[pts.length - 1], lastV = seedData[seedData.length - 1];
  const bubbleTxt = `${lastV.toLocaleString('th-TH')} เมล็ด`;
  const bw = 16 + bubbleTxt.length * 6.6, bx = Math.min(Math.max(last[0] - bw / 2, 2), W - bw - 2), by = Math.max(last[1] - 40, 2);
  const bubble = `<rect x="${bx}" y="${by}" width="${bw}" height="26" rx="9" style="fill:var(--chart-line)"/>
    <text x="${bx + bw / 2}" y="${by + 17}" text-anchor="middle" font-size="12" font-weight="700" fill="#fff">${bubbleTxt}</text>`;

  const xLabels = labels.map((lab, i) =>
    `<text x="${xFor(i)}" y="${H - 12}" text-anchor="middle" font-size="12" font-weight="600" style="fill:var(--ink-soft)">${lab}</text>`).join('');

  container.innerHTML = `
    <svg class="vf-chart" viewBox="0 0 ${W} ${H}">
      <defs><linearGradient id="dashSeedFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" style="stop-color:var(--chart-line);stop-opacity:.28"/>
        <stop offset="100%" style="stop-color:var(--chart-line);stop-opacity:0"/>
      </linearGradient></defs>
      ${grid}${bars}
      <path d="${area}" fill="url(#dashSeedFill)"/>
      <path d="${line}" fill="none" style="stroke:var(--chart-line)" stroke-width="3" stroke-linecap="round"/>
      ${dots}${bubble}${xLabels}
    </svg>
    <div class="vf-legend">
      <span><i style="background:var(--blue)"></i>คาดการณ์ (กก.)</span>
      <span><i style="background:var(--chart-line)"></i>จำนวนเมล็ด</span>
    </div>`;
}

// ออเดอร์วันนี้ที่ต้องส่ง — render เฉพาะส่วนนี้ (ไม่โหลดทั้งหน้า)
let dashTodayOrders = [];
function renderTodayOrders() {
  const toEl = document.getElementById('dash-today-orders');
  if (!toEl) return;
  const ords = dashTodayOrders || [];
  const VEG = VF_VEG;
  const price = (typeof INCOME_PRICE_PER_KG !== 'undefined') ? INCOME_PRICE_PER_KG : 100;
  const kgN = n => n.toLocaleString('th-TH', { maximumFractionDigits: 1 });
  if (!ords.length) {
    toEl.innerHTML = '<div class="empty-state">วันนี้ยังไม่มีออเดอร์ที่ต้องส่ง</div>';
    return;
  }
  const tkg = ords.reduce((s, o) => s + parseFloat(o.kg || 0), 0);
  const done = ords.filter(o => o.delivered).reduce((s, o) => s + parseFloat(o.kg || 0), 0);
  toEl.innerHTML = `
    <div class="savings-card" style="padding:14px 0">
      <div class="savings-row"><span>📦 รวมต้องส่ง</span><b style="color:var(--primary)">${kgN(tkg)} กก. · ฿${(tkg*price).toLocaleString('th-TH',{maximumFractionDigits:0})}</b></div>
      <div class="savings-row"><span>✅ ส่งแล้ว</span><b>${kgN(done)} / ${kgN(tkg)} กก.</b></div>
    </div>
    <div class="card" style="padding:4px 14px;margin-top:8px">
      ${ords.map(o => `
        <div class="pe-row">
          <span class="dash-ord-check ${o.delivered ? 'on' : ''}" role="checkbox" aria-checked="${o.delivered}" tabindex="0" onclick="toggleDashOrder('${o.id}', ${!o.delivered})">${o.delivered ? '✅' : ''}</span>
          <span class="pe-desc" style="flex:1"><strong>${o.customer_name}</strong> <span class="pe-date">${o.vegetable_type ? (VEG[o.vegetable_type]||o.vegetable_type) : ''}</span></span>
          <span class="pe-amt" style="color:var(--primary)">${kgN(parseFloat(o.kg))} กก.</span>
        </div>`).join('')}
    </div>`;
}

// แผนส่งผัก — สัปดาห์นี้ + สัปดาห์หน้า (เลือกดูได้) + สรุปรวม 2 สัปดาห์
let dashWeeklyPlan = null;
let dashPlanWeekIdx = 0;
function setPlanWeek(i) { dashPlanWeekIdx = i; renderWeeklyPlan(); }
function renderWeeklyPlan() {
  const wkEl = document.getElementById('dash-weekly-plan');
  if (!wkEl || !dashWeeklyPlan) return;
  const { supplyKg, supplyPlots } = dashWeeklyPlan;
  const kg = n => n.toLocaleString('th-TH', { maximumFractionDigits: 1 });
  const vegName = v => (typeof vegLabelMulti === 'function') ? vegLabelMulti(v) : (v || '');
  const shortD = ds => new Date(ds).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  const plotRow = p => `<div class="h7-row"><span>🌿 <b>${p.plot_code}</b> ${vegName(p.vegetable_type)}</span><span class="h7-meta">${kg(parseFloat(p.estimated_kg || 0))} กก. · ${shortD(p.harvest)} · ${p.daysLeft <= 0 ? '⚠️ ถึงกำหนด' : 'อีก ' + p.daysLeft + ' วัน'}</span></div>`;
  const h7 = (supplyPlots || []).slice().sort((a, b) => a.daysLeft - b.daysLeft);
  const h7List = h7.length ? `<div class="h7-list">${h7.map(plotRow).join('')}</div>` : `<div class="text-sub" style="padding:4px 0 8px">ยังไม่มีแปลงที่จะเก็บใน 7 วัน</div>`;
  // หน้าแรกโชว์แค่ผักที่จะเก็บได้ใน 7 วัน (ตัด 8–14 วัน/สรุป/รายชื่อส่งออกตามที่ขอ)
  wkEl.innerHTML = `
    <div class="savings-card" style="padding:14px 0">
      <div class="savings-row"><span>🌿 ผักที่จะเก็บได้ (ใน 7 วัน)</span><b style="color:var(--primary)">${kg(supplyKg)} กก.</b></div>
      ${h7List}
    </div>`;
}

// แก้ไขจำนวน กก. ในรายชื่อที่ต้องส่ง (ออเดอร์ หรือ ยอด/สัปดาห์ของลูกค้า)
async function editDeliveryItem(id, ordersMode, currentKg, name) {
  const input = prompt(`แก้จำนวน กก. ที่ต้องส่งให้ "${name}"`, currentKg);
  if (input === null) return;
  const v = parseFloat(input);
  if (isNaN(v) || v < 0) return showToast('กรุณาใส่ตัวเลขที่ถูกต้อง', 'error');
  setLoading(true);
  try {
    if (ordersMode) await db.from('orders').update({ kg: v }).eq('id', id);
    else await db.from('customers').update({ weekly_kg: v }).eq('id', id);
    showToast('แก้ไขแล้ว');
    loadDashboard();
  } catch (e) { console.error(e); showToast('แก้ไขไม่สำเร็จ', 'error'); }
  finally { setLoading(false); }
}
// ลบออกจากรายชื่อที่ต้องส่ง (ออเดอร์ → ลบทิ้ง · ลูกค้า → เอายอด/สัปดาห์ออก ไม่ลบลูกค้า)
async function deleteDeliveryItem(id, ordersMode, name) {
  const msg = ordersMode ? `ลบออเดอร์ของ "${name}" สัปดาห์นี้?` : `เอา "${name}" ออกจากรายการส่ง? (ไม่ลบลูกค้า)`;
  if (!(await vfConfirm(msg, { okLabel: 'ลบ' }))) return;
  setLoading(true);
  try {
    if (ordersMode) await db.from('orders').delete().eq('id', id);
    else await db.from('customers').update({ weekly_kg: 0 }).eq('id', id);
    showToast('ลบออกจากรายการแล้ว');
    loadDashboard();
  } catch (e) { console.error(e); showToast('ลบไม่สำเร็จ', 'error'); }
  finally { setLoading(false); }
}

// ===== คำแนะนำ/แจ้งเตือนอัจฉริยะ — แปลงข้อมูลเป็นคำแนะนำในการตัดสินใจ =====
const SEED_TO_HARVEST_DAYS = 45;
// ตารางเพาะประจำ: มาริโอ้ เพาะทุกวันพุธ(3) กับ ศุกร์(5) วันละ 250 เมล็ด (รวม 500/สัปดาห์)
const SEED_SCHEDULE = {
  sower: 'มาริโอ้', days: [3, 5],
  // เมล็ด/วัน = เป้ามาริโอ้ต่อสัปดาห์ ÷ จำนวนวันเพาะ (ตามเป้าที่ตั้งในหน้าเพาะ)
  get perDay() { return Math.ceil(vfSowerTargets()['มาริโอ้'] / this.days.length / 10) * 10; }
};

// จำนวนเมล็ดที่ต้องเพาะเพื่อให้ได้ผลผลิต kg ที่ต้องการ (ตามฤดูปัจจุบัน) ปัดขึ้นเป็นหลัก 50
function seedsForKg(kg) {
  const s = (typeof currentSeason === 'function') ? currentSeason() : { key: 'hot' };
  const weather = s.key || 'hot';
  const kgPerPlant = weather === 'cold' ? (1 / 10) : (1 / 12);
  const yieldPerSeed = (getSurvivalRate(weather) / 100) * kgPerPlant;
  if (yieldPerSeed <= 0) return 0;
  return Math.max(50, Math.ceil(kg / yieldPerSeed / 50) * 50);
}

function renderAdvice(d) {
  const el = document.getElementById('dash-advice');
  if (!el) return;
  const items = [];
  const fmt = n => n.toLocaleString('th-TH', { maximumFractionDigits: 0 });
  const shortDate = ds => new Date(ds).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });

  // 1) พยากรณ์ผลผลิต 8 สัปดาห์ข้างหน้า เทียบเป้า 90 กก./สัปดาห์
  const HORIZON = 8;
  const weeks = [];
  for (let i = 0; i < HORIZON; i++) {
    const ws = addDays(d.weekStart, i * 7);
    const we = addDays(d.weekStart, (i + 1) * 7);
    const supply = (d.futureSeeds || [])
      .filter(b => b.harvest_date >= ws && b.harvest_date < we)
      .reduce((s, b) => s + (parseFloat(b.estimated_kg) || 0), 0);
    weeks.push({ i, ws, supply, gap: vfWeeklyTargetKg() - supply });
  }
  // เมล็ดที่เพาะ "สัปดาห์นี้" จะไปเก็บอีก ~lead สัปดาห์ (45 วัน) — แนะช่วงเวลาเพาะให้ตรงสัปดาห์ที่ขาด
  const lead = Math.round(SEED_TO_HARVEST_DAYS / 7);   // ≈ 6 สัปดาห์
  const firstShort = weeks.find(w => w.i >= 1 && w.gap > 2);
  if (firstShort) {
    const sowIn = firstShort.i - lead;   // ต้องเพาะอีกกี่สัปดาห์ข้างหน้า (0 = สัปดาห์นี้)
    const seeds = seedsForKg(firstShort.gap);
    // แจ้งล่วงหน้าแบบ "ป้องกันก่อนเกิด" — บอกว่าอีก N สัปดาห์จะเก็บได้แค่เท่าไหร่ + ทางเลือก
    const head = `อีก ${firstShort.i} สัปดาห์ (${shortDate(firstShort.ws)}) จะเก็บได้แค่ ~${fmt(firstShort.supply)} กก. (เป้า ${vfWeeklyTargetKg()})`;
    if (sowIn < 0) {
      items.push({ level: 'danger', icon: '⚠️', title: head, action: `เพาะไม่ทันรอบนี้ (ต้องใช้ ~45 วัน) → ปรับแผนส่งลูกค้า · ลดรับออเดอร์ชั่วคราว · หรือหาผักเสริม` });
    } else {
      const when = sowIn === 0 ? 'สัปดาห์นี้' : sowIn === 1 ? 'สัปดาห์หน้า' : `อีก ${sowIn} สัปดาห์`;
      items.push({ level: 'warn', icon: '📉', title: head, action: `มีเวลาเตรียม ${firstShort.i} สัปดาห์ → 🌱 เพาะเพิ่ม ~${fmt(seeds)} เมล็ด${sowIn === 0 ? ' สัปดาห์นี้' : ' ' + when} · หรือปรับแผนส่ง/ลดรับออเดอร์` });
    }
  }

  // 2) เลยกำหนดเก็บ
  if (d.overdue > 0) items.push({ level: 'danger', icon: '🔴', title: `มี ${d.overdue} แปลงเลยกำหนดเก็บแล้ว`, action: 'รีบเก็บเกี่ยวก่อนผักแก่/เสีย' });
  // 3) ใกล้เก็บ
  if (d.nearHarvest > 0) items.push({ level: 'info', icon: '🟡', title: `${d.nearHarvest} แปลงใกล้เก็บใน 5 วัน`, action: 'เตรียมแผนเก็บและลูกค้ารับซื้อ' });
  // 4) ปลูกไม่ครบเป้า/สัปดาห์
  if (d.thisWeekPlots < 4) items.push({ level: 'warn', icon: '🌱', title: `สัปดาห์นี้ปลูกแล้ว ${d.thisWeekPlots}/4 แปลง`, action: `ปลูกอีก ${4 - d.thisWeekPlots} แปลงให้ครบ ไม่งั้นผักไม่พอส่ง` });
  // 5) ออเดอร์วันนี้ยังไม่ส่ง
  const undel = (d.todayOrders || []).filter(o => !o.delivered);
  if (undel.length) {
    const kg = undel.reduce((s, o) => s + parseFloat(o.kg || 0), 0);
    items.push({ level: 'info', icon: '🚚', title: `ออเดอร์วันนี้ยังไม่ส่ง ${undel.length} ราย (${fmt(kg)} กก.)`, action: 'จัดของและส่งให้ครบวันนี้' });
  }

  // 6) เตือนวันเพาะประจำของมาริโอ้ (ทุกพุธ/ศุกร์) — แสดงบนสุด
  if (SEED_SCHEDULE.days.includes(new Date().getDay())) {
    const done = d.marioSeededToday || 0;
    const need = Math.max(0, SEED_SCHEDULE.perDay - done);
    if (need > 0) {
      items.unshift({ level: 'warn', icon: '🌱', title: `วันนี้วันเพาะของ ${SEED_SCHEDULE.sower} — เพาะให้ครบ ${fmt(SEED_SCHEDULE.perDay)} เมล็ด`, action: `เพาะแล้ว ${fmt(done)} · ขาดอีก ${fmt(need)} เมล็ด ไม่งั้นผักจะไม่พอส่ง` });
    } else {
      items.unshift({ level: 'good', icon: '🌱', title: `วันเพาะของ ${SEED_SCHEDULE.sower} — เพาะครบ ${fmt(SEED_SCHEDULE.perDay)} เมล็ดแล้ว ✅`, action: 'เยี่ยมมาก ครบตามแผนแล้ว' });
    }
  }

  window.vfLastAdvice = items;   // เก็บไว้ให้ผู้ช่วยอธิบายเหตุผล
  if (!items.length) {
    el.innerHTML = `<div class="advice-card good"><div class="advice-emoji">✅</div><div class="advice-body"><div class="advice-title">ทุกอย่างเป็นไปตามแผน</div><div class="advice-action">ผลผลิตพอเป้าทุกสัปดาห์ · ไม่มีเรื่องด่วน</div></div></div>`;
    return;
  }
  el.innerHTML = `
    <div class="advice-head">💡 คำแนะนำวันนี้ <span class="advice-count">${items.length}</span></div>
    ${items.map(it => `
      <div class="advice-card ${it.level}">
        <div class="advice-emoji">${it.icon}</div>
        <div class="advice-body">
          <div class="advice-title">${it.title}</div>
          <div class="advice-action">${it.action}</div>
        </div>
      </div>`).join('')}`;
}

// ติ๊กถูกออเดอร์วันนี้จากหน้า Dashboard — อัปเดตทันที (optimistic) แล้วค่อยบันทึกเบื้องหลัง
async function toggleDashOrder(id, val) {
  const o = dashTodayOrders.find(x => x.id === id);
  if (o) o.delivered = val;          // อัปเดต UI ทันที
  renderTodayOrders();
  renderWeeklyPlan();                // อัปเดตยอดสัปดาห์ตามที่ส่งแล้ว
  const { error } = await db.from('orders').update({ delivered: val }).eq('id', id);
  if (error) {
    if (o) o.delivered = !val;       // ย้อนกลับถ้าบันทึกพลาด
    renderTodayOrders();
    renderWeeklyPlan();
    showToast('อัปเดตไม่สำเร็จ: ' + (error.message || error), 'error');
    return;
  }
  await vfSyncOrderIncomeToast(id);   // ส่งแล้ว → บันทึกรายรับอัตโนมัติ
}

// ===== Helpers =====
function problemIcon(type) {
  const icons = { burned_leaf: '🔥', waterlogged: '💧', root_rot: '🦠', worm: '🐛', fungus: '🍄', other: '⚠️' };
  return icons[type] || '⚠️';
}
function problemLabel(type) {
  const labels = { burned_leaf: 'ใบไหม้', waterlogged: 'ใบอิ่มน้ำ', root_rot: 'รากเน่า', worm: 'หนอน', fungus: 'เชื้อรา', other: 'อื่นๆ' };
  return labels[type] || type;
}
function severityLabel(s) {
  return { low: 'เบา', medium: 'ปานกลาง', high: 'รุนแรง' }[s] || s;
}

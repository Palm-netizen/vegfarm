// js/dashboard.js — หน้า Dashboard

async function loadDashboard() {
  setLoading(true);
  try {
    const today = new Date().toISOString().split('T')[0];

    // 1. จำนวนรอบปลูกปัจจุบัน
    const { data: activePlots } = await db
      .from('plots')
      .select('*')
      .eq('is_harvested', false)
      .not('plant_date', 'is', null);

    // 2. อัตรารอดเฉลี่ย
    const { data: batches } = await db
      .from('seed_batches')
      .select('survival_rate')
      .order('created_at', { ascending: false })
      .limit(5);
    const avgSurvival = batches?.length
      ? (batches.reduce((s, b) => s + (b.survival_rate || 0), 0) / batches.length).toFixed(1)
      : 0;

    // 3. แปลงที่มีปัญหา
    const { data: problemPlots } = await db
      .from('problems')
      .select('plot_code')
      .eq('resolved', false);
    const uniqueProblemPlots = [...new Set(problemPlots?.map(p => p.plot_code) || [])];

    // 4. งานวันนี้
    const { data: todayTodos } = await db
      .from('todos')
      .select('*')
      .eq('todo_date', today);

    // 5. ปัญหาล่าสุด 3 รายการ
    const { data: recentProblems } = await db
      .from('problems')
      .select('*')
      .order('problem_date', { ascending: false })
      .limit(3);

    // 6. ข้อมูลกราฟ - 6 รอบล่าสุด
    const { data: chartBatches } = await db
      .from('seed_batches')
      .select('seed_date, seed_count, estimated_kg, weather_condition')
      .order('seed_date', { ascending: false })
      .limit(6);

    // 7. แปลงที่กำลังปลูก — แสดงทั้งหมด พร้อมวันเก็บเกี่ยว (วันปลูก + 45 − อายุต้นกล้า)
    const { data: pendingPlots } = await db
      .from('plots')
      .select('*')
      .eq('is_harvested', false)
      .not('plant_date', 'is', null);
    const growingPlots = (pendingPlots || [])
      .map(p => {
        const harvest = p.harvest_date || addDays(p.plant_date, Math.max(0, 45 - (p.plant_age_days || 0)));
        return { ...p, harvest, daysLeft: Math.round((new Date(harvest) - new Date(today)) / 86400000) };
      })
      .sort((a, b) => a.daysLeft - b.daysLeft);

    // 8. แผนส่งผักสัปดาห์นี้ — ผลผลิตที่จะเก็บใน 7 วัน เทียบกับออเดอร์/ยอดที่ลูกค้าต้องการ
    const supplyPlots = growingPlots.filter(p => p.daysLeft <= 7);
    const supplyKg = supplyPlots.reduce((s, p) => s + (parseFloat(p.estimated_kg) || 0), 0);

    // วันจันทร์ของสัปดาห์นี้
    const wd = new Date(today); const dow = (wd.getDay() + 6) % 7; wd.setDate(wd.getDate() - dow);
    const weekStart = wd.toISOString().split('T')[0];
    const { data: weekOrdersAll } = await db.from('orders').select('customer_name,kg,delivered,order_date').eq('week_start', weekStart);
    // หักออเดอร์ของวันนี้ออก (โชว์แยกในส่วน "ออเดอร์วันนี้ที่ต้องส่ง") — ไม่บวกซ้ำ
    const weekOrders = (weekOrdersAll || []).filter(o => o.order_date !== today);

    let demandCustomers, demandKg, ordersMode;
    if (weekOrders && weekOrders.length) {
      ordersMode = true;
      demandCustomers = weekOrders.map(o => ({ name: o.customer_name, weekly_kg: o.kg, delivered: o.delivered, type: 'customer' }))
        .sort((a, b) => (b.weekly_kg || 0) - (a.weekly_kg || 0));
      demandKg = weekOrders.reduce((s, o) => s + (parseFloat(o.kg) || 0), 0);
    } else {
      ordersMode = false;
      const { data: customers } = await db.from('customers').select('name,weekly_kg,type');
      demandCustomers = (customers || []).filter(c => parseFloat(c.weekly_kg) > 0)
        .sort((a, b) => (b.weekly_kg || 0) - (a.weekly_kg || 0));
      demandKg = demandCustomers.reduce((s, c) => s + (parseFloat(c.weekly_kg) || 0), 0);
    }

    // 9. ออเดอร์วันนี้ที่ต้องส่ง
    const { data: todayOrders } = await db.from('orders').select('id,customer_name,vegetable_type,kg,delivered').eq('order_date', today);

    // Render
    renderDashboardStats({
      activePlots: activePlots?.length || 0,
      avgSurvival,
      problemPlotsCount: uniqueProblemPlots.length,
      problemPlotsList: uniqueProblemPlots,
      todayTodos: todayTodos || [],
      recentProblems: recentProblems || [],
      chartBatches: (chartBatches || []).reverse(),
      growingPlots,
      weeklyPlan: { supplyKg, demandKg, supplyPlots, demandCustomers, ordersMode },
      todayOrders: todayOrders || []
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

  // Recent problems
  const problemHtml = data.recentProblems.length
    ? data.recentProblems.map(p => `
        <div class="todo-item" style="border-left:3px solid var(--danger)">
          <span class="badge badge-danger">${p.plot_code}</span>
          <div style="flex:1">
            <div style="font-weight:600">${problemLabel(p.problem_type)}</div>
            <div class="text-sub">${formatDateTH(p.problem_date)}</div>
          </div>
          <span class="severity-${p.severity}">${severityLabel(p.severity)}</span>
        </div>`).join('')
    : '<div class="empty-state">ไม่มีปัญหาล่าสุด</div>';
  el('dash-recent-problems').innerHTML = problemHtml;

  // แปลงที่กำลังปลูก + วันเก็บเกี่ยว
  const harvestEl = el('dash-harvest-list');
  if (harvestEl) {
    harvestEl.innerHTML = data.growingPlots.length
      ? data.growingPlots.map(p => {
          const overdue = p.daysLeft < 0;
          const label = overdue ? `เลยกำหนด ${Math.abs(p.daysLeft)} วัน`
                      : p.daysLeft === 0 ? 'เก็บวันนี้' : `อีก ${p.daysLeft} วัน`;
          return `
        <div class="harvest-item ${overdue ? 'overdue' : ''}">
          <span class="badge badge-green">${p.plot_code}</span>
          <div style="flex:1">
            <div style="font-weight:600">${(typeof vegLabelMulti==='function'?vegLabelMulti:vegLabel)(p.vegetable_type)}</div>
            <div class="text-sub">เก็บเกี่ยว ${formatDateTH(p.harvest)}${p.estimated_kg ? ` · คาด ${parseFloat(p.estimated_kg).toLocaleString('th-TH',{maximumFractionDigits:1})} กก.` : ''}</div>
          </div>
          <span class="harvest-tag ${overdue ? 'overdue' : (p.daysLeft <= 2 ? 'soon' : '')}">${label}</span>
        </div>`;
        }).join('')
      : '<div class="empty-state">ยังไม่มีแปลงที่กำลังปลูก</div>';
  }

  // ออเดอร์วันนี้ที่ต้องส่ง
  const toEl = el('dash-today-orders');
  if (toEl) {
    dashTodayOrders = data.todayOrders || [];
    renderTodayOrders();
  }

  // แผนส่งผักสัปดาห์นี้
  dashWeeklyPlan = data.weeklyPlan || null;
  renderWeeklyPlan();

  // Today todos
  const todoHtml = data.todayTodos.length
    ? data.todayTodos.slice(0, 5).map(t => `
        <div class="todo-item ${t.is_done ? 'done' : ''}">
          <span class="todo-text">• ${t.task}</span>
          ${t.is_done ? '✅' : ''}
        </div>`).join('')
    : '<div class="empty-state">ยังไม่มีงานวันนี้</div>';
  el('dash-todos-list').innerHTML = todoHtml;

  // Chart
  renderDashboardChart(data.chartBatches);
}

function renderDashboardChart(batches) {
  const container = document.getElementById('dashChart');
  if (!container) return;

  if (!batches.length) {
    container.innerHTML = '<div class="empty-state">ยังไม่มีข้อมูลเพียงพอสำหรับกราฟ</div>';
    return;
  }

  const labels = batches.map(b => formatDateTH(b.seed_date));
  const kgData = batches.map(b => parseFloat(b.estimated_kg) || 0);
  const seedData = batches.map(b => b.seed_count || 0);

  const W = 600, H = 280;
  const padL = 50, padR = 50, padT = 20, padB = 50;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const n = labels.length;
  const slot = chartW / n;
  const barW = Math.min(38, slot * 0.45);

  const maxKg = Math.max(...kgData, 1) * 1.2;
  const maxSeed = Math.max(...seedData, 1) * 1.2;

  const xFor = i => padL + slot * i + slot / 2;
  const yForKg = v => padT + chartH - (v / maxKg) * chartH;
  const yForSeed = v => padT + chartH - (v / maxSeed) * chartH;

  // Bars
  let bars = '';
  kgData.forEach((v, i) => {
    const x = xFor(i) - barW / 2;
    const y = yForKg(v);
    const h = padT + chartH - y;
    bars += `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="5" fill="#16A34A"/>`;
    bars += `<text x="${xFor(i)}" y="${y - 6}" text-anchor="middle" font-size="11" fill="#1B3A2B" font-weight="700">${v}</text>`;
  });

  // Line
  const points = seedData.map((v, i) => `${xFor(i)},${yForSeed(v)}`).join(' ');
  const areaPoints = `${padL},${padT + chartH} ${points} ${padL + chartW},${padT + chartH}`;
  let dots = '';
  seedData.forEach((v, i) => {
    dots += `<circle cx="${xFor(i)}" cy="${yForSeed(v)}" r="4" fill="#F59E0B"/>`;
    dots += `<text x="${xFor(i)}" y="${yForSeed(v) - 10}" text-anchor="middle" font-size="11" fill="#F59E0B" font-weight="700">${v}</text>`;
  });

  // Gridlines
  let grid = '';
  for (let g = 0; g <= 4; g++) {
    const y = padT + (chartH / 4) * g;
    grid += `<line x1="${padL}" y1="${y}" x2="${padL + chartW}" y2="${y}" stroke="#DDE3D7" stroke-width="1"/>`;
  }

  // X labels
  let xLabels = '';
  labels.forEach((lab, i) => {
    xLabels += `<text x="${xFor(i)}" y="${H - padB + 22}" text-anchor="middle" font-size="11" fill="#6E7A6A">${lab}</text>`;
  });

  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;font-family:var(--font-body)">
      ${grid}
      ${bars}
      <polygon points="${areaPoints}" fill="rgba(192,112,59,0.10)" />
      <polyline points="${points}" fill="none" stroke="#F59E0B" stroke-width="2.5"/>
      ${dots}
      ${xLabels}
    </svg>
    <div style="display:flex;justify-content:center;gap:18px;margin-top:8px;font-size:12px;color:var(--ink-soft)">
      <span><span style="display:inline-block;width:10px;height:10px;background:#16A34A;border-radius:2px;margin-right:5px"></span>คาดการณ์ KG</span>
      <span><span style="display:inline-block;width:10px;height:10px;background:#F59E0B;border-radius:50%;margin-right:5px"></span>จำนวนเมล็ด</span>
    </div>`;
}

// ออเดอร์วันนี้ที่ต้องส่ง — render เฉพาะส่วนนี้ (ไม่โหลดทั้งหน้า)
let dashTodayOrders = [];
function renderTodayOrders() {
  const toEl = document.getElementById('dash-today-orders');
  if (!toEl) return;
  const ords = dashTodayOrders || [];
  const VEG = { green_oak:'กรีนโอ๊ค', red_oak:'เรดโอ๊ค', finley:'ฟินเลย์', cos:'คอส', butterhead:'บัตเตอร์เฮด' };
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

// แผนส่งผักสัปดาห์นี้ — render เฉพาะส่วนนี้ (หักออเดอร์วันนี้ที่ส่งแล้วออกจากยอดสัปดาห์)
let dashWeeklyPlan = null;
function renderWeeklyPlan() {
  const wkEl = document.getElementById('dash-weekly-plan');
  if (!wkEl || !dashWeeklyPlan) return;
  const { supplyKg, demandKg, demandCustomers, ordersMode } = dashWeeklyPlan;
  const kg = n => n.toLocaleString('th-TH', { maximumFractionDigits: 1 });
  // ออเดอร์วันนี้ที่ "ส่งแล้ว" → หักออกจากยอดสัปดาห์
  const deliveredToday = (dashTodayOrders || []).filter(o => o.delivered)
    .reduce((s, o) => s + parseFloat(o.kg || 0), 0);
  const remainDemand = Math.max(0, demandKg - deliveredToday);
  const balance = supplyKg - remainDemand;
  const balanceTxt = balance >= 0
    ? `<span style="color:var(--primary)">เหลือขาย ${kg(balance)} กก.</span>`
    : `<span style="color:var(--danger)">ขาดอีก ${kg(-balance)} กก.</span>`;
  const demandLabel = ordersMode ? '📦 ลูกค้าสั่ง (สัปดาห์นี้)' : '📦 ลูกค้าต้องการ/สัปดาห์';
  const deliveredRow = deliveredToday > 0
    ? `<div class="savings-row"><span>✅ ส่งแล้ววันนี้</span><b style="color:var(--primary)">− ${kg(deliveredToday)} กก.</b></div>
       <div class="savings-row"><span>คงเหลือต้องส่ง</span><b style="color:var(--accent)">${kg(remainDemand)} กก.</b></div>`
    : '';
  const custList = demandCustomers.length
    ? demandCustomers.map(c => `
      <div class="pe-row">
        <span class="pe-desc">${c.delivered ? '✅ ' : (c.type === 'farm' ? '🚜 ' : '🧺 ')}${c.name}</span>
        <span class="pe-amt" style="color:var(--accent)">${kg(parseFloat(c.weekly_kg))} กก.</span>
      </div>`).join('')
    : `<div class="text-sub" style="padding:8px 0">${ordersMode ? '' : 'ยังไม่มีลูกค้าที่ระบุยอด/สัปดาห์'}</div>`;
  wkEl.innerHTML = `
    <div class="savings-card" style="padding:14px 0">
      <div class="savings-row"><span>🌿 ผักที่จะเก็บได้ (ใน 7 วัน)</span><b style="color:var(--primary)">${kg(supplyKg)} กก.</b></div>
      <div class="savings-row"><span>${demandLabel}</span><b style="color:var(--accent)">${kg(demandKg)} กก.</b></div>
      ${deliveredRow}
      <div class="savings-divider"></div>
      <div class="savings-row savings-total"><span>สรุป</span><span>${balanceTxt}</span></div>
    </div>
    <div class="text-sub" style="margin:10px 0 4px;font-weight:700">รายชื่อที่ต้องส่ง ${ordersMode ? '' : '<span style="font-weight:400">(ตั้งออเดอร์รายสัปดาห์ได้ที่หน้าลูกค้า)</span>'}</div>
    <div class="card" style="padding:4px 14px">${custList}</div>`;
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
  }
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

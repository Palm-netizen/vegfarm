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

    // 7. ใกล้เก็บเกี่ยว — ภายใน 7 วัน หรือเลยกำหนดแล้ว (ยังไม่เก็บ)
    const { data: pendingPlots } = await db
      .from('plots')
      .select('*')
      .eq('is_harvested', false)
      .not('harvest_date', 'is', null);
    const horizon = new Date(); horizon.setDate(horizon.getDate() + 7);
    const horizonStr = horizon.toISOString().split('T')[0];
    const upcomingHarvest = (pendingPlots || [])
      .filter(p => p.harvest_date <= horizonStr)
      .map(p => ({ ...p, daysLeft: Math.round((new Date(p.harvest_date) - new Date(today)) / 86400000) }))
      .sort((a, b) => a.daysLeft - b.daysLeft);

    // Render
    renderDashboardStats({
      activePlots: activePlots?.length || 0,
      avgSurvival,
      problemPlotsCount: uniqueProblemPlots.length,
      problemPlotsList: uniqueProblemPlots,
      todayTodos: todayTodos || [],
      recentProblems: recentProblems || [],
      chartBatches: (chartBatches || []).reverse(),
      upcomingHarvest
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

  // Upcoming harvest
  const harvestEl = el('dash-harvest-list');
  if (harvestEl) {
    harvestEl.innerHTML = data.upcomingHarvest.length
      ? data.upcomingHarvest.map(p => {
          const overdue = p.daysLeft < 0;
          const label = overdue ? `เลยกำหนด ${Math.abs(p.daysLeft)} วัน`
                      : p.daysLeft === 0 ? 'วันนี้' : `อีก ${p.daysLeft} วัน`;
          return `
        <div class="harvest-item ${overdue ? 'overdue' : ''}">
          <span class="badge badge-green">${p.plot_code}</span>
          <div style="flex:1">
            <div style="font-weight:600">${vegLabel(p.vegetable_type)}</div>
            <div class="text-sub">เก็บเกี่ยว ${formatDateTH(p.harvest_date)}</div>
          </div>
          <span class="harvest-tag ${overdue ? 'overdue' : (p.daysLeft <= 2 ? 'soon' : '')}">${label}</span>
        </div>`;
        }).join('')
      : '<div class="empty-state">ยังไม่มีแปลงใกล้เก็บเกี่ยว</div>';
  }

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

// ===== Helpers =====
function problemIcon(type) {
  const icons = { burned_leaf: '🔥', root_rot: '🦠', worm: '🐛', fungus: '🍄', other: '⚠️' };
  return icons[type] || '⚠️';
}
function problemLabel(type) {
  const labels = { burned_leaf: 'ใบไหม้', root_rot: 'รากเน่า', worm: 'หนอน', fungus: 'เชื้อรา', other: 'อื่นๆ' };
  return labels[type] || type;
}
function severityLabel(s) {
  return { low: 'เบา', medium: 'ปานกลาง', high: 'รุนแรง' }[s] || s;
}

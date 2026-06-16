// js/problems.js — บันทึกปัญหา + ฐานข้อมูลปัญหา

let problemPhotoFile = null;

function initProblems() {
  // Populate plot select T1-T15
  const sel = document.getElementById('problem-plot-select');
  sel.innerHTML = '<option value="">-- เลือกแปลง --</option>' +
    Array.from({ length: 15 }, (_, i) => `<option value="T${i + 1}">T${i + 1}</option>`).join('');

  document.getElementById('problem-date').value = new Date().toISOString().split('T')[0];

  sel.addEventListener('change', () => loadPlotCycleInfo(sel.value));

  document.getElementById('problem-photo-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    problemPhotoFile = file;
    const reader = new FileReader();
    reader.onload = (ev) => {
      document.getElementById('problem-photo-preview').src = ev.target.result;
      document.getElementById('problem-photo-preview').style.display = 'block';
    };
    reader.readAsDataURL(file);
  });

  // Severity buttons
  document.querySelectorAll('.severity-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.severity-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      document.getElementById('problem-severity-value').value = btn.dataset.value;
    });
  });

  // Problem type buttons
  document.querySelectorAll('.problem-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.problem-type-btn').forEach(b => b.classList.remove('checked'));
      btn.classList.add('checked');
      document.getElementById('problem-type-value').value = btn.dataset.value;
    });
  });

  loadProblemDatabase();
}

async function loadPlotCycleInfo(code) {
  if (!code) {
    document.getElementById('problem-plot-info').innerHTML = '';
    return;
  }
  const { data: plot } = await db.from('plots').select('*').eq('plot_code', code).single();
  const { data: cycles } = await db.from('plot_cycles').select('actual_kg').eq('plot_code', code);

  const totalHarvested = cycles?.reduce((s, c) => s + (parseFloat(c.actual_kg) || 0), 0) || 0;

  document.getElementById('problem-plot-info').innerHTML = `
    <div class="card" style="background:var(--primary-tint);padding:10px;margin-top:8px">
      <div class="text-sub">แปลง ${code} • รอบปลูกที่ <strong>${plot?.cycle_count || 1}</strong> • เก็บเกี่ยวรวม <strong>${totalHarvested.toFixed(1)} kg</strong></div>
    </div>`;
}

async function saveProblem() {
  const plotCode = document.getElementById('problem-plot-select').value;
  const date = document.getElementById('problem-date').value;
  const type = document.getElementById('problem-type-value').value;
  const severity = document.getElementById('problem-severity-value').value;
  const description = document.getElementById('problem-description').value;
  const solution = document.getElementById('problem-solution').value;

  if (!plotCode) return showToast('กรุณาเลือกแปลง', 'error');
  if (!date) return showToast('กรุณาระบุวันที่', 'error');
  if (!type) return showToast('กรุณาเลือกประเภทปัญหา', 'error');
  if (!severity) return showToast('กรุณาระบุความรุนแรง', 'error');

  setLoading(true);
  try {
    let photoUrl = null;
    if (problemPhotoFile) {
      const fileName = `problems/${Date.now()}_${problemPhotoFile.name}`;
      const { data: uploadData, error: uploadErr } = await db.storage
        .from('photos')
        .upload(fileName, problemPhotoFile);
      if (!uploadErr) {
        const { data: urlData } = db.storage.from('photos').getPublicUrl(fileName);
        photoUrl = urlData.publicUrl;
      }
    }

    const { data: plot } = await db.from('plots').select('cycle_count').eq('plot_code', plotCode).single();

    await db.from('problems').insert({
      plot_code: plotCode,
      problem_date: date,
      problem_type: type,
      severity,
      description,
      solution,
      photo_url: photoUrl,
      cycle_number: plot?.cycle_count || 1
    });

    await db.from('calendar_activities').insert({
      activity_date: date,
      activity_type: 'problem',
      plot_code: plotCode,
      summary: `ปัญหา${problemTypeLabel(type)} แปลง ${plotCode}`
    });

    showToast('บันทึกปัญหาสำเร็จ');
    resetProblemForm();
    loadProblemDatabase();
  } catch (err) {
    console.error(err);
    showToast('บันทึกไม่สำเร็จ', 'error');
  } finally {
    setLoading(false);
  }
}

function resetProblemForm() {
  document.getElementById('problem-plot-select').value = '';
  document.getElementById('problem-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('problem-description').value = '';
  document.getElementById('problem-solution').value = '';
  document.getElementById('problem-photo-input').value = '';
  document.getElementById('problem-photo-preview').style.display = 'none';
  document.getElementById('problem-type-value').value = '';
  document.getElementById('problem-severity-value').value = '';
  document.getElementById('problem-plot-info').innerHTML = '';
  document.querySelectorAll('.problem-type-btn').forEach(b => b.classList.remove('checked'));
  document.querySelectorAll('.severity-btn').forEach(b => b.classList.remove('selected'));
  problemPhotoFile = null;
}

async function loadProblemDatabase() {
  const { data: all } = await db
    .from('problems')
    .select('*')
    .order('problem_date', { ascending: false });

  const container = document.getElementById('problem-db-list');

  // Read search + filter controls
  const q = (document.getElementById('prob-search')?.value || '').trim().toLowerCase();
  const fType = document.getElementById('prob-filter-type')?.value || '';
  const fSev = document.getElementById('prob-filter-sev')?.value || '';
  const fStatus = document.getElementById('prob-filter-status')?.value || '';

  const problems = (all || []).filter(p => {
    if (fType && p.problem_type !== fType) return false;
    if (fSev && p.severity !== fSev) return false;
    if (fStatus === 'open' && p.resolved) return false;
    if (fStatus === 'resolved' && !p.resolved) return false;
    if (q) {
      const hay = `${p.plot_code} ${problemTypeLabel(p.problem_type)} ${p.description || ''} ${p.solution || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (!all?.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div>ยังไม่มีบันทึกปัญหา</div>';
    return;
  }
  if (!problems.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div>ไม่พบรายการที่ตรงกับเงื่อนไข</div>';
    return;
  }

  container.innerHTML = problems.map(p => `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div>
          <span class="badge badge-green">${p.plot_code}</span>
          <strong style="margin-left:6px">${problemTypeLabel(p.problem_type)}</strong>
        </div>
        <span class="severity-${p.severity}">${severityLabel2(p.severity)}</span>
      </div>
      <div class="text-sub" style="margin:8px 0">${formatDateTH(p.problem_date)} · รอบที่ ${p.cycle_number || 1}</div>
      ${p.description ? `<div style="margin-bottom:6px"><strong>อาการ:</strong> ${p.description}</div>` : ''}
      ${p.solution ? `<div style="margin-bottom:6px"><strong>วิธีแก้:</strong> ${p.solution}</div>` : ''}
      ${p.photo_url ? `<img src="${p.photo_url}" style="width:100%;border-radius:var(--radius-sm);margin-top:8px" />` : ''}
      <div style="display:flex;gap:6px;margin-top:10px;justify-content:flex-end">
        <button class="btn btn-outline btn-sm" onclick="toggleResolved('${p.id}', ${!p.resolved})">${p.resolved ? 'ยังไม่แก้' : 'แก้แล้ว'}</button>
        <button class="btn btn-danger btn-sm" onclick="deleteProblem('${p.id}')">ลบ</button>
      </div>
    </div>`).join('');
}

async function toggleResolved(id, resolved) {
  await db.from('problems').update({ resolved }).eq('id', id);
  loadProblemDatabase();
}

async function deleteProblem(id) {
  if (!confirm('ลบรายการนี้ใช่ไหม?')) return;
  await db.from('problems').delete().eq('id', id);
  showToast('ลบแล้ว');
  loadProblemDatabase();
}

function problemIcon2(type) {
  return { burned_leaf: '🔥', root_rot: '🦠', worm: '🐛', fungus: '🍄', other: '⚠️' }[type] || '⚠️';
}
function problemTypeLabel(type) {
  return { burned_leaf: 'ใบไหม้', root_rot: 'รากเน่า', worm: 'หนอน', fungus: 'เชื้อรา', other: 'อื่นๆ' }[type] || type;
}
function severityLabel2(s) {
  return { low: 'เบา', medium: 'ปานกลาง', high: 'รุนแรง' }[s] || s;
}

// js/problems.js — บันทึกปัญหา + ฐานข้อมูลปัญหา

let problemPhotoDataUrl = null;
let editProblemId = null;

// ย่อรูปในเครื่องก่อนบันทึก (เร็วขึ้นมาก + แสดงได้เสมอเพราะเก็บเป็น data URL)
function compressImage(file, maxDim = 1280, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) { height = Math.round(height * maxDim / width); width = maxDim; }
        else if (height >= width && height > maxDim) { width = Math.round(width * maxDim / height); height = maxDim; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function initProblems() {
  // Populate plot select T1-T15
  const sel = document.getElementById('problem-plot-select');
  sel.innerHTML = '<option value="">-- เลือกแปลง --</option>' +
    Array.from({ length: 15 }, (_, i) => `<option value="T${i + 1}">T${i + 1}</option>`).join('');

  document.getElementById('problem-date').value = new Date().toISOString().split('T')[0];

  sel.addEventListener('change', () => loadPlotCycleInfo(sel.value));

  document.getElementById('problem-photo-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      problemPhotoDataUrl = await compressImage(file);
      const prev = document.getElementById('problem-photo-preview');
      prev.src = problemPhotoDataUrl;
      prev.style.display = 'block';
    } catch (err) {
      console.error(err);
      showToast('อ่านรูปไม่สำเร็จ', 'error');
    }
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
    // เก็บรูปเป็น data URL (ย่อแล้วในขั้นเลือกรูป) — บันทึกเร็ว และแสดงย้อนหลังได้เสมอ
    const photoUrl = problemPhotoDataUrl || null;

    if (editProblemId) {
      // แก้ไขรายการเดิม
      const patch = { plot_code: plotCode, problem_date: date, problem_type: type, severity, description, solution, photo_url: photoUrl };
      const { error } = await db.from('problems').update(patch).eq('id', editProblemId);
      if (error) throw error;
      showToast('แก้ไขปัญหาสำเร็จ');
    } else {
      const { data: plot } = await db.from('plots').select('cycle_count').eq('plot_code', plotCode).single();

      const { error } = await db.from('problems').insert({
        plot_code: plotCode,
        problem_date: date,
        problem_type: type,
        severity,
        description,
        solution,
        photo_url: photoUrl,
        cycle_number: plot?.cycle_count || 1
      });
      if (error) throw error;

      await db.from('calendar_activities').insert({
        activity_date: date,
        activity_type: 'problem',
        plot_code: plotCode,
        summary: `ปัญหา${problemTypeLabel(type)} แปลง ${plotCode}`
      });

      showToast('บันทึกปัญหาสำเร็จ');
    }
    resetProblemForm();
    loadProblemDatabase();
  } catch (err) {
    console.error(err);
    showToast('บันทึกไม่สำเร็จ: ' + (err.message || err), 'error');
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
  problemPhotoDataUrl = null;
  editProblemId = null;
  document.getElementById('problem-save-btn').textContent = 'บันทึกปัญหา';
  document.getElementById('problem-cancel-edit').style.display = 'none';
}

// โหลดปัญหาเดิมขึ้นฟอร์มเพื่อแก้ไข
async function editProblem(id) {
  const { data: p } = await db.from('problems').select('*').eq('id', id).single();
  if (!p) return;
  editProblemId = id;
  document.getElementById('problem-plot-select').value = p.plot_code || '';
  loadPlotCycleInfo(p.plot_code);
  document.getElementById('problem-date').value = p.problem_date || '';
  document.getElementById('problem-description').value = p.description || '';
  document.getElementById('problem-solution').value = p.solution || '';
  // เลือกปุ่มประเภทปัญหา
  document.getElementById('problem-type-value').value = p.problem_type || '';
  document.querySelectorAll('.problem-type-btn').forEach(b =>
    b.classList.toggle('checked', b.dataset.value === p.problem_type));
  // เลือกปุ่มความรุนแรง
  document.getElementById('problem-severity-value').value = p.severity || '';
  document.querySelectorAll('.severity-btn').forEach(b =>
    b.classList.toggle('selected', b.dataset.value === p.severity));
  // รูปเดิม — เก็บไว้ใช้ต่อถ้าไม่ได้เลือกรูปใหม่
  const prev = document.getElementById('problem-photo-preview');
  problemPhotoDataUrl = p.photo_url || null;
  if (p.photo_url) { prev.src = p.photo_url; prev.style.display = 'block'; }
  else { prev.style.display = 'none'; }
  document.getElementById('problem-photo-input').value = '';
  document.getElementById('problem-save-btn').textContent = 'บันทึกการแก้ไข';
  document.getElementById('problem-cancel-edit').style.display = 'block';
  document.getElementById('page-problems').scrollIntoView({ behavior: 'smooth' });
}

function cancelEditProblem() {
  resetProblemForm();
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

  lastProblems = problems;   // เก็บไว้ให้ป๊อปอัพดูรายละเอียด
  container.innerHTML = problems.map(p => `
    <div class="card" style="cursor:pointer" onclick="openProblemDetail('${p.id}')">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div>
          <span class="badge badge-green">${p.plot_code}</span>
          <strong style="margin-left:6px">${problemIcon2(p.problem_type)} ${problemTypeLabel(p.problem_type)}</strong>
          ${p.resolved ? '<span class="badge" style="margin-left:6px;background:var(--primary-tint-strong);color:var(--primary-dark)">แก้แล้ว</span>' : ''}
        </div>
        <span class="severity-${p.severity}">${severityLabel2(p.severity)}</span>
      </div>
      <div class="text-sub" style="margin:8px 0 2px">${formatDateTH(p.problem_date)} · รอบที่ ${p.cycle_number || 1}${p.photo_url ? ' · 📷 มีรูป' : ''}${(Array.isArray(p.followups) && p.followups.length) ? ` · 📌 ติดตาม ${p.followups.length} ครั้ง` : ''}</div>
      ${p.description ? `<div class="text-sub" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.description}</div>` : ''}
      <div style="display:flex;gap:6px;margin-top:10px;justify-content:flex-end" onclick="event.stopPropagation()">
        <button class="btn btn-outline btn-sm" onclick="toggleResolved('${p.id}', ${!p.resolved})">${p.resolved ? 'ยังไม่แก้' : 'แก้แล้ว'}</button>
        <button class="btn btn-outline btn-sm" onclick="editProblem('${p.id}')">✎ แก้ไข</button>
        <button class="btn btn-danger btn-sm" onclick="deleteProblem('${p.id}')">ลบ</button>
      </div>
    </div>`).join('');
}

// ป๊อปอัพดูรายละเอียดปัญหาย้อนหลัง (ข้อความ + รูปเต็ม)
let lastProblems = [];
let currentDetailProblem = null;
let followupPhotos = [null, null];   // data URL ของรูปติดตามผล (สูงสุด 2 รูป)
const MAX_FOLLOWUPS = 3;

function openProblemDetail(id) {
  const p = lastProblems.find(x => x.id === id);
  if (!p) return;
  currentDetailProblem = p;
  followupPhotos = [null, null];
  renderProblemDetailBody(p);
  document.getElementById('prob-detail-modal').style.display = 'flex';
}

function renderProblemDetailBody(p) {
  document.getElementById('prob-detail-title').innerHTML =
    `${problemIcon2(p.problem_type)} ${problemTypeLabel(p.problem_type)}`;

  const fus = Array.isArray(p.followups) ? p.followups : [];
  const fuListHtml = fus.length
    ? fus.map((f, i) => `
      <div class="fu-item">
        <div class="fu-head">📌 ติดตามผลครั้งที่ ${i + 1} · ${f.date ? formatDateTH(f.date) : '-'}</div>
        ${f.detail ? `<div class="pds-text" style="margin-top:4px">${f.detail}</div>` : ''}
        ${(f.photos && f.photos.length) ? `<div class="fu-photos">${f.photos.map(ph => `<img src="${ph}" />`).join('')}</div>` : ''}
      </div>`).join('')
    : '<div class="text-sub">ยังไม่มีการติดตามผล</div>';

  const formHtml = fus.length < MAX_FOLLOWUPS ? `
    <button id="fu-add-btn" class="btn btn-outline btn-sm" style="margin-top:10px" onclick="showFollowupForm()">➕ ติดตามผล (ครั้งที่ ${fus.length + 1}/${MAX_FOLLOWUPS})</button>
    <div id="fu-form" style="display:none;margin-top:10px">
      <div class="form-group" style="margin-bottom:8px">
        <label class="form-label">วันที่ติดตามผล</label>
        <input type="date" id="fu-date" class="form-control">
      </div>
      <div class="form-group" style="margin-bottom:8px">
        <label class="form-label">วิธีแก้ไขเพิ่มเติม / ผลที่ได้</label>
        <textarea id="fu-detail" class="form-control" placeholder="บันทึกผลหลังแก้ไข หรือวิธีที่ทำเพิ่ม..."></textarea>
      </div>
      <div class="form-group" style="margin-bottom:8px">
        <label class="form-label">รูป (สูงสุด 2 รูป)</label>
        <input type="file" id="fu-photo-0" class="form-control" accept="image/*" capture="environment" onchange="onFollowupPhoto(0,this)" style="margin-bottom:6px">
        <input type="file" id="fu-photo-1" class="form-control" accept="image/*" capture="environment" onchange="onFollowupPhoto(1,this)">
        <div id="fu-photo-preview" style="display:flex;gap:6px;margin-top:8px"></div>
      </div>
      <button class="btn btn-primary btn-sm" style="width:100%" onclick="saveFollowup()">บันทึกติดตามผล</button>
    </div>`
    : '<div class="text-sub" style="margin-top:10px">✅ ติดตามผลครบ 3 ครั้งแล้ว</div>';

  document.getElementById('prob-detail-body').innerHTML = `
    <div class="prob-detail-meta">
      <span class="badge badge-green">${p.plot_code}</span>
      <span class="severity-${p.severity}">${severityLabel2(p.severity)}</span>
      ${p.resolved ? '<span class="badge" style="background:var(--primary-tint-strong);color:var(--primary-dark)">แก้แล้ว</span>' : '<span class="badge" style="background:var(--bg);color:var(--ink-soft)">ยังไม่แก้</span>'}
    </div>
    <div class="text-sub" style="margin:8px 0 14px">${formatDateTH(p.problem_date)} · รอบที่ ${p.cycle_number || 1}</div>
    <div class="prob-detail-section"><div class="pds-label">อาการ</div><div class="pds-text">${p.description ? p.description : '<span class="text-sub">— ไม่ได้ระบุ —</span>'}</div></div>
    <div class="prob-detail-section"><div class="pds-label">วิธีแก้</div><div class="pds-text">${p.solution ? p.solution : '<span class="text-sub">— ไม่ได้ระบุ —</span>'}</div></div>
    ${p.photo_url ? `<img src="${p.photo_url}" style="width:100%;border-radius:var(--radius-sm);margin-top:8px" />` : ''}
    <div class="growth-divider" style="margin:18px 0 10px"><span class="gd-label">การติดตามผล (${fus.length}/${MAX_FOLLOWUPS})</span></div>
    <div class="fu-list">${fuListHtml}</div>
    ${formHtml}`;
}

function showFollowupForm() {
  const btn = document.getElementById('fu-add-btn');
  const form = document.getElementById('fu-form');
  if (btn) btn.style.display = 'none';
  if (form) form.style.display = 'block';
  const d = document.getElementById('fu-date');
  if (d && !d.value) d.value = new Date().toISOString().split('T')[0];
}

async function onFollowupPhoto(idx, input) {
  const file = input.files[0];
  if (!file) { followupPhotos[idx] = null; renderFollowupPreview(); return; }
  try {
    followupPhotos[idx] = await compressImage(file, 1024, 0.6);  // ไฟล์เล็ก
    renderFollowupPreview();
  } catch (err) {
    console.error(err);
    showToast('อ่านรูปไม่สำเร็จ', 'error');
  }
}

function renderFollowupPreview() {
  const el = document.getElementById('fu-photo-preview');
  if (!el) return;
  el.innerHTML = followupPhotos.filter(Boolean)
    .map(ph => `<img src="${ph}" style="width:64px;height:64px;object-fit:cover;border-radius:8px">`).join('');
}

async function saveFollowup() {
  if (!currentDetailProblem) return;
  const date = document.getElementById('fu-date').value;
  const detail = document.getElementById('fu-detail').value.trim();
  const photos = followupPhotos.filter(Boolean);
  if (!date) return showToast('กรุณาระบุวันที่ติดตามผล', 'error');
  if (!detail && !photos.length) return showToast('กรุณากรอกรายละเอียดหรือแนบรูป', 'error');

  const fus = Array.isArray(currentDetailProblem.followups) ? currentDetailProblem.followups : [];
  if (fus.length >= MAX_FOLLOWUPS) return showToast('ติดตามผลครบ 3 ครั้งแล้ว', 'error');

  const newFus = [...fus, { date, detail, photos }];
  setLoading(true);
  try {
    const { error } = await db.from('problems').update({ followups: newFus }).eq('id', currentDetailProblem.id);
    if (error) throw error;
    showToast('บันทึกติดตามผลแล้ว');
    const id = currentDetailProblem.id;
    await loadProblemDatabase();          // refresh list + lastProblems
    openProblemDetail(id);                // re-render popup จากข้อมูลล่าสุด
  } catch (err) {
    console.error(err);
    showToast('บันทึกไม่สำเร็จ: ' + (err.message || err), 'error');
  } finally {
    setLoading(false);
  }
}

function closeProblemDetail() {
  document.getElementById('prob-detail-modal').style.display = 'none';
}

async function toggleResolved(id, resolved) {
  await db.from('problems').update({ resolved }).eq('id', id);
  loadProblemDatabase();
}

async function deleteProblem(id) {
  if (!(await vfConfirm('ลบรายการนี้ใช่ไหม?', { okLabel: 'ลบ' }))) return;
  await db.from('problems').delete().eq('id', id);
  showToast('ลบแล้ว');
  loadProblemDatabase();
}

function problemIcon2(type) {
  return { burned_leaf: '🔥', waterlogged: '💧', root_rot: '🦠', worm: '🐛', fungus: '🍄', other: '⚠️' }[type] || '⚠️';
}
function problemTypeLabel(type) {
  return { burned_leaf: 'ใบไหม้', waterlogged: 'ใบอิ่มน้ำ', root_rot: 'รากเน่า', worm: 'หนอน', fungus: 'เชื้อรา', other: 'อื่นๆ' }[type] || type;
}
function severityLabel2(s) {
  return { low: 'เบา', medium: 'ปานกลาง', high: 'รุนแรง' }[s] || s;
}

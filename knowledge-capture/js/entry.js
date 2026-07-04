// js/entry.js — Entry (note) form modal: create / edit / delete a reading record

let entryPhotoExisting = [null, null]; // existing image URLs kept when editing, index 0/1

function renderHighlightFields(values) {
  const wrap = document.getElementById('entry-highlights');
  wrap.innerHTML = '';
  values.forEach((val, i) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;align-items:center';
    row.innerHTML = `
      <input type="text" class="form-control entry-highlight-input" data-idx="${i}" value="${escapeHTML(val)}" placeholder="ไฮไลท์ข้อที่ ${i + 1}">
      ${values.length > 1 ? `<span class="btn-icon" onclick="removeHighlightField(${i})">✕</span>` : ''}
    `;
    wrap.appendChild(row);
  });
}

function getCurrentHighlightValues() {
  return Array.from(document.querySelectorAll('.entry-highlight-input')).map(i => i.value);
}

function addHighlightField() {
  const values = getCurrentHighlightValues();
  if (values.length >= 5) { showToast('เพิ่มได้สูงสุด 5 ข้อ', 'warn'); return; }
  values.push('');
  renderHighlightFields(values);
}

function removeHighlightField(idx) {
  const values = getCurrentHighlightValues();
  values.splice(idx, 1);
  renderHighlightFields(values.length ? values : ['']);
}

function getHighlightsFromForm() {
  return getCurrentHighlightValues().map(v => v.trim()).filter(Boolean).slice(0, 5);
}

// ---- Tags ------------------------------------------------------

function renderPresetTags(selected) {
  const wrap = document.getElementById('entry-preset-tags');
  wrap.innerHTML = PRESET_TAGS.map(tag => `
    <label class="checkbox-item ${selected.includes(tag) ? 'checked' : ''}" data-tag="${escapeHTML(tag)}">
      <input type="checkbox" value="${escapeHTML(tag)}" ${selected.includes(tag) ? 'checked' : ''} onchange="this.closest('.checkbox-item').classList.toggle('checked', this.checked)">
      ${escapeHTML(tag)}
    </label>
  `).join('');
}

let entryCustomTags = [];

function renderCustomTags() {
  const wrap = document.getElementById('entry-custom-tags');
  wrap.innerHTML = entryCustomTags.map((tag, i) => `
    <span class="tag-chip">${escapeHTML(tag)} <span class="tag-x" onclick="removeCustomTag(${i})">✕</span></span>
  `).join('');
}

function removeCustomTag(i) {
  entryCustomTags.splice(i, 1);
  renderCustomTags();
}

function getTagsFromForm() {
  const preset = Array.from(document.querySelectorAll('#entry-preset-tags input:checked')).map(i => i.value);
  return [...new Set([...preset, ...entryCustomTags])];
}

document.addEventListener('DOMContentLoaded', () => {
  const tagInput = document.getElementById('entry-tag-input');
  tagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = tagInput.value.trim();
      if (val && !entryCustomTags.includes(val) && !PRESET_TAGS.includes(val)) {
        entryCustomTags.push(val);
        renderCustomTags();
      }
      tagInput.value = '';
    }
  });
});

// ---- Stars -------------------------------------------------------

function renderStarPicker(level) {
  const wrap = document.getElementById('entry-stars');
  wrap.innerHTML = '';
  for (let i = 1; i <= 5; i++) {
    const s = document.createElement('span');
    s.className = 'star' + (i <= level ? ' filled' : '');
    s.textContent = i <= level ? '★' : '☆';
    s.onclick = () => { document.getElementById('entry-importance').value = i; renderStarPicker(i); };
    wrap.appendChild(s);
  }
}

// ---- Action done toggle -------------------------------------------

function toggleActionDone(e) {
  if (e.target.tagName === 'INPUT') return;
  const cb = document.getElementById('entry-action-done');
  cb.checked = !cb.checked;
}

// ---- Photos --------------------------------------------------------

function renderPhotoPreview() {
  const wrap = document.getElementById('entry-photo-preview');
  wrap.innerHTML = entryPhotoExisting.map((url, i) => url ? `
    <div style="position:relative">
      <img src="${url}" style="width:64px;height:64px;object-fit:cover;border-radius:10px;border:1px solid var(--line)">
      <span class="btn-icon" style="position:absolute;top:-8px;right:-8px;background:var(--danger);color:#fff;border-radius:50%;width:22px;height:22px;padding:0" onclick="entryPhotoExisting[${i}]=null;renderPhotoPreview()">✕</span>
    </div>
  ` : '').join('');
}

// ---- Open / close --------------------------------------------------

async function openEntryForm(dateStr, noteId) {
  document.getElementById('entry-id').value = noteId || '';
  document.getElementById('entry-book').value = '';
  document.getElementById('entry-date').value = dateStr || todayStr();
  document.getElementById('entry-insight').value = '';
  document.getElementById('entry-action').value = '';
  document.getElementById('entry-action-done').checked = false;
  document.getElementById('entry-importance').value = 3;
  document.getElementById('entry-photo-1').value = '';
  document.getElementById('entry-photo-2').value = '';
  entryPhotoExisting = [null, null];
  entryCustomTags = [];
  renderHighlightFields(['']);
  renderStarPicker(3);
  renderPresetTags([]);
  renderCustomTags();
  renderPhotoPreview();
  document.getElementById('entry-delete-btn').classList.add('hidden');
  document.getElementById('entry-modal-title').textContent = 'บันทึกการอ่านเล่มใหม่';

  if (noteId) {
    setLoading(true);
    const { data, error } = await db.from('notes').select('*').eq('id', noteId).single();
    setLoading(false);
    if (error) { showToast('โหลดข้อมูลไม่สำเร็จ', 'error'); return; }
    document.getElementById('entry-book').value = data.book_title;
    document.getElementById('entry-date').value = data.read_date;
    document.getElementById('entry-insight').value = data.insight || '';
    document.getElementById('entry-action').value = data.action || '';
    document.getElementById('entry-action-done').checked = !!data.action_done;
    document.getElementById('entry-importance').value = data.importance;
    renderHighlightFields(data.highlights?.length ? data.highlights : ['']);
    renderStarPicker(data.importance);
    entryCustomTags = (data.tags || []).filter(t => !PRESET_TAGS.includes(t));
    renderPresetTags(data.tags || []);
    renderCustomTags();
    entryPhotoExisting = [data.image_urls?.[0] || null, data.image_urls?.[1] || null];
    renderPhotoPreview();
    document.getElementById('entry-delete-btn').classList.remove('hidden');
    document.getElementById('entry-modal-title').textContent = 'แก้ไขบันทึกการอ่าน';
  }

  document.getElementById('entry-modal').style.display = 'flex';
}

function closeEntryForm() {
  document.getElementById('entry-modal').style.display = 'none';
}

async function saveEntry() {
  const id = document.getElementById('entry-id').value;
  const book = document.getElementById('entry-book').value.trim();
  const date = document.getElementById('entry-date').value;
  const highlights = getHighlightsFromForm();
  const insight = document.getElementById('entry-insight').value.trim();
  const action = document.getElementById('entry-action').value.trim();
  const actionDone = document.getElementById('entry-action-done').checked;
  const importance = parseInt(document.getElementById('entry-importance').value, 10);
  const tags = getTagsFromForm();

  if (!book) { showToast('กรุณาใส่ชื่อหนังสือ', 'warn'); return; }
  if (!date) { showToast('กรุณาเลือกวันที่อ่าน', 'warn'); return; }
  if (!highlights.length) { showToast('กรุณาใส่ไฮไลท์อย่างน้อย 1 ข้อ', 'warn'); return; }

  setLoading(true);
  try {
    const imageUrls = [...entryPhotoExisting];
    const file1 = document.getElementById('entry-photo-1').files[0];
    const file2 = document.getElementById('entry-photo-2').files[0];
    if (file1) imageUrls[0] = await uploadNoteImage(file1);
    if (file2) imageUrls[1] = await uploadNoteImage(file2);
    const finalImageUrls = imageUrls.filter(Boolean).slice(0, 2);

    const payload = {
      book_title: book,
      read_date: date,
      highlights,
      insight,
      action,
      action_done: actionDone,
      importance,
      tags,
      image_urls: finalImageUrls
    };

    let error;
    if (id) {
      ({ error } = await db.from('notes').update(payload).eq('id', id));
    } else {
      ({ error } = await db.from('notes').insert(payload));
    }
    if (error) throw error;

    showToast('บันทึกสำเร็จ');
    closeEntryForm();
    await refreshAfterEntryChange(date);
  } catch (err) {
    console.error(err);
    showToast('บันทึกไม่สำเร็จ: ' + (err.message || err), 'error');
  } finally {
    setLoading(false);
  }
}

async function deleteEntry() {
  const id = document.getElementById('entry-id').value;
  if (!id) return;
  if (!confirm('ลบบันทึกนี้ใช่หรือไม่?')) return;
  const date = document.getElementById('entry-date').value;
  setLoading(true);
  const { error } = await db.from('notes').delete().eq('id', id);
  setLoading(false);
  if (error) { showToast('ลบไม่สำเร็จ', 'error'); return; }
  showToast('ลบบันทึกแล้ว');
  closeEntryForm();
  await refreshAfterEntryChange(date);
}

async function refreshAfterEntryChange(date) {
  if (typeof renderCalendar === 'function') await renderCalendar();
  if (typeof currentModalDate !== 'undefined' && currentModalDate && document.getElementById('day-modal').style.display === 'flex') {
    await loadDayNotes(currentModalDate);
  }
}

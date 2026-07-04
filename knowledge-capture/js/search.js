// js/search.js — เมนู 4: ค้นหาด้วย AI (พร้อม fallback ค้นหาด้วยคำสำคัญ)

function initSearch() {
  // no-op: search runs on demand when the user submits a query
}

async function callAIKnowledgeFunction(action, payload) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-knowledge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY
    },
    body: JSON.stringify({ action, ...payload })
  });
  if (!res.ok) throw new Error(`edge function returned ${res.status}`);
  return res.json();
}

async function runKnowledgeSearch() {
  const query = document.getElementById('search-input').value.trim();
  if (!query) { showToast('กรุณาพิมพ์คำค้นหา', 'warn'); return; }

  const wrap = document.getElementById('search-results');
  wrap.innerHTML = '<div class="text-sub">กำลังค้นหา...</div>';
  setLoading(true);

  try {
    const result = await callAIKnowledgeFunction('search', { query });
    setLoading(false);
    const ids = (result.results || []).map(r => r.id);
    if (!ids.length) {
      wrap.innerHTML = badgeHTML('ai') + emptyResultsHTML();
      return;
    }
    const { data } = await db.from('notes').select('*').in('id', ids);
    const byId = Object.fromEntries((data || []).map(n => [n.id, n]));
    const reasonById = Object.fromEntries((result.results || []).map(r => [r.id, r.reason]));
    const ordered = ids.map(id => byId[id]).filter(Boolean);
    wrap.innerHTML = badgeHTML('ai') + ordered.map(n => renderNoteCard(n) +
      (reasonById[n.id] ? `<div class="text-sub" style="margin:-8px 0 12px 4px">🤖 ${escapeHTML(reasonById[n.id])}</div>` : '')
    ).join('');
  } catch (err) {
    console.warn('AI search unavailable, falling back to keyword search:', err.message);
    await runKeywordSearchFallback(query);
  } finally {
    setLoading(false);
  }
}

async function runKeywordSearchFallback(query) {
  const wrap = document.getElementById('search-results');
  const { data, error } = await db.from('notes').select('*');
  if (error) { wrap.innerHTML = '<div class="text-sub">ค้นหาไม่สำเร็จ</div>'; return; }

  const keywords = query.split(/\s+/).map(k => k.toLowerCase()).filter(Boolean);

  const scored = data.map(note => {
    const haystack = [
      note.book_title, note.insight, note.action,
      ...(note.highlights || []), ...(note.tags || [])
    ].join(' ').toLowerCase();
    const score = keywords.reduce((s, kw) => s + (haystack.includes(kw) ? 1 : 0), 0);
    return { note, score };
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 20);

  if (!scored.length) {
    wrap.innerHTML = badgeHTML('kw') + emptyResultsHTML();
    return;
  }
  wrap.innerHTML = badgeHTML('kw') + scored.map(r => renderNoteCard(r.note)).join('');
}

function badgeHTML(mode) {
  return mode === 'ai'
    ? '<div class="search-mode-badge search-mode-ai">🤖 ผลลัพธ์จาก AI</div>'
    : '<div class="search-mode-badge search-mode-kw">🔤 ค้นหาด้วยคำสำคัญ (ยังไม่ได้ตั้งค่า AI Edge Function)</div>';
}

function emptyResultsHTML() {
  return '<div class="empty-state"><div class="empty-icon">🔎</div>ไม่พบผลลัพธ์ที่ตรงกับคำค้นหา</div>';
}

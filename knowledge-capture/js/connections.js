// js/connections.js — เมนู 5: เชื่อมโยงความรู้

async function initConnections() {
  await loadTagConnections();
}

async function loadTagConnections() {
  const wrap = document.getElementById('connections-list');
  wrap.innerHTML = '<div class="text-sub">กำลังวิเคราะห์...</div>';

  const { data, error } = await db.from('notes').select('book_title, tags');
  if (error) { wrap.innerHTML = '<div class="text-sub">โหลดข้อมูลไม่สำเร็จ</div>'; return; }

  const tagMap = {}; // tag -> Set(book_title)
  data.forEach(n => {
    (n.tags || []).forEach(tag => {
      if (!tagMap[tag]) tagMap[tag] = new Set();
      tagMap[tag].add(n.book_title);
    });
  });

  const connections = Object.entries(tagMap)
    .filter(([, books]) => books.size >= 2)
    .sort((a, b) => b[1].size - a[1].size);

  if (!connections.length) {
    wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">🔗</div>ยังไม่มีหนังสือที่เชื่อมโยงกัน<br>ลองใส่แท็กเดียวกันให้หนังสือหลายเล่มดูสิ</div>';
    return;
  }

  wrap.innerHTML = connections.map(([tag, books]) => `
    <div class="connection-card">
      <div class="connection-tag-label">🏷️ ${escapeHTML(tag)}</div>
      <div class="text-sub" style="margin-bottom:10px">หนังสือ ${books.size} เล่มมีแนวคิดเชื่อมโยงกันผ่านแท็กนี้</div>
      <div class="connection-books">
        ${[...books].map(b => `<div class="connection-book"><span class="book-dot"></span>${escapeHTML(b)}</div>`).join('')}
      </div>
    </div>
  `).join('');
}

async function runAIConnections() {
  const wrap = document.getElementById('connections-list');
  setLoading(true);
  try {
    const result = await callAIKnowledgeFunction('connections', {});
    setLoading(false);
    const items = result.connections || [];
    if (!items.length) {
      wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">🤖</div>AI ไม่พบความเชื่อมโยงเพิ่มเติม</div>';
      return;
    }
    wrap.innerHTML = items.map(c => `
      <div class="connection-card">
        <div class="connection-tag-label">✨ ${escapeHTML(c.concept || 'แนวคิดร่วม')}</div>
        <div class="text-sub" style="margin-bottom:10px">${escapeHTML(c.explanation || '')}</div>
        <div class="connection-books">
          ${(c.books || []).map(b => `<div class="connection-book"><span class="book-dot"></span>${escapeHTML(b)}</div>`).join('')}
        </div>
      </div>
    `).join('');
  } catch (err) {
    setLoading(false);
    showToast('ยังไม่ได้ตั้งค่า AI Edge Function — ใช้ผลจากแท็กแทน', 'warn');
    await loadTagConnections();
  }
}

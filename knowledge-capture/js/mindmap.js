// js/mindmap.js — เมนู 6: Mind Map อัตโนมัติ (center -> tags -> books)

let mindmapNodes = [];
let mindmapNotesCache = [];

function initMindmap() {
  renderMindmap();
  window.addEventListener('resize', () => renderMindmap());
}

async function renderMindmap() {
  const canvas = document.getElementById('mindmapCanvas');
  const wrap = canvas.parentElement;
  const { data, error } = await db.from('notes').select('id, book_title, tags, insight, action, read_date, importance, highlights');
  if (error) return;
  mindmapNotesCache = data;

  const tagToBooks = {};
  const untagged = new Set();
  const bookSet = new Set();
  data.forEach(n => {
    bookSet.add(n.book_title);
    if (!n.tags || !n.tags.length) { untagged.add(n.book_title); return; }
    n.tags.forEach(t => { (tagToBooks[t] ||= new Set()).add(n.book_title); });
  });

  const ctx = canvas.getContext('2d');

  if (!bookSet.size) {
    canvas.width = wrap.clientWidth || 340;
    canvas.height = 200;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#A6A3B5';
    ctx.font = '14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ยังไม่มีข้อมูลพอสร้าง Mind Map — เริ่มบันทึกก่อนนะ', canvas.width / 2, canvas.height / 2);
    mindmapNodes = [];
    return;
  }

  const groups = Object.keys(tagToBooks).map(t => ({ label: t, books: [...tagToBooks[t]] }));
  if (untagged.size) groups.push({ label: 'ไม่มีแท็ก', books: [...untagged] });

  const size = Math.max(360, Math.min(640, wrap.clientWidth || 400));
  canvas.width = size;
  canvas.height = size;
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2, cy = size / 2;
  const R1 = size * 0.30;
  const R2 = Math.max(40, size * 0.11);

  mindmapNodes = [{ x: cx, y: cy, r: 26, type: 'center', label: '📚 ห้องสมุดของฉัน' }];

  const groupAngleStep = (2 * Math.PI) / groups.length;
  groups.forEach((g, i) => {
    const angle = i * groupAngleStep - Math.PI / 2;
    const tx = cx + R1 * Math.cos(angle);
    const ty = cy + R1 * Math.sin(angle);

    drawLine(ctx, cx, cy, tx, ty, '#C7C2E8');
    mindmapNodes.push({ x: tx, y: ty, r: 18, type: 'tag', label: g.label, books: g.books });

    const bookAngleStep = (2 * Math.PI) / g.books.length;
    g.books.forEach((book, j) => {
      const bAngle = j * bookAngleStep;
      const bx = tx + R2 * Math.cos(bAngle);
      const by = ty + R2 * Math.sin(bAngle);
      drawLine(ctx, tx, ty, bx, by, '#E7E5F1');
      mindmapNodes.push({ x: bx, y: by, r: 13, type: 'book', label: book, tag: g.label });
    });
  });

  // draw nodes on top of lines
  mindmapNodes.forEach(n => drawNode(ctx, n));
}

function drawLine(ctx, x1, y1, x2, y2, color) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawNode(ctx, n) {
  const colors = { center: '#4F46E5', tag: '#8B5CF6', book: '#F59E0B' };
  ctx.beginPath();
  ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
  ctx.fillStyle = colors[n.type];
  ctx.fill();

  ctx.fillStyle = '#14121F';
  ctx.font = n.type === 'center' ? 'bold 11px Outfit, sans-serif' : '10.5px Inter, sans-serif';
  ctx.textAlign = 'center';
  const label = n.label.length > 14 ? n.label.slice(0, 13) + '…' : n.label;
  ctx.fillText(label, n.x, n.y + n.r + 13);
}

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('mindmapCanvas');
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    const hit = mindmapNodes.find(n => Math.hypot(n.x - x, n.y - y) <= n.r + 4);
    if (hit) showMindmapDetail(hit);
  });
});

function showMindmapDetail(node) {
  const panel = document.getElementById('mindmap-detail');
  if (node.type === 'center') {
    const bookCount = new Set(mindmapNotesCache.map(n => n.book_title)).size;
    panel.innerHTML = `<strong>📚 ห้องสมุดความรู้ของฉัน</strong><div class="text-sub" style="margin-top:6px">รวม ${bookCount} เล่ม</div>`;
  } else if (node.type === 'tag') {
    panel.innerHTML = `
      <strong>🏷️ ${escapeHTML(node.label)}</strong>
      <div class="text-sub" style="margin-top:6px">เชื่อมโยงหนังสือ ${node.books.length} เล่ม: ${node.books.map(escapeHTML).join(', ')}</div>
    `;
  } else {
    const notes = mindmapNotesCache.filter(n => n.book_title === node.label);
    const totalHighlights = notes.reduce((s, n) => s + (n.highlights?.length || 0), 0);
    panel.innerHTML = `
      <strong>📖 ${escapeHTML(node.label)}</strong>
      <div class="text-sub" style="margin-top:6px">${notes.length} บันทึก · ${totalHighlights} ไฮไลท์ · แท็ก: ${escapeHTML(node.tag)}</div>
    `;
  }
}

// js/training.js — เมนู Training: ฝึกทักษะทุกวัน (นับเป็นขีด |||| )

const TRAINING_GROUPS = [
  {
    key: 'sales', title: 'การขาย', icon: '💼', color: '#3B82F6',
    skills: [
      { key: 'ask', name: 'ฝึกการตั้งคำถาม' },
      { key: 'sell', name: 'ฝึกการขายสินค้า' },
      { key: 'close', name: 'ฝึกการปิดการขาย' }
    ]
  },
  {
    key: 'promote', title: 'การโปรโมท', icon: '📣', color: '#F59E0B',
    skills: [
      { key: 'system', name: 'โปรโมทระบบ' },
      { key: 'meeting', name: 'โปรโมท Meeting' },
      { key: 'team', name: 'โปรโมททีม' },
      { key: 'audio', name: 'โปรโมทไฟล์เสียง' }
    ]
  },
  {
    key: 'story', title: 'การเล่าธุรกิจ', icon: '✨', color: '#8B5CF6',
    skills: [
      { key: 'beauty', name: 'เล่าความสวยงาม' },
      { key: 'worth', name: 'เล่าความคุ้มค่ากับเวลา' },
      { key: 'opportunity', name: 'เล่าโอกาส' },
      { key: 'vision', name: 'เล่าวิสัยทัศน์' }
    ]
  },
  {
    key: 'followup', title: 'การติดตามผล', icon: '🤝', color: '#10B981',
    skills: [
      { key: 'relationship', name: 'ขยับความสัมพันธ์', hint: 'ฝึกทำให้คนเป็นเพื่อนเรา' }
    ]
  }
];

let trainingToday = {}; // { skill_key: count }

function initTraining() {
  const el = document.querySelector('#page-training .page-content');
  el.innerHTML = `
    <header class="page-head">
      <div>
        <p class="greeting">ฝึกวันนี้ 💪</p>
        <h1 class="page-title">Training</h1>
      </div>
      <div class="head-stat">
        <span class="head-stat-num" id="training-total">0</span>
        <span class="head-stat-label">ครั้งวันนี้</span>
      </div>
    </header>
    <p class="page-sub">แตะที่ทักษะเพื่อบันทึก 1 ครั้ง · นับเป็นขีด <span class="tally-group" data-n="5" style="display:inline-block;vertical-align:middle"></span></p>
    <div id="training-list"></div>
  `;
  refreshTraining();
}
window.refreshTraining = refreshTraining;

async function refreshTraining() {
  const rows = await Store.select('training_log', { eq: { date: todayISO() } });
  trainingToday = {};
  rows.forEach(r => { trainingToday[r.skill_key] = r.count; });
  renderTraining();
}

function renderTraining() {
  const total = Object.values(trainingToday).reduce((a, b) => a + b, 0);
  const totalEl = document.getElementById('training-total');
  if (totalEl) totalEl.textContent = total;

  const list = document.getElementById('training-list');
  list.innerHTML = TRAINING_GROUPS.map(g => {
    const groupTotal = g.skills.reduce((s, sk) => s + (trainingToday[`${g.key}.${sk.key}`] || 0), 0);
    return `
    <section class="card group-card">
      <div class="group-head">
        <span class="group-icon" style="background:${g.color}1a;color:${g.color}">${g.icon}</span>
        <h2>${g.title}</h2>
        <span class="group-count">${groupTotal}</span>
      </div>
      ${g.skills.map(sk => {
        const id = `${g.key}.${sk.key}`;
        const n = trainingToday[id] || 0;
        return `
        <div class="skill-row" data-skill="${id}">
          <div class="skill-info">
            <p class="skill-name">${sk.name}</p>
            ${sk.hint ? `<p class="skill-hint">${sk.hint}</p>` : ''}
            <div class="tally">${tallyMarks(n)}</div>
          </div>
          <div class="skill-actions">
            <button class="btn-step btn-minus" data-skill="${id}" ${n === 0 ? 'disabled' : ''}>−</button>
            <span class="skill-count">${n}</span>
            <button class="btn-step btn-plus" data-skill="${id}">+</button>
          </div>
        </div>`;
      }).join('')}
    </section>`;
  }).join('');

  list.querySelectorAll('.btn-plus').forEach(b =>
    b.addEventListener('click', () => stepTraining(b.dataset.skill, +1)));
  list.querySelectorAll('.btn-minus').forEach(b =>
    b.addEventListener('click', () => stepTraining(b.dataset.skill, -1)));
}

async function stepTraining(skillKey, delta) {
  const current = trainingToday[skillKey] || 0;
  const next = Math.max(0, current + delta);
  if (next === current) return;
  trainingToday[skillKey] = next; // optimistic
  renderTraining();

  const date = todayISO();
  const existing = await Store.select('training_log', { eq: { date } });
  const row = existing.find(r => r.skill_key === skillKey);
  if (row) {
    await Store.update('training_log', row.id, { count: next });
  } else {
    await Store.insert('training_log', { date, skill_key: skillKey, count: next });
  }
}

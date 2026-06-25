// js/app.js — Router & init

const PAGE_INIT = {
  training: initTraining,
  tasks: initTasks,
  calendar: initCalendar,
  customers: initCustomers,
  review: initReview,
  goals: initGoals
};

const PAGE_REFRESH = {
  training: () => window.refreshTraining?.(),
  tasks: () => window.refreshTasks?.(),
  calendar: () => window.refreshCalendar?.(),
  customers: () => window.refreshCustomers?.(),
  review: () => window.refreshReview?.(),
  goals: () => window.refreshGoals?.()
};

const initialized = new Set();

function showPage(pageId) {
  if (!PAGE_INIT[pageId]) pageId = 'training';

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.bottom-nav a').forEach(a => a.classList.remove('active'));
  document.getElementById(`page-${pageId}`).classList.add('active');
  document.getElementById(`nav-${pageId}`).classList.add('active');
  window.scrollTo(0, 0);

  if (!initialized.has(pageId)) {
    PAGE_INIT[pageId]?.();
    initialized.add(pageId);
  } else {
    PAGE_REFRESH[pageId]?.();
  }
  location.hash = pageId;
}

document.addEventListener('DOMContentLoaded', () => {
  // วันที่บนหัว
  const dateEl = document.getElementById('today-date');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('th-TH', {
      weekday: 'long', day: 'numeric', month: 'long'
    });
  }

  // โหมดเก็บข้อมูล
  const badge = document.getElementById('mode-badge');
  if (badge) {
    if (Store.mode === 'local') {
      badge.textContent = 'โหมดในเครื่อง';
      badge.classList.add('mode-local');
    } else {
      badge.textContent = 'Supabase';
      badge.classList.add('mode-cloud');
    }
  }

  document.querySelectorAll('.bottom-nav a').forEach(a => {
    a.addEventListener('click', e => { e.preventDefault(); showPage(a.dataset.page); });
  });

  const hash = location.hash.replace('#', '');
  showPage(PAGE_INIT[hash] ? hash : 'training');
});

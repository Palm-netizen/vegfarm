// js/app.js — App router & init (Knowledge Capture)

const PAGE_INIT = {
  calendar: initCalendar,
  dashboard: loadDashboard,
  review: initReview,
  search: initSearch,
  connections: initConnections,
  mindmap: initMindmap
};

const initialized = new Set();

function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.bottom-nav a').forEach(a => a.classList.remove('active'));

  document.getElementById(`page-${pageId}`).classList.add('active');
  document.getElementById(`nav-${pageId}`).classList.add('active');

  window.scrollTo(0, 0);

  if (!initialized.has(pageId)) {
    PAGE_INIT[pageId]?.();
    initialized.add(pageId);
  } else if (pageId === 'dashboard') {
    loadDashboard();
  } else if (pageId === 'calendar') {
    renderCalendar();
  } else if (pageId === 'review') {
    loadReviewContent(reviewActiveDays);
  } else if (pageId === 'connections') {
    loadTagConnections();
  } else if (pageId === 'mindmap') {
    renderMindmap();
  }

  location.hash = pageId;
}

document.addEventListener('DOMContentLoaded', () => {
  const today = new Date();
  document.getElementById('nav-date').textContent = today.toLocaleDateString('th-TH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  document.querySelectorAll('.bottom-nav a').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      showPage(a.dataset.page);
    });
  });

  const hash = location.hash.replace('#', '');
  showPage(PAGE_INIT[hash] ? hash : 'calendar');
});

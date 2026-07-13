// js/app.js — App router & init

const APP_VERSION = 'v2026.07.06 · build 44';

const PAGE_INIT = {
  dashboard: loadDashboard,
  seeds: initSeeds,
  batches: initBatches,
  plots: initPlots,
  problems: initProblems,
  calendar: initCalendar,
  todos: initTodos,
  finance: initFinance,
  customers: initCustomers
};

const initialized = new Set();

function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.bottom-nav a').forEach(a => a.classList.remove('active'));

  document.getElementById(`page-${pageId}`).classList.add('active');
  document.getElementById(`nav-${pageId}`).classList.add('active');

  window.scrollTo(0, 0);

  // Init page on first visit, refresh dashboard/calendar always
  if (!initialized.has(pageId)) {
    PAGE_INIT[pageId]?.();
    initialized.add(pageId);
  } else if (pageId === 'customers') {
    loadCustomers();
  } else if (pageId === 'finance') {
    loadFinanceSummary();
  } else if (pageId === 'dashboard') {
    loadDashboard();
  } else if (pageId === 'calendar') {
    renderCalendar();
  } else if (pageId === 'plots') {
    loadAllPlots();
  } else if (pageId === 'batches') {
    loadBatches();
  } else if (pageId === 'problems') {
    loadProblemDatabase();
  } else if (pageId === 'todos') {
    loadTodos();
  }

  location.hash = pageId;
}

// ===== Theme (light/dark) =====
function toggleTheme() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (dark) document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', 'dark');
  try { localStorage.setItem('vf_theme', dark ? 'light' : 'dark'); } catch (e) {}
  updateThemeToggleIcon();
}
function updateThemeToggleIcon() {
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙';
}

function vfStartApp() {
  // show logout button in cloud mode
  const lo = document.getElementById('logout-btn');
  if (lo && typeof VF_USE_CLOUD !== 'undefined' && VF_USE_CLOUD) lo.style.display = 'flex';
  // Initial page from hash or default
  const hash = location.hash.replace('#', '');
  showPage(PAGE_INIT[hash] ? hash : 'dashboard');
}

document.addEventListener('DOMContentLoaded', async () => {
  updateThemeToggleIcon();

  const verEl = document.getElementById('app-version');
  if (verEl) verEl.textContent = 'VegFarm · ' + APP_VERSION;

  // Set today's date in nav
  const today = new Date();
  document.getElementById('nav-date').textContent = today.toLocaleDateString('th-TH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  // Bottom nav clicks
  document.querySelectorAll('.bottom-nav a').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      showPage(a.dataset.page);
    });
  });

  // Require login in cloud mode; offline skips
  const loginScreen = document.getElementById('login-screen');
  const authed = await vfHasSession();
  if (authed) {
    if (loginScreen) loginScreen.style.display = 'none';
    vfStartApp();
  } else {
    if (loginScreen) loginScreen.style.display = 'flex';
  }
});

// js/supabase.js — Supabase client config
// แก้ SUPABASE_URL และ SUPABASE_ANON_KEY ให้ตรงกับโปรเจกต์ของคุณ

const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY_HERE';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helper: format date to Thai readable
function formatDateTH(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Helper: add days to date
function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// Helper: survival rate by weather
function getSurvivalRate(weather) {
  const rates = { hot: 70, rainy: 70, cold: 90 };
  return rates[weather] || 70;
}

// Helper: estimated KG calculation
function calcEstimatedKg(seedCount, weather, survivalRate) {
  const survived = Math.floor(seedCount * (survivalRate / 100));
  const kgPerPlant = (weather === 'cold') ? (1 / 10) : (1 / 12);
  return (survived * kgPerPlant).toFixed(2);
}

// Helper: show toast notification
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className = `toast toast-${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// Helper: loading state
function setLoading(show) {
  const loader = document.getElementById('loader');
  if (loader) loader.style.display = show ? 'flex' : 'none';
}

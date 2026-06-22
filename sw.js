// sw.js — VegFarm service worker (offline app shell)
// กลยุทธ์: network-first สำหรับไฟล์ของแอป (same-origin) เพื่อให้ได้เวอร์ชันล่าสุดเสมอ
// ถ้าออฟไลน์ค่อย fallback ไปที่แคช. คำขอข้ามโดเมน (Supabase/CDN) ปล่อยผ่าน ไม่แคช.
const CACHE = 'vegfarm-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // ปล่อย Supabase/CDN ผ่าน

  e.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});

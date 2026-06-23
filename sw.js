// sw.js — VegFarm service worker (offline app shell)
// กลยุทธ์ (เร่งเวลาเปิดแอป):
//  • index.html / การนำทาง  → network-first  (ได้ตัวอ้างอิงเวอร์ชันล่าสุดเสมอ ออฟไลน์ค่อย fallback แคช)
//  • ไฟล์ js/css/ฟอนต์ (มี ?v= หรือ immutable) → cache-first + อัปเดตเบื้องหลัง (เปิดเร็วทันที)
//  • คำขอข้ามโดเมน (Supabase/CDN) → ปล่อยผ่าน ไม่แคช
const CACHE = 'vegfarm-v2';

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

  const isHTML = req.mode === 'navigate' || req.destination === 'document';

  if (isHTML) {
    // network-first: ได้ index.html ล่าสุด (ซึ่งอ้างอิง ?v= ของไฟล์ใหม่)
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // stale-while-revalidate: ตอบจากแคชทันที แล้วค่อยอัปเดตเบื้องหลัง
  e.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

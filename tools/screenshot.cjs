#!/usr/bin/env node
// tools/screenshot.cjs — รันหน้าเว็บแล้วถ่าย screenshot ทุกหน้า (headless Chromium)
//
// วิธีใช้:
//   1) เสิร์ฟไฟล์:   python3 -m http.server 8080   (จาก root ของโปรเจกต์)
//   2) ถ่ายภาพ:      node tools/screenshot.cjs [baseUrl] [outDir]
//        ค่าเริ่มต้น baseUrl = http://localhost:8080/index.html , outDir = ./screenshots
//
// ต้องมี Playwright + Chromium ติดตั้ง (npm i -D playwright && npx playwright install chromium)

const fs = require('fs');
const path = require('path');

function loadPlaywright() {
  const candidates = [
    'playwright',
    '/opt/node22/lib/node_modules/playwright',
    path.join(process.env.HOME || '', '.npm/_npx')
  ];
  for (const c of candidates) {
    try { return require(c); } catch (_) { /* try next */ }
  }
  console.error('ไม่พบ Playwright — ติดตั้งด้วย: npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}

(async () => {
  const { chromium } = loadPlaywright();
  const base = process.argv[2] || 'http://localhost:8080/index.html';
  const outDir = process.argv[3] || path.join(process.cwd(), 'screenshots');
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto(base, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(outDir, 'dashboard.png'), fullPage: true });

  for (const p of ['seeds', 'plots', 'problems', 'calendar', 'todos', 'finance', 'customers']) {
    await page.click('#nav-' + p).catch(() => {});
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(outDir, p + '.png'), fullPage: true });
  }

  console.log('screenshots -> ' + outDir);
  console.log('console/page errors: ' + (errors.length ? '\n' + [...new Set(errors)].join('\n') : '(none)'));
  await browser.close();
})();

# 🚀 Coach — แอปฝึกทักษะการขายทุกวัน

Web App มือถือ (mobile-first) สำหรับฝึกทักษะการขาย/ธุรกิจ จัดการงาน ลูกค้า และเป้าหมายรายวัน
ดีไซน์โทนเขียวตามแบบที่ออกแบบไว้ · แยกโค้ดแต่ละเมนูเป็นไฟล์เพื่อแก้ไขง่าย

> เป็น **โปรเจกต์แยก** จากแอป VegFarm (อยู่ที่ root) — Coach อยู่ในโฟลเดอร์ `coach/`

## 6 เมนูหลัก

| เมนู | ไฟล์ | หน้าที่ |
|---|---|---|
| 💪 Training | `js/training.js` | ฝึกทักษะทุกวัน (การขาย/โปรโมท/เล่าธุรกิจ/ติดตามผล) นับเป็นขีด \|\|\|\| |
| ✅ Tasks | `js/tasks.js` | รายการงานที่ต้องทำ แบ่งสถานะ 🟢 เสร็จ / 🟡 กำลังทำ / 🔴 ค้าง |
| 🗓️ Calendar | `js/calendar.js` | ปฏิทินนัดหมาย + แสดง To-do รายวัน |
| 👥 Customers | `js/customers.js` | CRM ข้อมูลลูกค้า ความสนใจ เป้าหมาย ประวัติการคุย |
| 🌙 Daily Review | `js/review.js` | สรุปประจำวัน ก่อนนอนตอบ 3 ข้อ |
| 🎯 Goals | `js/goals.js` | เป้าหมายรายเดือน + แถบ % ความคืบหน้า |

## โครงสร้างไฟล์

```
coach/
├── index.html          # โครงหน้า + bottom nav (โหลด js แต่ละเมนู)
├── css/style.css       # ดีไซน์ทั้งหมด (โทนเขียว มือถือ)
├── js/
│   ├── store.js        # data layer: Supabase + localStorage fallback + helpers
│   ├── app.js          # router / สลับหน้า
│   ├── training.js     # เมนู 1
│   ├── tasks.js        # เมนู 2
│   ├── calendar.js     # เมนู 3
│   ├── customers.js    # เมนู 4
│   ├── review.js       # เมนู 5
│   └── goals.js        # เมนู 6
├── schema.sql          # ตาราง Supabase
└── README.md
```

## เริ่มใช้งานทันที (ยังไม่ต้องต่อ Supabase)

แอปทำงานได้เลยโดยเก็บข้อมูลใน **localStorage** ของเครื่อง (มีป้าย “โหมดในเครื่อง” มุมขวาบน)

```bash
cd coach
python3 -m http.server 8000
# เปิด http://localhost:8000
```
หรือเปิด `index.html` ด้วย Live Server (VS Code)

## ต่อ Supabase (ข้อมูลออนไลน์/หลายเครื่อง)

1. สร้างโปรเจกต์ที่ https://supabase.com
2. SQL Editor → รัน `schema.sql` (สร้างตารางทั้งหมด)
3. แก้ `js/store.js` ใส่ค่าจริง:
   ```js
   const SUPABASE_URL = 'https://xxxx.supabase.co';
   const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
   ```
4. รีเฟรช — ป้ายมุมขวาบนจะเปลี่ยนเป็น “Supabase” และข้อมูลจะถูกเก็บบนคลาวด์

> ⚠️ anon key ของ Supabase ถูกจำกัดด้วย RLS — schema นี้ตั้ง policy เป็น *allow all* เพื่อความง่ายในการเริ่มต้น
> หากใช้งานจริงควรเปิด Auth แล้วผูก policy กับ `auth.uid()`

## Backup ขึ้น GitHub

โปรเจกต์นี้อยู่ใน repo `vegfarm` (branch `claude/jolly-mendel-3a0b32`) — commit & push ได้ตามปกติ

## Deploy ฟรี

- **GitHub Pages**: ตั้ง path ไปที่ `/coach`
- **Netlify / Vercel**: ตั้ง base directory = `coach`

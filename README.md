# 🌱 VegFarm — ระบบจัดการแปลงผัก

Web App สำหรับจัดการฟาร์มผัก รองรับมือถือ (Mobile-first PWA-style)

## โครงสร้างไฟล์

```
vegfarm/
├── index.html              # หน้าหลัก รวมทุกเมนู (SPA)
├── css/
│   └── style.css           # สไตล์ทั้งหมด
├── js/
│   ├── supabase.js         # config + helper functions
│   ├── app.js               # router/navigation
│   ├── dashboard.js         # เมนู 1: Dashboard
│   ├── seeds.js             # เมนู 2: บันทึกรอบเพาะเมล็ด
│   ├── plots.js              # เมนู 3: บันทึกรอบปลูกลงแปลง
│   ├── problems.js           # เมนู 4: ระบบบันทึกปัญหา
│   ├── calendar.js           # เมนู 5: ปฏิทินภาพรวม
│   └── todos.js              # เมนู 6: To-do list รายวัน
└── supabase_schema.sql      # SQL สำหรับสร้างตารางใน Supabase
```

## ขั้นตอนติดตั้ง

### 1. สร้างโปรเจกต์ Supabase
1. ไปที่ https://supabase.com → สร้างโปรเจกต์ใหม่
2. เปิด **SQL Editor** → รัน `supabase_schema.sql` เพื่อสร้างตารางทั้งหมด (รวมถึงสร้างแปลง T1-T15 อัตโนมัติ)
3. ไปที่ **Storage** → สร้าง bucket ชื่อ `photos` (ตั้งเป็น Public) สำหรับเก็บรูปปัญหา

### 2. เชื่อมต่อ Supabase กับเว็บแอป
แก้ไขไฟล์ `js/supabase.js`:

```js
const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY_HERE';
```

หาค่าได้จาก Supabase Dashboard → Project Settings → API

### 3. รันแอปบนเครื่อง
เปิด `index.html` ด้วย Live Server (VSCode extension) หรือ:
```bash
python3 -m http.server 8000
```
แล้วเปิด `http://localhost:8000`

### 4. Backup ขึ้น GitHub

```bash
cd vegfarm
git init
git add .
git commit -m "Initial VegFarm web app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/vegfarm.git
git push -u origin main
```

> ⚠️ **สำคัญ**: อย่า commit `js/supabase.js` ที่มี anon key จริงขึ้น public repo ถ้าต้องการความปลอดภัยสูง — แนะนำใส่ใน `.gitignore` แล้วใช้ค่า placeholder แทน หรือใช้ environment variable ผ่าน build tool. (anon key ของ Supabase ปลอดภัยระดับหนึ่งเพราะถูกจำกัดด้วย RLS แต่ควรตั้งค่า RLS ให้เหมาะสมกับการใช้งานจริง — ตอนนี้ schema ตั้งเป็น "allow all" เพื่อความง่ายในการเริ่มต้น)

### 5. Deploy ออนไลน์ (ฟรี)
- **GitHub Pages**: Settings → Pages → เลือก branch `main` → save
- หรือใช้ **Netlify** / **Vercel**: เชื่อม GitHub repo แล้ว deploy อัตโนมัติ

## สรุปการคำนวณในระบบ

| รายการ | สูตร |
|---|---|
| อัตรารอด | หน้าร้อน/ฝนสลับแดด = 70%, หน้าหนาว = 90% |
| กิโลคาดการณ์ (เพาะเมล็ด) | จำนวนเมล็ด × อัตรารอด ÷ (12 ต้น/kg ปกติ, 10 ต้น/kg หน้าหนาว) |
| วันเก็บเกี่ยว (เพาะเมล็ด) | วันเพาะเมล็ด + 45 วัน |
| วันเก็บเกี่ยว (ปลูกลงแปลง) | วันที่ปลูก + 30 วัน |

## ฟีเจอร์หลัก

1. **Dashboard** — ภาพรวม รอบปลูกปัจจุบัน, อัตรารอด, แปลงมีปัญหา, งานวันนี้, ปัญหาล่าสุด, กราฟเปรียบเทียบ
2. **บันทึกรอบเพาะเมล็ด** — เลือกชนิดผักหลายชนิด, คำนวณอัตรารอด/กิโล/วันเก็บอัตโนมัติ, ตารางแก้ไข/ลบ
3. **รอบปลูกลงแปลง** — 15 แปลง (T1-T15), QR Code ต่อแปลง, ประวัติแต่ละรอบ, เริ่มรอบใหม่
4. **บันทึกปัญหา** — เลือกแปลง, ประเภทปัญหา 4 แบบ, ความรุนแรง, ถ่ายรูป, ฐานข้อมูลค้นหาได้
5. **ปฏิทินภาพรวม** — แสดงกิจกรรมทุกประเภทแยกสี
6. **To-do รายวัน** — สูงสุด 5 งาน/วัน

# 📚 Knowledge Capture — สกัดความรู้จากหนังสือ

แอปเว็บสำหรับบันทึกและสกัดความรู้จากการอ่านหนังสือ **แยกอิสระจาก VegFarm โดยสิ้นเชิง** — คนละโปรเจกต์ Supabase, คนละหน้าเว็บ, คนละธีมสี ใช้ร่วม repository เดียวกันเพียงเพื่อความสะดวกเท่านั้น

## โครงสร้างไฟล์

```
knowledge-capture/
├── index.html                       # SPA รวมทุกเมนู
├── css/
│   └── style.css                    # ธีม Indigo Study (แยกจาก VegFarm)
├── js/
│   ├── supabase.js                  # config + helper functions
│   ├── app.js                       # router/navigation
│   ├── entry.js                     # ฟอร์มบันทึก/แก้ไข/ลบ (ใช้ร่วมทุกเมนู)
│   ├── calendar.js                  # เมนู 1: ปฏิทิน + คลิกวันเพื่อบันทึก
│   ├── dashboard.js                 # เมนู 2: Dashboard + Quote of the Day
│   ├── review.js                    # เมนู 3: สุ่มทบทวน (Spaced Repetition)
│   ├── search.js                    # เมนู 4: ค้นหาด้วย AI (+ fallback คำสำคัญ)
│   ├── connections.js               # เมนู 5: เชื่อมโยงความรู้
│   └── mindmap.js                   # เมนู 6: Mind Map อัตโนมัติ
├── supabase/
│   └── functions/ai-knowledge/      # Edge Function (ใช้ Claude ช่วยค้นหา/เชื่อมโยง) — ออปชันนัล
└── supabase_schema.sql              # SQL สร้างตาราง notes ใน Supabase
```

## โครงสร้างข้อมูลการบันทึก 1 รายการ (ตาราง `notes`)

| ฟิลด์ | ความหมาย |
|---|---|
| `book_title` | 📖 ชื่อหนังสือ |
| `read_date` | 📅 วันที่อ่าน |
| `highlights` | ✨ ไฮไลท์วันนี้ (1-5 ข้อ) |
| `insight` | 💡 สิ่งที่ได้เรียนรู้ (Key Insight) |
| `action` / `action_done` | 🎯 จะนำไปใช้ยังไง + สถานะลงมือทำแล้วหรือยัง |
| `importance` | ⭐ ระดับความสำคัญ (1-5) |
| `tags` | 🏷️ แท็ก (ธุรกิจ, การเงิน, จิตวิทยา, สุขภาพ, หรือเพิ่มเอง) |
| `image_urls` | อัปโหลดได้สูงสุด 2 รูป |

## ขั้นตอนติดตั้ง

### 1. สร้างโปรเจกต์ Supabase ใหม่ (แยกจาก VegFarm)
1. ไปที่ https://supabase.com → สร้างโปรเจกต์ใหม่ชื่อ เช่น `knowledge-capture`
2. เปิด **SQL Editor** → รัน `supabase_schema.sql` เพื่อสร้างตาราง `notes`
3. ไปที่ **Storage** → สร้าง bucket ชื่อ `knowledge-photos` (ตั้งเป็น Public)

### 2. เชื่อมต่อ Supabase กับเว็บแอป
แก้ไฟล์ `js/supabase.js`:
```js
const SUPABASE_URL = 'https://YOUR_KC_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_KC_ANON_KEY_HERE';
```
หาค่าได้จาก Supabase Dashboard → Project Settings → API

### 3. รันแอปบนเครื่อง
```bash
cd knowledge-capture
python3 -m http.server 8000
```
เปิด `http://localhost:8000`

### 4. (ออปชันนัล) เปิดใช้งาน "ค้นหาด้วย AI" และ "เชื่อมโยงความรู้ (AI)" แบบเข้าใจภาษาธรรมชาติจริง
ถ้าไม่ทำขั้นตอนนี้ แอปจะยังใช้งานได้ปกติ โดยระบบค้นหาจะ fallback เป็นค้นหาด้วยคำสำคัญ และหน้าเชื่อมโยงความรู้จะจัดกลุ่มด้วยแท็กแทน

1. ติดตั้ง [Supabase CLI](https://supabase.com/docs/guides/cli) แล้ว `supabase login` และ `supabase link --project-ref YOUR_PROJECT_REF`
2. ขอ API key จาก https://console.anthropic.com แล้วตั้งค่า secret:
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxx
   ```
3. Deploy ฟังก์ชัน:
   ```bash
   supabase functions deploy ai-knowledge --no-verify-jwt
   ```
4. รีเฟรชหน้าเว็บ — ปุ่ม "ค้นหา" และ "วิเคราะห์เชิงลึกด้วย AI" จะเรียกใช้ Claude อัตโนมัติ

### 5. Deploy ออนไลน์ (ฟรี)
- **GitHub Pages**: Settings → Pages → เลือก branch → โฟลเดอร์ `/knowledge-capture` (หรือย้ายไฟล์ไป repo แยกถ้าต้องการ URL รากตรง ๆ)
- หรือใช้ **Netlify** / **Vercel**: เชื่อม GitHub repo แล้วตั้ง base directory เป็น `knowledge-capture`

> ⚠️ **สำคัญ**: อย่า commit `js/supabase.js` ที่มี key จริงขึ้น public repo ถ้าต้องการความปลอดภัยสูง — ตอนนี้ RLS ตั้งเป็น "allow all" เพื่อความง่ายในการเริ่มต้น ควรปรับให้เหมาะกับการใช้งานจริง (เช่นผูกกับผู้ใช้ที่ล็อกอิน) ก่อนใช้งานสาธารณะ

## ฟีเจอร์หลัก

1. **ปฏิทิน** — แตะวันที่เพื่อบันทึกหนังสือที่อ่าน หรือดู/แก้ไข/ลบบันทึกของวันนั้น (รองรับหลายเล่มต่อวัน)
2. **Dashboard** — อ่านต่อเนื่องกี่วัน, สรุปแล้วกี่เล่ม, ไฮไลท์ทั้งหมดกี่ข้อ, ลงมือทำแล้วกี่ข้อ, Quote of the Day (สุ่มไฮไลท์ประจำวันแบบ deterministic ต่อวัน), กราฟจำนวนบันทึกใน 8 สัปดาห์
3. **สุ่มทบทวน** — ดูสิ่งที่บันทึกไว้เมื่อ 1 / 7 / 30 / 90 / 365 วันก่อน ตามหลัก Spaced Repetition
4. **ค้นหาด้วย AI** — ค้นหาด้วยประโยคธรรมชาติ ผ่าน Edge Function ที่เรียก Claude (ถ้าตั้งค่าไว้) หรือค้นหาด้วยคำสำคัญแบบ client-side (fallback อัตโนมัติ)
5. **เชื่อมโยงความรู้** — จัดกลุ่มหนังสือที่ใช้แท็กร่วมกัน และมีปุ่ม "วิเคราะห์เชิงลึกด้วย AI" ให้ Claude หาความเชื่อมโยงเชิงเนื้อหาระหว่างเล่ม
6. **Mind Map อัตโนมัติ** — วาดผังความรู้แบบ canvas (ศูนย์กลาง → แท็ก → หนังสือ) อัตโนมัติจากข้อมูลที่มี แตะโหนดเพื่อดูรายละเอียด

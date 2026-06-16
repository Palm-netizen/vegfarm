// js/config.js — การตั้งค่า Supabase (ทางเลือก)
//
// • ปล่อยค่าว่างไว้  = แอปทำงานแบบออฟไลน์ (เก็บข้อมูลใน localStorage)
// • ใส่ค่าทั้งสอง   = แอปจะใช้ Supabase คลาวด์ (sync ข้ามเครื่อง กันข้อมูลหาย)
//
// หาค่าได้ที่ Supabase Dashboard → Project Settings → API
// และอย่าลืมรัน supabase_schema.sql ใน SQL Editor + สร้าง bucket ชื่อ 'photos' (Public)
//
// หมายเหตุ: anon key ปลอดภัยที่จะอยู่ฝั่ง client เพราะถูกจำกัดด้วย RLS
window.VF_CONFIG = {
  SUPABASE_URL: 'https://tdlbfnlnygxcgmwadcvj.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_mlR1qPTt-zguvXgavoc8WQ_OE7Y8PZ5'
};

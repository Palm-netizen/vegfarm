-- ============================================================
-- VegFarm — ข้อมูลตัวอย่างสำหรับโหมดคลาวด์ (Supabase)
-- รันใน SQL Editor หลังรัน supabase_schema.sql แล้ว
-- ปลอดภัยถ้ารันซ้ำ (จะใส่เฉพาะตารางที่ยังว่าง)
-- ============================================================
DO $$
BEGIN
  -- ลูกค้า
  IF NOT EXISTS (SELECT 1 FROM customers) THEN
    INSERT INTO customers (name, address, weekly_kg, type, tag) VALUES
      ('ร้านสลัดเฮลตี้', 'อ.เมือง', 25, 'customer', 'regular'),
      ('ตลาดสดเทศบาล', 'ในเมือง', 40, 'customer', 'regular'),
      ('ฟาร์มเพื่อนบ้าน', 'ต.หนองหาร', 15, 'farm', 'general'),
      ('ลูกค้าใหม่ออนไลน์', 'กรุงเทพฯ', 8, 'customer', 'new');
  END IF;

  -- รอบเพาะเมล็ด
  IF NOT EXISTS (SELECT 1 FROM seed_batches) THEN
    INSERT INTO seed_batches (seed_date, vegetable_types, seed_count, weather_condition, survival_rate, harvest_date, estimated_kg, notes) VALUES
      (CURRENT_DATE-50, ARRAY['green_oak','red_oak'], 400, 'hot',  70, CURRENT_DATE-5,  23.33, 'รอบเพาะปกติ'),
      (CURRENT_DATE-41, ARRAY['red_oak','finley'],    520, 'rainy',70, CURRENT_DATE+4,  30.33, 'รอบเพาะปกติ'),
      (CURRENT_DATE-32, ARRAY['finley','cos'],        640, 'cold', 90, CURRENT_DATE+13, 57.60, 'รอบเพาะปกติ'),
      (CURRENT_DATE-23, ARRAY['cos','butterhead'],    760, 'hot',  70, CURRENT_DATE+22, 44.33, 'รอบเพาะปกติ'),
      (CURRENT_DATE-14, ARRAY['butterhead','green_oak'],880,'cold',90, CURRENT_DATE+31, 79.20, 'รอบเพาะปกติ'),
      (CURRENT_DATE-5,  ARRAY['green_oak','red_oak'], 1000, 'rainy',70, CURRENT_DATE+40, 58.33, 'รอบเพาะปกติ');
  END IF;

  -- รายรับ
  IF NOT EXISTS (SELECT 1 FROM income) THEN
    INSERT INTO income (income_date, plot_code, vegetable_type, kg_sold, price_per_kg, total_amount, buyer, channel) VALUES
      (CURRENT_DATE-1,  'T1', 'green_oak',  10, 45, 450,  'ตลาดสด',  'market'),
      (CURRENT_DATE-6,  'T2', 'red_oak',    13, 50, 650,  'ร้านสลัด','delivery'),
      (CURRENT_DATE-11, 'T3', 'finley',     16, 55, 880,  'ส่งตรง',  'direct'),
      (CURRENT_DATE-16, 'T4', 'cos',        19, 45, 855,  'ตลาดสด',  'wholesale'),
      (CURRENT_DATE-21, 'T5', 'butterhead', 22, 50, 1100, 'ร้านสลัด','market'),
      (CURRENT_DATE-26, 'T6', 'green_oak',  25, 55, 1375, 'ส่งตรง',  'delivery'),
      (CURRENT_DATE-31, 'T7', 'red_oak',    28, 45, 1260, 'ตลาดสด',  'direct'),
      (CURRENT_DATE-36, 'T8', 'finley',     31, 50, 1550, 'ร้านสลัด','wholesale');
  END IF;

  -- รายจ่าย
  IF NOT EXISTS (SELECT 1 FROM expenses) THEN
    INSERT INTO expenses (expense_date, category, amount, description) VALUES
      (CURRENT_DATE-2,  'seed',      200, 'เมล็ดพันธุ์'),
      (CURRENT_DATE-7,  'fertilizer',280, 'ปุ๋ย/สารเคมี'),
      (CURRENT_DATE-12, 'labor',     360, 'ค่าแรง'),
      (CURRENT_DATE-17, 'utility',   440, 'ค่าไฟ'),
      (CURRENT_DATE-22, 'packaging', 520, 'บรรจุภัณฑ์'),
      (CURRENT_DATE-27, 'transport', 600, 'ค่าขนส่ง');
  END IF;

  -- ปัญหา
  IF NOT EXISTS (SELECT 1 FROM problems) THEN
    INSERT INTO problems (plot_code, problem_date, problem_type, severity, description, solution, resolved) VALUES
      ('T2', CURRENT_DATE-3,  'worm',        'medium', 'พบหนอนกัดใบ',   'ฉีดสมุนไพรไล่แมลง', false),
      ('T5', CURRENT_DATE-5,  'fungus',      'high',   'เชื้อราที่โคนต้น', '',                 false),
      ('T1', CURRENT_DATE-12, 'burned_leaf', 'low',    'ใบไหม้จากแดด',   'ขึงสแลน',           true);
  END IF;

  -- งานวันนี้
  IF NOT EXISTS (SELECT 1 FROM todos) THEN
    INSERT INTO todos (todo_date, task, is_done, sort_order) VALUES
      (CURRENT_DATE, 'รดน้ำแปลง T1–T8', true,  0),
      (CURRENT_DATE, 'ตรวจหนอนแปลง T2', false, 1),
      (CURRENT_DATE, 'เตรียมแพ็คผักส่งลูกค้า', false, 2);
  END IF;

  -- ตั้งสถานะแปลงบางแปลงให้กำลังปลูก/ใกล้เก็บเกี่ยว (เฉพาะแปลงที่ยังว่าง)
  UPDATE plots SET vegetable_type='butterhead', plant_date=CURRENT_DATE-18, plant_age_days=18, harvest_date=CURRENT_DATE+12, estimated_kg=9.5  WHERE plot_code='T4' AND plant_date IS NULL;
  UPDATE plots SET vegetable_type='green_oak',  plant_date=CURRENT_DATE-20, plant_age_days=20, harvest_date=CURRENT_DATE+10, estimated_kg=11.0 WHERE plot_code='T5' AND plant_date IS NULL;
  UPDATE plots SET vegetable_type='red_oak',    plant_date=CURRENT_DATE-22, plant_age_days=22, harvest_date=CURRENT_DATE+8,  estimated_kg=12.5 WHERE plot_code='T6' AND plant_date IS NULL;
  UPDATE plots SET vegetable_type='finley',     plant_date=CURRENT_DATE-24, plant_age_days=24, harvest_date=CURRENT_DATE+6,  estimated_kg=14.0 WHERE plot_code='T7' AND plant_date IS NULL;
  UPDATE plots SET vegetable_type='cos',        plant_date=CURRENT_DATE-26, plant_age_days=26, harvest_date=CURRENT_DATE+4,  estimated_kg=15.5 WHERE plot_code='T8' AND plant_date IS NULL;
END $$;

-- ===========================
-- VegFarm App - Supabase Schema (idempotent — รันซ้ำได้ปลอดภัย)
-- ===========================

-- 1. รอบการเพาะเมล็ด (Seed Batches)
CREATE TABLE IF NOT EXISTS seed_batches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  seed_date DATE NOT NULL,
  vegetable_types TEXT[] NOT NULL, -- ['green_oak', 'red_oak', 'finley']
  seed_count INTEGER NOT NULL,
  weather_condition TEXT NOT NULL CHECK (weather_condition IN ('hot', 'rainy', 'cold')),
  survival_rate NUMERIC(5,2),       -- คำนวณจาก weather
  harvest_date DATE,                -- seed_date + 45 วัน
  estimated_kg NUMERIC(8,2),        -- คำนวณจาก weather + seed_count
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. แปลงปลูก (Plots T1-T15)
CREATE TABLE IF NOT EXISTS plots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plot_code TEXT UNIQUE NOT NULL, -- T1, T2, ..., T15
  vegetable_type TEXT,
  plant_date DATE,
  plant_age_days INTEGER,
  harvest_date DATE,              -- plant_date + 30 วัน
  estimated_kg NUMERIC(8,2),
  actual_kg NUMERIC(8,2),
  is_harvested BOOLEAN DEFAULT FALSE,
  harvest_notes TEXT,
  cycle_count INTEGER DEFAULT 1,
  seed_batch_id UUID REFERENCES seed_batches(id),
  qr_code_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ประวัติการปลูกแต่ละแปลง
CREATE TABLE IF NOT EXISTS plot_cycles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plot_code TEXT NOT NULL,
  cycle_number INTEGER NOT NULL,
  vegetable_type TEXT,
  plant_date DATE,
  harvest_date DATE,
  actual_kg NUMERIC(8,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. บันทึกปัญหา (Problem Log)
CREATE TABLE IF NOT EXISTS problems (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plot_code TEXT NOT NULL,
  problem_date DATE NOT NULL,
  problem_type TEXT NOT NULL CHECK (problem_type IN ('burned_leaf', 'root_rot', 'worm', 'fungus', 'other')),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  description TEXT,
  solution TEXT,
  photo_url TEXT,
  cycle_number INTEGER,
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. To-Do รายวัน
CREATE TABLE IF NOT EXISTS todos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  todo_date DATE NOT NULL DEFAULT CURRENT_DATE,
  task TEXT NOT NULL,
  is_done BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. กิจกรรมสำหรับปฏิทิน
CREATE TABLE IF NOT EXISTS calendar_activities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  activity_date DATE NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('seeding', 'planting', 'harvesting', 'problem', 'todo')),
  reference_id UUID,        -- อ้างอิง id จาก table อื่น
  plot_code TEXT,
  summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. รายรับ (Income)
CREATE TABLE IF NOT EXISTS income (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  income_date DATE NOT NULL,
  plot_code TEXT,
  vegetable_type TEXT,
  kg_sold NUMERIC(8,2) NOT NULL,
  price_per_kg NUMERIC(8,2) NOT NULL,
  total_amount NUMERIC(10,2) NOT NULL,
  buyer TEXT,
  channel TEXT CHECK (channel IN ('market','delivery','direct','wholesale','other')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. รายจ่าย (Expenses)
CREATE TABLE IF NOT EXISTS expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_date DATE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('seed','fertilizer','labor','utility','equipment','packaging','transport','other')),
  amount NUMERIC(10,2) NOT NULL,
  description TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. ลูกค้า (Customers)
CREATE TABLE IF NOT EXISTS customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  weekly_kg NUMERIC(8,2),
  type TEXT DEFAULT 'customer' CHECK (type IN ('customer','farm')),
  tag TEXT DEFAULT 'new' CHECK (tag IN ('new','regular','general')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. รายจ่ายส่วนตัว (Personal expenses) — แยกบัญชีจากฟาร์ม
CREATE TABLE IF NOT EXISTS personal_expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_date DATE NOT NULL,
  category TEXT NOT NULL,   -- หมวดยืดหยุ่น (food/coffee/living/loan/health/transport/other หรือกำหนดเอง)
  amount NUMERIC(10,2) NOT NULL,
  description TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- เผื่อเคยสร้างตารางแบบมี CHECK เดิมไว้ ให้ปลดออกเพื่อรองรับหมวดใหม่ (เช่น กาแฟ)
ALTER TABLE personal_expenses DROP CONSTRAINT IF EXISTS personal_expenses_category_check;

-- ===========================
-- Row Level Security (RLS) — allow all (ปรับให้รัดกุมขึ้นได้ภายหลัง)
-- ===========================
ALTER TABLE seed_batches        ENABLE ROW LEVEL SECURITY;
ALTER TABLE plots               ENABLE ROW LEVEL SECURITY;
ALTER TABLE plot_cycles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE problems            ENABLE ROW LEVEL SECURITY;
ALTER TABLE todos               ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE income              ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_expenses   ENABLE ROW LEVEL SECURITY;

-- Policies (drop ก่อนสร้างใหม่ เพื่อให้รันซ้ำได้)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'seed_batches','plots','plot_cycles','problems','todos',
    'calendar_activities','income','expenses','customers','personal_expenses'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Allow all" ON %I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "Allow all for authenticated" ON %I;', t);
    EXECUTE format('CREATE POLICY "Allow all" ON %I FOR ALL USING (true) WITH CHECK (true);', t);
  END LOOP;
END $$;

-- ===========================
-- Initialize Plots T1-T15
-- ===========================
INSERT INTO plots (plot_code, cycle_count) VALUES
('T1',1),('T2',1),('T3',1),('T4',1),('T5',1),
('T6',1),('T7',1),('T8',1),('T9',1),('T10',1),
('T11',1),('T12',1),('T13',1),('T14',1),('T15',1)
ON CONFLICT (plot_code) DO NOTHING;

-- รีโหลด schema cache ของ PostgREST (กัน error "table not found in schema cache")
NOTIFY pgrst, 'reload schema';

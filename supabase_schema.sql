-- ===========================
-- VegFarm App - Supabase Schema
-- ===========================

-- 1. รอบการเพาะเมล็ด (Seed Batches)
CREATE TABLE seed_batches (
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
CREATE TABLE plots (
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
CREATE TABLE plot_cycles (
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
CREATE TABLE problems (
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
CREATE TABLE todos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  todo_date DATE NOT NULL DEFAULT CURRENT_DATE,
  task TEXT NOT NULL,
  is_done BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. กิจกรรมสำหรับปฏิทิน
CREATE TABLE calendar_activities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  activity_date DATE NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('seeding', 'planting', 'harvesting', 'problem', 'todo')),
  reference_id UUID,        -- อ้างอิง id จาก table อื่น
  plot_code TEXT,
  summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================
-- Row Level Security (RLS)
-- ===========================
ALTER TABLE seed_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE plots ENABLE ROW LEVEL SECURITY;
ALTER TABLE plot_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_activities ENABLE ROW LEVEL SECURITY;

-- Allow all for authenticated users (ปรับตามต้องการ)
CREATE POLICY "Allow all for authenticated" ON seed_batches FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON plots FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON plot_cycles FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON problems FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON todos FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON calendar_activities FOR ALL USING (true);

-- ===========================
-- Initialize Plots T1-T15
-- ===========================
INSERT INTO plots (plot_code, cycle_count) VALUES
('T1',1),('T2',1),('T3',1),('T4',1),('T5',1),
('T6',1),('T7',1),('T8',1),('T9',1),('T10',1),
('T11',1),('T12',1),('T13',1),('T14',1),('T15',1)
ON CONFLICT (plot_code) DO NOTHING;

-- ===========================
-- Finance Module — เพิ่มเติม
-- ===========================

-- 7. รายรับ (Income)
CREATE TABLE income (
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
CREATE TABLE expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_date DATE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('seed','fertilizer','labor','utility','equipment','packaging','transport','other')),
  amount NUMERIC(10,2) NOT NULL,
  description TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE income   ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON income   FOR ALL USING (true);
CREATE POLICY "Allow all" ON expenses FOR ALL USING (true);

-- calendar_activities เพิ่ม activity_type ใหม่ (income)
-- ไม่ต้อง migrate เพราะ type เป็น TEXT ธรรมดา

-- ===========================
-- Customers Module — เพิ่มเติม
-- ===========================
CREATE TABLE customers (
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
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON customers FOR ALL USING (true);

-- Add buyer column to income if not exists (for customer tracking)
-- ALTER TABLE income ADD COLUMN IF NOT EXISTS buyer TEXT;
-- ALTER TABLE income ADD COLUMN IF NOT EXISTS channel TEXT;

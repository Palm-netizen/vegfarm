-- ============================================================
-- Coach App — Supabase schema
-- รันใน Supabase: Dashboard → SQL Editor → New query → วางทั้งหมด → Run
-- ============================================================

-- 1) Training — บันทึกการฝึกแต่ละทักษะต่อวัน (1 แถว/วัน/ทักษะ)
create table if not exists training_log (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  skill_key text not null,
  count int not null default 0,
  created_at timestamptz default now(),
  unique (date, skill_key)
);

-- 2) Tasks / To-do
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date date not null,
  status text not null default 'pending',  -- pending | doing | done
  created_at timestamptz default now()
);

-- 3) Calendar events (นัดหมายมีเวลา)
create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  time time,
  title text not null,
  created_at timestamptz default now()
);

-- 4) Customers (CRM)
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  occupation text,
  age int,
  interests text,
  goal text,
  focus text,
  likes text,
  created_at timestamptz default now()
);

-- 4b) ประวัติการคุยของลูกค้า
create table if not exists customer_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  date date not null,
  note text not null,
  created_at timestamptz default now()
);

-- 5) Daily review (สรุปประจำวัน — 1 แถว/วัน)
create table if not exists daily_reviews (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  did_well text,
  learned text,
  improve text,
  created_at timestamptz default now()
);

-- 6) Goals (เป้าหมายรายเดือน)
create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  target int not null default 1,
  current int not null default 0,
  month text not null,          -- 'YYYY-MM'
  created_at timestamptz default now()
);

-- ============================================================
-- Row Level Security
-- เริ่มต้นแบบ "เปิดให้ใช้ได้ทันที" (allow all) เพื่อความง่าย
-- ⚠️ ใช้งานจริงควรผูกกับ auth.uid() เพื่อความปลอดภัย
-- ============================================================
alter table training_log    enable row level security;
alter table tasks           enable row level security;
alter table calendar_events enable row level security;
alter table customers       enable row level security;
alter table customer_notes  enable row level security;
alter table daily_reviews   enable row level security;
alter table goals           enable row level security;

do $$
declare t text;
begin
  foreach t in array array['training_log','tasks','calendar_events','customers','customer_notes','daily_reviews','goals']
  loop
    execute format('drop policy if exists "allow all" on %I;', t);
    execute format('create policy "allow all" on %I for all using (true) with check (true);', t);
  end loop;
end $$;

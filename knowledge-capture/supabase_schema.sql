-- ============================================================
-- Knowledge Capture — Supabase schema
-- แอปนี้แยกอิสระจาก VegFarm ทั้งหมด แนะนำให้สร้าง Supabase project ใหม่
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists notes (
  id             uuid primary key default gen_random_uuid(),
  book_title     text not null,
  read_date      date not null default current_date,
  highlights     text[] not null default '{}',
  insight        text default '',
  action         text default '',
  action_done    boolean not null default false,
  importance     smallint not null default 3 check (importance between 1 and 5),
  tags           text[] not null default '{}',
  image_urls     text[] not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint highlights_max_5 check (array_length(highlights, 1) is null or array_length(highlights, 1) <= 5),
  constraint image_urls_max_2 check (array_length(image_urls, 1) is null or array_length(image_urls, 1) <= 2)
);

create index if not exists notes_read_date_idx on notes (read_date);
create index if not exists notes_tags_idx on notes using gin (tags);
create index if not exists notes_book_title_idx on notes (book_title);
create index if not exists notes_search_idx on notes using gin (
  to_tsvector('simple',
    coalesce(book_title, '') || ' ' ||
    coalesce(insight, '') || ' ' ||
    coalesce(action, '') || ' ' ||
    array_to_string(highlights, ' ') || ' ' ||
    array_to_string(tags, ' ')
  )
);

-- Keep updated_at fresh
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists notes_set_updated_at on notes;
create trigger notes_set_updated_at
  before update on notes
  for each row execute function set_updated_at();

-- RLS — เปิดใช้งานแบบ "allow all" เพื่อความง่ายในการเริ่มต้น (ดูคำเตือนใน README)
alter table notes enable row level security;

drop policy if exists "allow all" on notes;
create policy "allow all" on notes for all using (true) with check (true);

-- ============================================================
-- Storage: สร้าง bucket ชื่อ "knowledge-photos" (Public) ผ่าน Dashboard → Storage
-- ใช้เก็บรูปสูงสุด 2 รูปต่อบันทึก
-- ============================================================

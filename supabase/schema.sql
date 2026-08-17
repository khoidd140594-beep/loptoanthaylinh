-- ============================================================
-- EduCenter – Supabase Schema
-- Paste vào: Supabase Dashboard → SQL Editor → Run
-- ============================================================

create extension if not exists "uuid-ossp";

-- ── Profiles (gắn với auth.users) ──────────────────────────
create table if not exists profiles (
  id       uuid references auth.users primary key,
  email    text unique not null,
  name     text,
  role     text check (role in ('ADMIN','TEACHER','TA')) default 'TEACHER',
  active   boolean default true,
  created_at timestamptz default now()
);

-- Tự tạo profile khi user đăng ký
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'TEACHER'
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Students ────────────────────────────────────────────────
create table if not exists students (
  id           uuid default uuid_generate_v4() primary key,
  student_code text unique not null,
  full_name    text not null,
  date_of_birth text,
  password     text,
  parent_name  text,
  parent_phone text,
  parent_email text,
  zalo         text,
  email        text,
  school       text,
  grade        text,
  address      text,
  note         text,
  status       text default 'active',
  created_at   timestamptz default now()
);

-- ── Classes ─────────────────────────────────────────────────
create table if not exists classes (
  id               uuid default uuid_generate_v4() primary key,
  class_name       text not null,
  subject          text default 'Toán',
  grade            text,
  fee_per_session  numeric default 0,
  planned_sessions integer default 0,
  start_date       date,
  max_students     integer default 30,
  room             text,
  school           text,
  schedule         text,
  note             text,
  status           text default 'active',
  teacher_id       uuid references profiles(id) on delete set null,
  created_at       timestamptz default now()
);

-- ── Teacher–Class mapping ───────────────────────────────────
create table if not exists teacher_classes (
  id            uuid default uuid_generate_v4() primary key,
  teacher_id    uuid references profiles(id) on delete cascade,
  class_id      uuid references classes(id) on delete cascade,
  assigned_date date default current_date,
  status        text default 'active',
  unique(teacher_id, class_id)
);

-- ── Enrollments ─────────────────────────────────────────────
create table if not exists enrollments (
  id          uuid default uuid_generate_v4() primary key,
  student_id  uuid references students(id) on delete cascade,
  class_id    uuid references classes(id) on delete cascade,
  enroll_date date default current_date,
  status      text default 'active',
  note        text,
  unique(student_id, class_id)
);

-- ── Attendance ──────────────────────────────────────────────
create table if not exists attendance (
  id         uuid default uuid_generate_v4() primary key,
  date       date not null,
  class_id   uuid references classes(id) on delete cascade,
  student_id uuid references students(id) on delete cascade,
  present    boolean default false,
  late       boolean default false,
  status     text default 'present',
  note       text,
  by_user    uuid references profiles(id),
  created_at timestamptz default now(),
  unique(date, class_id, student_id)
);

-- ── Payments ────────────────────────────────────────────────
create table if not exists payments (
  id         uuid default uuid_generate_v4() primary key,
  date       date default current_date,
  student_id uuid references students(id) on delete cascade,
  class_id   uuid references classes(id) on delete cascade,
  amount     numeric not null,
  method     text default 'cash',
  note       text,
  by_user    uuid references profiles(id),
  created_at timestamptz default now()
);

-- ── Email Logs ──────────────────────────────────────────────
create table if not exists email_logs (
  id              uuid default uuid_generate_v4() primary key,
  type            text, -- 'tuition' | 'attendance' | 'payment_confirm'
  recipient_email text,
  student_id      uuid references students(id),
  class_id        uuid references classes(id),
  subject         text,
  status          text, -- 'sent' | 'failed'
  error_msg       text,
  by_user         uuid references profiles(id),
  created_at      timestamptz default now()
);

-- ── Exams (Ngân hàng đề thi LaTeX/Word/PDF) ───────────────────
create table if not exists public.exams (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  data jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz default now()
);

-- ── Exam Images (Ảnh bóc tách từ TikZ/LaTeX) ─────────────────
create table if not exists public.exam_images (
  id uuid default uuid_generate_v4() primary key,
  exam_id uuid references public.exams(id) on delete cascade,
  question_number integer,
  image_index integer,
  image_id text,
  filename text,
  content_type text,
  base64 text,
  created_at timestamptz default now()
);

-- ── Exam Rooms (Phòng thi trực tuyến) ───────────────────────
create table if not exists public.exam_rooms (
  id uuid default uuid_generate_v4() primary key,
  code text unique not null,
  exam_id uuid references public.exams(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  opens_at timestamptz,
  closes_at timestamptz,
  duration integer,
  status text default 'active',
  settings jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- ── Exam Submissions (Kết quả nộp bài thi) ───────────────────
create table if not exists public.exam_submissions (
  id uuid default uuid_generate_v4() primary key,
  room_id uuid references public.exam_rooms(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  student_name text,
  answers jsonb default '{}'::jsonb,
  score numeric,
  total_score numeric,
  details jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- ── Question Banks (Ngân hàng câu hỏi) ─────────────────────
create table if not exists public.question_banks (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  grade text,
  subject text default 'Toán',
  questions jsonb default '[]'::jsonb,
  created_by uuid,
  created_at timestamptz default now()
);

-- ── Courses, Chapters, Lessons (Khóa học & Bài giảng) ────────
create table if not exists public.courses (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  description text,
  is_published boolean default false,
  assigned_class_ids text[] default '{}',
  created_at timestamptz default now()
);

create table if not exists public.chapters (
  id uuid default uuid_generate_v4() primary key,
  course_id uuid references public.courses(id) on delete cascade,
  title text not null,
  order_index integer default 0,
  created_at timestamptz default now()
);

create table if not exists public.lessons (
  id uuid default uuid_generate_v4() primary key,
  chapter_id uuid references public.chapters(id) on delete cascade,
  title text not null,
  content text,
  video_url text,
  exam_id uuid references public.exams(id) on delete set null,
  order_index integer default 0,
  created_at timestamptz default now()
);

-- ── Presentations (Bài giảng trình chiếu HTML) ───────────────
create table if not exists public.presentations (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  source_type text default 'latex',
  lesson_id uuid references public.lessons(id) on delete set null,
  storage_path text not null,
  slide_count integer default 0,
  model text,
  created_by uuid,
  created_at timestamptz default now()
);

-- ── Row Level Security ──────────────────────────────────────
alter table profiles         enable row level security;
alter table students         enable row level security;
alter table classes          enable row level security;
alter table enrollments       enable row level security;
alter table attendance       enable row level security;
alter table payments         enable row level security;
alter table email_logs       enable row level security;
alter table teacher_classes  enable row level security;
alter table exams            enable row level security;
alter table exam_images      enable row level security;
alter table exam_rooms       enable row level security;
alter table exam_submissions enable row level security;
alter table question_banks   enable row level security;
alter table courses          enable row level security;
alter table chapters         enable row level security;
alter table lessons          enable row level security;
alter table presentations    enable row level security;

-- Policies for public / authenticated access
create policy "allow_all_profiles"       on profiles       for all using (true) with check (true);
create policy "allow_all_students"       on students       for all using (true) with check (true);
create policy "allow_all_classes"        on classes        for all using (true) with check (true);
create policy "allow_all_enrollments"    on enrollments    for all using (true) with check (true);
create policy "allow_all_attendance"     on attendance     for all using (true) with check (true);
create policy "allow_all_payments"       on payments       for all using (true) with check (true);
create policy "allow_all_email_logs"     on email_logs     for all using (true) with check (true);
create policy "allow_all_teacher_cls"    on teacher_classes for all using (true) with check (true);
create policy "allow_all_exams"          on exams          for all using (true) with check (true);
create policy "allow_all_exam_images"    on exam_images    for all using (true) with check (true);
create policy "allow_all_exam_rooms"     on exam_rooms     for all using (true) with check (true);
create policy "allow_all_exam_subs"      on exam_submissions for all using (true) with check (true);
create policy "allow_all_qbanks"         on question_banks for all using (true) with check (true);
create policy "allow_all_courses"        on courses        for all using (true) with check (true);
create policy "allow_all_chapters"       on chapters       for all using (true) with check (true);
create policy "allow_all_lessons"        on lessons        for all using (true) with check (true);
create policy "allow_all_presentations"  on presentations  for all using (true) with check (true);

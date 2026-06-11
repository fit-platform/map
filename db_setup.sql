-- ============================================================
--  FIT Platform - 데이터베이스 초기 설정
--  Supabase 대시보드 → 좌측 "SQL Editor" → 붙여넣고 "Run"
-- ============================================================

-- 1) 메모를 저장할 표(table) 만들기
create table if not exists public.notes (
  id          bigint generated always as identity primary key,
  content     text not null,
  created_by  text,
  created_at  timestamptz not null default now()
);

-- 2) 자물쇠(RLS) 켜기 — 기본은 "아무도 접근 불가"
alter table public.notes enable row level security;

-- 3) 로그인한 팀원에게만 권한 부여
grant select, insert, delete on public.notes to authenticated;

-- 4) 접근 규칙: "로그인한 사용자만" 읽기/쓰기/삭제 가능
--    (로그인 안 한 외부인 = anon 역할은 규칙이 없으므로 전부 차단됨)
drop policy if exists "team_select" on public.notes;
create policy "team_select" on public.notes
  for select to authenticated using (true);

drop policy if exists "team_insert" on public.notes;
create policy "team_insert" on public.notes
  for insert to authenticated with check (true);

drop policy if exists "team_delete" on public.notes;
create policy "team_delete" on public.notes
  for delete to authenticated using (true);

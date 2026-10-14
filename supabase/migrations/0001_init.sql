-- 0001_init: PRD 4.3 전체 스키마, RLS, 가입 트리거, 데모 데이터 함수
-- 이 파일은 적용 후 수정하지 않는다. 변경은 새 마이그레이션 파일로 한다(docs/sessions/README.md 5절).
--
-- 규칙
--   금액 bigint(원), 일시 timestamptz, 날짜 date, 반복 rrule text(RFC 5545 RRULE 본문, 'RRULE:' 접두어 없음)
--   열거형은 check 제약, 모든 사용자 테이블은 user_id = auth.uid() RLS

-- ─────────────────────────────────────────────────────────────
-- 공통: updated_at 자동 갱신
-- ─────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 프로필 · 일정
-- ─────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users on delete cascade,
  name text not null default '',
  timezone text not null default 'Asia/Seoul',
  week_start smallint not null default 0 check (week_start in (0, 1)), -- 0=일, 1=월
  theme text not null default 'dark' check (theme in ('light', 'dark', 'system')),
  default_view text not null default 'month' check (default_view in ('month', 'week', 'day')),
  -- { lat, lon, nx, ny, label } (기상청 격자 좌표 포함, 04 세션이 채운다)
  weather_location jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.event_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  color text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

-- 구글 연동 테이블은 events가 참조하므로 먼저 만든다.
create table public.google_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  google_email text not null,
  -- refresh token 원문은 Vault(vault.secrets)에 두고 그 id만 저장한다. 클라이언트에서는 조회할 수 없다(아래 컬럼 권한).
  refresh_token_secret_id uuid,
  access_token_expires_at timestamptz,
  status text not null default 'active' check (status in ('active', 'reauth_required', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, google_email)
);

create table public.google_calendars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  google_account_id uuid not null references public.google_accounts on delete cascade,
  calendar_id text not null,
  name text not null,
  color text,
  sync_direction text not null default 'both' check (sync_direction in ('import', 'export', 'both')),
  enabled boolean not null default true,
  sync_token text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (google_account_id, calendar_id)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz, -- 종일 일정은 다음 날 0시(배타적 끝)
  all_day boolean not null default false,
  location text not null default '',
  memo text not null default '',
  category_id uuid references public.event_categories on delete set null,
  rrule text,
  recurrence_parent_id uuid references public.events on delete cascade,
  exdates date[] not null default '{}', -- 반복에서 제외할 회차 날짜(RFC 5545 EXDATE)
  original_date date, -- 예외 일정(recurrence_parent_id 있음)이 대체하는 원래 회차 날짜
  reminder_minutes int check (reminder_minutes >= 0), -- null=알림 없음
  source text not null default 'local' check (source in ('local', 'google')),
  google_calendar_id uuid references public.google_calendars on delete set null,
  google_event_id text,
  google_etag text,
  deleted_at timestamptz, -- 소프트 삭제(구글 내보내기 반영 전까지 보관)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, google_event_id),
  check (end_at is null or end_at >= start_at)
);

-- ─────────────────────────────────────────────────────────────
-- 할일
-- ─────────────────────────────────────────────────────────────
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  color text,
  sort_order int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null,
  memo text not null default '',
  due_date date,
  due_at timestamptz, -- 시각까지 정한 마감(있으면 due_date도 같은 날로 채운다)
  priority smallint not null default 2 check (priority between 1 and 3), -- 1=높음, 2=보통, 3=낮음
  project_id uuid references public.projects on delete set null,
  parent_id uuid references public.todos on delete cascade, -- 서브태스크
  completed_at timestamptz,
  rrule text,
  event_id uuid references public.events on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 가계부
-- ─────────────────────────────────────────────────────────────
create table public.tx_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  type text not null check (type in ('income', 'expense')),
  name text not null,
  icon text,
  color text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, type, name)
);

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  type text not null check (type in ('cash', 'card', 'account')),
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  type text not null check (type in ('income', 'expense')),
  amount bigint not null check (amount > 0),
  day_of_month smallint not null check (day_of_month between 1 and 31),
  category_id uuid references public.tx_categories on delete set null,
  payment_method_id uuid references public.payment_methods on delete set null,
  memo text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  type text not null check (type in ('income', 'expense')),
  amount bigint not null check (amount > 0), -- 원 단위 양수. 부호는 type으로 구분
  occurred_on date not null,
  category_id uuid references public.tx_categories on delete set null,
  payment_method_id uuid references public.payment_methods on delete set null,
  memo text not null default '',
  recurring_id uuid references public.recurring_transactions on delete set null,
  event_id uuid references public.events on delete set null,
  via_mcp boolean not null default false, -- MCP(Claude)로 등록한 내역. 화면의 "· Claude" 표시
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'), -- YYYY-MM
  category_id uuid references public.tx_categories on delete cascade, -- null = 월 전체 예산
  amount bigint not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (user_id, month, category_id)
);

-- ─────────────────────────────────────────────────────────────
-- 구글 동기화 충돌 이력
-- ─────────────────────────────────────────────────────────────
create table public.sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  event_id uuid references public.events on delete cascade,
  local_snapshot jsonb,
  remote_snapshot jsonb,
  resolved_with text check (resolved_with in ('local', 'remote')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 날씨 캐시 (공용, user_id 없음, service role만 읽고 쓴다)
-- ─────────────────────────────────────────────────────────────
create table public.weather_cache (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  grid_key text not null, -- 예: 'nx:ny' 또는 중기예보 구역 코드
  kind text not null check (kind in ('now', 'short', 'mid')),
  base_time timestamptz not null,
  payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, grid_key, kind)
);

-- ─────────────────────────────────────────────────────────────
-- MCP
-- ─────────────────────────────────────────────────────────────
create table public.mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  token_hash text not null unique, -- SHA-256 hex. 원문은 저장하지 않는다
  token_prefix text not null, -- 화면 표시용 앞부분
  scopes text[] not null default '{}', -- 예: {events:read, events:write, todos:read, tx:read, weather:read}
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.mcp_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  token_id uuid references public.mcp_tokens on delete set null,
  tool text not null,
  args jsonb,
  result_summary text,
  status text not null default 'ok' check (status in ('ok', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 알림
-- ─────────────────────────────────────────────────────────────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text not null, -- event / todo / budget / weather / sync
  title text not null,
  body text not null default '',
  ref_type text, -- event / todo / transaction / budget
  ref_id uuid,
  read_at timestamptz,
  send_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 인덱스
-- ─────────────────────────────────────────────────────────────
create index events_user_start_idx on public.events (user_id, start_at);
create index events_parent_idx on public.events (recurrence_parent_id) where recurrence_parent_id is not null;
create index todos_user_due_idx on public.todos (user_id, due_date);
create index todos_parent_idx on public.todos (parent_id) where parent_id is not null;
create index transactions_user_date_idx on public.transactions (user_id, occurred_on);
create index budgets_user_month_idx on public.budgets (user_id, month);
create index mcp_audit_logs_user_created_idx on public.mcp_audit_logs (user_id, created_at desc);
create index notifications_user_send_idx on public.notifications (user_id, send_at desc);

-- ─────────────────────────────────────────────────────────────
-- updated_at 트리거, RLS
-- ─────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'event_categories', 'google_accounts', 'google_calendars', 'events',
    'projects', 'todos', 'tx_categories', 'payment_methods', 'recurring_transactions',
    'transactions', 'budgets', 'sync_conflicts', 'weather_cache', 'mcp_tokens',
    'mcp_audit_logs', 'notifications'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;

  -- weather_cache는 사용자 정책을 만들지 않는다(service role 전용).
  foreach t in array array[
    'profiles', 'event_categories', 'google_accounts', 'google_calendars', 'events',
    'projects', 'todos', 'tx_categories', 'payment_methods', 'recurring_transactions',
    'transactions', 'budgets', 'sync_conflicts', 'mcp_tokens', 'mcp_audit_logs', 'notifications'
  ] loop
    execute format(
      'create policy "%1$s_select_own" on public.%1$I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format(
      'create policy "%1$s_insert_own" on public.%1$I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format(
      'create policy "%1$s_update_own" on public.%1$I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format(
      'create policy "%1$s_delete_own" on public.%1$I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end;
$$;

-- user_id 기본값: 클라이언트가 insert 때 user_id를 생략해도 본인 id가 들어간다.
do $$
declare
  t text;
begin
  foreach t in array array[
    'event_categories', 'google_accounts', 'google_calendars', 'events',
    'projects', 'todos', 'tx_categories', 'payment_methods', 'recurring_transactions',
    'transactions', 'budgets', 'sync_conflicts', 'mcp_tokens', 'mcp_audit_logs', 'notifications'
  ] loop
    execute format('alter table public.%I alter column user_id set default auth.uid()', t);
  end loop;
end;
$$;

-- 날씨 캐시는 브라우저에서 접근하지 않는다.
revoke all on public.weather_cache from anon, authenticated;

-- google_accounts: 토큰 관련 컬럼은 클라이언트가 읽거나 쓰지 못한다. 쓰기는 Edge Function(service role)이 한다.
revoke select, insert, update on public.google_accounts from anon, authenticated;
grant select (id, user_id, google_email, access_token_expires_at, status, created_at, updated_at)
  on public.google_accounts to authenticated;
grant update (status) on public.google_accounts to authenticated;

-- 연결 해제·탈퇴로 계정 행이 지워지면 Vault의 refresh token도 함께 지운다.
create or replace function public.delete_google_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.refresh_token_secret_id is not null then
    delete from vault.secrets where id = old.refresh_token_secret_id;
  end if;
  return old;
end;
$$;

create trigger delete_google_secret after delete on public.google_accounts
  for each row execute function public.delete_google_secret();

-- ─────────────────────────────────────────────────────────────
-- 가입 트리거: 프로필과 기본 데이터
-- ─────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := new.id;
begin
  insert into public.profiles (user_id, name)
  values (
    uid,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      split_part(coalesce(new.email, ''), '@', 1)
    )
  );

  insert into public.event_categories (user_id, name, color, sort_order) values
    (uid, '업무', 'oklch(0.72 0.17 50)', 0),
    (uid, '개인', 'oklch(0.62 0.1 240)', 1),
    (uid, '가족', 'oklch(0.65 0.12 330)', 2),
    (uid, '운동', 'oklch(0.7 0.1 150)', 3);

  insert into public.tx_categories (user_id, type, name, color, sort_order) values
    (uid, 'expense', '식비', 'oklch(0.72 0.17 50)', 0),
    (uid, 'expense', '카페', 'oklch(0.62 0.1 240)', 1),
    (uid, 'expense', '교통', 'oklch(0.7 0.1 150)', 2),
    (uid, 'expense', '주거', 'rgb(255 255 255 / 0.25)', 3),
    (uid, 'expense', '통신', null, 4),
    (uid, 'expense', '쇼핑', 'oklch(0.65 0.12 330)', 5),
    (uid, 'expense', '의료', null, 6),
    (uid, 'expense', '문화', null, 7),
    (uid, 'expense', '경조사', null, 8),
    (uid, 'expense', '기타', null, 9),
    (uid, 'income', '급여', 'rgb(255 255 255 / 0.18)', 0),
    (uid, 'income', '부수입', 'rgb(255 255 255 / 0.18)', 1),
    (uid, 'income', '기타', null, 2);

  insert into public.payment_methods (user_id, type, name, sort_order) values
    (uid, 'cash', '현금', 0),
    (uid, 'card', '카드', 1),
    (uid, 'account', '계좌', 2);

  insert into public.projects (user_id, name, sort_order) values
    (uid, '업무', 0),
    (uid, '개인', 1),
    (uid, '가족', 2);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- 데모 데이터: seed_demo(uid)
--   src/lib/mock-data.ts 시안 데이터를 그 사용자에게 넣는다. 시안 기준일(10/14)을 실행일(사용자 타임존)로 옮긴다.
--   해당 사용자의 일정·할일·가계부 내역·고정지출·예산을 지우고 다시 넣는다(테스트 계정 전용).
--   사용: select public.seed_demo('<user uuid>');  또는 로그인한 클라이언트에서 rpc('seed_demo', { uid })
-- ─────────────────────────────────────────────────────────────
create or replace function public.seed_demo(uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_today date;
  v_month_start date;
  r record;
  k int;
begin
  -- 로그인한 사용자는 자기 계정만 채울 수 있다(SQL 편집기·service role은 auth.uid()가 null).
  if auth.uid() is not null and auth.uid() <> uid then
    raise exception 'seed_demo: 본인 계정만 채울 수 있습니다.';
  end if;

  select timezone into v_tz from public.profiles where user_id = uid;
  if v_tz is null then
    raise exception 'seed_demo: 프로필이 없는 사용자입니다: %', uid;
  end if;
  v_today := (now() at time zone v_tz)::date;
  v_month_start := date_trunc('month', v_today)::date;

  delete from public.todos where user_id = uid;
  delete from public.transactions where user_id = uid;
  delete from public.recurring_transactions where user_id = uid;
  delete from public.budgets where user_id = uid;
  delete from public.events where user_id = uid;

  -- 일정: (시안 날짜, 시작 시각 또는 null=종일, 제목, 카테고리, 장소, 구글 출처)
  for r in
    select * from (values
      (2, '10:00', '분기 킥오프', '업무', '본사 3층', true),
      (3, null, '개천절', '가족', '', true),
      (6, '19:00', '요가', '운동', '합정', false),
      (9, null, '한글날', '가족', '', true),
      (10, '13:00', '친구 결혼식', '개인', '더채플', false),
      (13, '19:00', 'PT 수업', '운동', '합정 피트니스', false),
      (14, null, '엄마 생신', '가족', '본가', true),
      (14, '10:00', '주간 팀 회의', '업무', '본사 3층', true),
      (14, '12:30', '점심 약속', '개인', '강남역', false),
      (14, '19:00', 'PT 수업', '운동', '합정 피트니스', false),
      (15, '15:00', '치과 예약', '개인', '연남 치과', false),
      (16, '15:00', '주간 정리', '업무', '본사', true),
      (17, '08:00', '북한산 등산', '개인', '북한산', false),
      (20, '10:00', '디자인 리뷰', '업무', '본사', true),
      (20, '19:00', 'PT 수업', '운동', '합정 피트니스', false),
      (22, '14:00', '클라이언트 미팅', '업무', '판교', true),
      (25, '12:00', '카드 결제일', '개인', '', false),
      (27, '19:00', 'PT 수업', '운동', '합정 피트니스', false),
      (31, '18:00', '할로윈 모임', '개인', '이태원', false)
    ) as t(d, start_time, title, category, location, google)
  loop
    insert into public.events (
      user_id, title, start_at, end_at, all_day, location, category_id,
      reminder_minutes, source, google_event_id
    )
    values (
      uid,
      r.title,
      case when r.start_time is null
        then (v_today + (r.d - 14))::timestamp at time zone v_tz
        else ((v_today + (r.d - 14)) + r.start_time::time) at time zone v_tz end,
      case when r.start_time is null
        then (v_today + (r.d - 13))::timestamp at time zone v_tz
        else null end,
      r.start_time is null,
      r.location,
      (select id from public.event_categories where user_id = uid and name = r.category),
      10,
      case when r.google then 'google' else 'local' end,
      case when r.google then 'demo-' || gen_random_uuid() else null end
    );
  end loop;

  -- 할일: (제목, 시안 마감일, 우선순위, 프로젝트, 메모, 완료, 반복, 연결 일정 제목)
  for r in
    select * from (values
      ('보험 서류 제출', 12, 1, '개인', '', false, null, null),
      ('분기 보고서 초안', 14, 1, '업무', '체크리스트 2/4', false, null, null),
      ('치과 예약 확인', 14, 2, '개인', '', false, null, null),
      ('택배 반품 접수', 14, 3, '개인', '', false, null, null),
      ('생신 선물 포장', 14, 2, '가족', '엄마 생신 일정 연결', false, null, '엄마 생신'),
      ('운동 기록 정리', 14, 3, '개인', '매주 수 반복', false, 'FREQ=WEEKLY;BYDAY=WE', null),
      ('디자인 리뷰 자료 준비', 19, 1, '업무', '디자인 리뷰 일정 연결', false, null, '디자인 리뷰'),
      ('등산 장비 점검', 16, 2, '개인', '', false, null, null),
      ('가족 여행 숙소 예약', 24, 2, '가족', '', false, null, null),
      ('공과금 납부', 12, 1, '개인', '매월 12일 반복', true, 'FREQ=MONTHLY;BYMONTHDAY=12', null),
      ('팀 회의 안건 공유', 13, 2, '업무', '', true, null, null),
      ('주간 회고', 16, 2, '개인', '매주 금 반복', false, 'FREQ=WEEKLY;BYDAY=FR', null)
    ) as t(title, d, priority, project, memo, done, rrule, event_title)
  loop
    insert into public.todos (user_id, title, memo, due_date, priority, project_id, completed_at, rrule, event_id)
    values (
      uid,
      r.title,
      r.memo,
      v_today + (r.d - 14),
      r.priority,
      (select id from public.projects where user_id = uid and name = r.project),
      case when r.done then now() else null end,
      r.rrule,
      (select id from public.events where user_id = uid and title = r.event_title limit 1)
    );
  end loop;

  -- 이번 달 내역: (시안 날짜, 분류, 메모, 결제수단, 금액(+수입/-지출), Claude 경유)
  for r in
    select * from (values
      (1, '식비', '점심', '카드', -9000, false),
      (1, '카페', '아메리카노', '카드', -4700, false),
      (1, '교통', '교통카드 충전', '카드', -50000, false),
      (2, '식비', '회식 2차', '카드', -32000, false),
      (2, '카페', '라떼', '카드', -5200, false),
      (3, '식비', '장보기', '카드', -47000, false),
      (4, '교통', '택시', '카드', -17700, false),
      (5, '식비', '점심', '카드', -8500, false),
      (5, '카페', '카페 작업', '카드', -6300, false),
      (5, '부수입', '중고 거래', '계좌', 35000, false),
      (6, '식비', '점심', '카드', -9500, false),
      (6, '카페', '아메리카노', '카드', -4700, false),
      (7, '식비', '배달 저녁', '카드', -27000, true),
      (7, '카페', '디저트', '카드', -12800, false),
      (8, '식비', '점심', '카드', -9000, false),
      (8, '카페', '아메리카노', '카드', -4700, false),
      (9, '주거', '월세', '계좌', -650000, false),
      (9, '주거', '관리비', '계좌', -200000, false),
      (10, '급여', '급여', '계좌', 3450000, false),
      (10, '식비', '장보기', '카드', -41500, false),
      (11, '쇼핑', '생활용품', '카드', -9500, false),
      (12, '식비', '점심', '카드', -10000, false),
      (12, '카페', '카페', '카드', -5500, false),
      (13, '교통', '택시', '카드', -14300, false),
      (13, '식비', '저녁 장보기', '카드', -48000, true),
      (13, '카페', '브런치 카페', '카드', -9400, false),
      (14, '식비', '점심 김밥', '카드', -4500, true),
      (14, '카페', '아메리카노', '카드', -4700, false),
      (14, '쇼핑', '생신 꽃다발', '카드', -39000, false)
    ) as t(d, category, memo, method, amount, via)
  loop
    insert into public.transactions (user_id, type, amount, occurred_on, category_id, payment_method_id, memo, via_mcp)
    values (
      uid,
      case when r.amount > 0 then 'income' else 'expense' end,
      abs(r.amount),
      v_today + (r.d - 14),
      (select id from public.tx_categories
        where user_id = uid and name = r.category and type = case when r.amount > 0 then 'income' else 'expense' end),
      (select id from public.payment_methods where user_id = uid and name = r.method),
      r.memo,
      r.via
    );
  end loop;

  -- 지난 5개월: 시안의 월별 수입·지출 합계가 나오도록 대표 내역만 넣는다.
  -- 1~14일 지출(주거 850,000 + 교통 337,000)은 전월 같은 기간 대비 계산(시안 1,187,000원)에 쓰인다.
  for r in
    select * from (values
      (1, 3450000, 2210000),
      (2, 3680000, 2440000),
      (3, 3450000, 2620000),
      (4, 3450000, 2380000),
      (5, 3450000, 2150000)
    ) as t(months_ago, income, expense)
  loop
    k := r.months_ago;
    insert into public.transactions (user_id, type, amount, occurred_on, category_id, payment_method_id, memo)
    select uid, x.type, x.amount, (v_month_start - make_interval(months => k))::date + (x.day - 1),
      (select id from public.tx_categories where user_id = uid and name = x.category and type = x.type),
      (select id from public.payment_methods where user_id = uid and name = x.method),
      x.memo
    from (values
      ('income', r.income::bigint, 10, '급여', '계좌', '급여'),
      ('expense', 650000::bigint, 9, '주거', '계좌', '월세'),
      ('expense', 200000::bigint, 9, '주거', '계좌', '관리비'),
      ('expense', 337000::bigint, 5, '교통', '카드', '교통비'),
      ('expense', ((r.expense - 1187000) / 2)::bigint, 20, '식비', '카드', '식비'),
      ('expense', (r.expense - 1187000 - (r.expense - 1187000) / 2)::bigint, 25, '쇼핑', '카드', '쇼핑')
    ) as x(type, amount, day, category, method, memo);
  end loop;

  insert into public.recurring_transactions (user_id, type, amount, day_of_month, category_id, payment_method_id, memo)
  values
    (uid, 'expense', 250000, extract(day from v_today + 7)::smallint,
      (select id from public.tx_categories where user_id = uid and name = '기타' and type = 'expense'),
      (select id from public.payment_methods where user_id = uid and name = '계좌'), '보험료'),
    (uid, 'expense', 62000, extract(day from v_today + 11)::smallint,
      (select id from public.tx_categories where user_id = uid and name = '통신' and type = 'expense'),
      (select id from public.payment_methods where user_id = uid and name = '계좌'), '통신비');

  insert into public.budgets (user_id, month, category_id, amount)
  select uid, to_char(v_today, 'YYYY-MM'),
    case when b.category is null then null
      else (select id from public.tx_categories where user_id = uid and name = b.category and type = 'expense') end,
    b.amount
  from (values
    (null, 2000000),
    ('식비', 300000),
    ('카페', 100000),
    ('교통', 200000),
    ('쇼핑', 300000),
    ('주거', 1000000)
  ) as b(category, amount);
end;
$$;

revoke execute on function public.seed_demo(uuid) from public, anon;
grant execute on function public.seed_demo(uuid) to authenticated;

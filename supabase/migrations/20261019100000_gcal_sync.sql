-- 세션 04: 구글 캘린더 동기화(GCAL-01~05, 07, 08, 10)
-- - 토큰: refresh token은 Vault에 두고, service role만 부를 수 있는 함수로 읽고 쓴다.
-- - 내보내기: 사용자가 구글 일정(source='google')을 바꾸면 트리거가 google_dirty=true로 표시하고,
--   Edge Function gcal-sync(service role)가 구글에 반영한 뒤 false로 돌린다. (문서의 gcal_outbox 대기열 대신 표시 컬럼을 쓴다)
-- - 주기 실행: pg_cron이 15분마다 pg_net으로 gcal-sync를 부른다. 주소·비밀값은 Vault(gcal_sync_url, gcal_cron_secret)에 둔다.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ─────────────────────────────────────────────────────────────
-- 컬럼
-- ─────────────────────────────────────────────────────────────
alter table public.google_accounts
  add column last_synced_at timestamptz,
  add column last_error text,
  add column sync_started_at timestamptz; -- 동시 실행 방지용 잠금(2분 지나면 풀린 것으로 본다)

grant select (last_synced_at, last_error) on public.google_accounts to authenticated;

alter table public.google_calendars
  add column is_primary boolean not null default false,
  -- 구글 calendarList의 accessRole: owner | writer | reader | freeBusyReader. reader 이하는 내보낼 수 없다.
  add column access_role text not null default 'reader';

alter table public.events
  add column google_dirty boolean not null default false, -- 구글에 아직 반영하지 않은 변경이 있다
  add column google_updated_at timestamptz;               -- 구글 쪽 마지막 수정 시각(충돌 비교, GCAL-08)

create index events_google_dirty_idx on public.events (user_id) where google_dirty;

-- ─────────────────────────────────────────────────────────────
-- 내보낼 변경 표시: 사용자(authenticated)가 구글 일정을 만들거나 고치면 dirty.
-- 동기화(service role)가 쓴 변경은 표시하지 않는다.
-- ─────────────────────────────────────────────────────────────
create or replace function public.mark_google_dirty()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.source = 'google' and current_user not in ('service_role', 'postgres', 'supabase_admin') then
    new.google_dirty := true;
  end if;
  return new;
end;
$$;

create trigger mark_google_dirty before insert or update on public.events
  for each row execute function public.mark_google_dirty();

-- ─────────────────────────────────────────────────────────────
-- refresh token (Vault). service role 전용
-- ─────────────────────────────────────────────────────────────
create or replace function public.set_google_refresh_token(p_account_id uuid, p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret uuid;
begin
  select refresh_token_secret_id into v_secret from public.google_accounts where id = p_account_id;
  if not found then
    raise exception '구글 계정을 찾을 수 없습니다: %', p_account_id using errcode = 'P0002';
  end if;
  if v_secret is null then
    v_secret := vault.create_secret(p_token, 'google_refresh_' || p_account_id::text, '구글 캘린더 refresh token');
    update public.google_accounts set refresh_token_secret_id = v_secret where id = p_account_id;
  else
    perform vault.update_secret(v_secret, p_token);
  end if;
end;
$$;

create or replace function public.get_google_refresh_token(p_account_id uuid)
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select s.decrypted_secret
  from public.google_accounts a
  join vault.decrypted_secrets s on s.id = a.refresh_token_secret_id
  where a.id = p_account_id;
$$;

revoke execute on function public.set_google_refresh_token(uuid, text) from public, anon, authenticated;
revoke execute on function public.get_google_refresh_token(uuid) from public, anon, authenticated;
grant execute on function public.set_google_refresh_token(uuid, text) to service_role;
grant execute on function public.get_google_refresh_token(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────
-- 주기 동기화(GCAL-04): 15분마다 gcal-sync 호출
-- 주소·비밀값은 배포 후 set_gcal_cron_config()로 Vault에 넣는다. 없으면 아무것도 하지 않는다.
-- ─────────────────────────────────────────────────────────────
create or replace function public.set_gcal_cron_config(p_url text, p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'gcal_sync_url';
  if v_id is null then perform vault.create_secret(p_url, 'gcal_sync_url', 'gcal-sync Edge Function 주소');
  else perform vault.update_secret(v_id, p_url); end if;

  select id into v_id from vault.secrets where name = 'gcal_cron_secret';
  if v_id is null then perform vault.create_secret(p_secret, 'gcal_cron_secret', 'gcal-sync 주기 호출 비밀값');
  else perform vault.update_secret(v_id, p_secret); end if;
end;
$$;

revoke execute on function public.set_gcal_cron_config(text, text) from public, anon, authenticated;
grant execute on function public.set_gcal_cron_config(text, text) to service_role;

create or replace function public.invoke_gcal_sync()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'gcal_sync_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'gcal_cron_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{"mode":"cron"}'::jsonb,
    timeout_milliseconds := 120000
  );
end;
$$;

revoke execute on function public.invoke_gcal_sync() from public, anon, authenticated;

select cron.schedule('gcal-sync', '*/15 * * * *', 'select public.invoke_gcal_sync()');

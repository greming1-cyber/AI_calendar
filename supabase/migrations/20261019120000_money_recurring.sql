-- 03 가계부: 고정지출·고정수입 자동 생성(TX-07)
--
-- 방식(docs/sessions/03-money.md 5.1)
-- - 결제일(day_of_month, 말일을 넘으면 그 달 말일)이 되면 transactions에 recurring_id를 달아 한 번 넣는다.
-- - recurring_transactions.last_generated_on: 어디까지 만들었는지. 사용자가 생성된 내역을 지워도 다시 만들지 않는다.
--   null이면 등록일(사용자 타임존)부터 센다. 등록 전 날짜의 회차는 만들지 않는다.
-- - (recurring_id, occurred_on) 유니크: 화면 호출과 pg_cron이 겹쳐도 한 번만 생긴다.
-- - 호출 경로
--   1) 가계부 화면을 열 때 로그인 사용자가 rpc('generate_recurring_transactions') (security invoker, RLS 적용)
--   2) pg_cron이 매시 10분에 generate_recurring_transactions_all() (security definer, 클라이언트 실행 불가)
--      사용자마다 자기 타임존의 오늘까지 만들므로 매시 실행해도 멱등이다.

alter table public.recurring_transactions add column last_generated_on date;

-- seed_demo가 넣는 내역은 recurring_id가 null이라 기존 행과 겹치지 않는다.
create unique index transactions_recurring_occurrence_uidx
  on public.transactions (recurring_id, occurred_on)
  where recurring_id is not null;

-- 한 사용자의 p_today까지 미생성 회차를 만든다. 만든 건수를 돌려준다.
-- security invoker: 로그인 사용자가 부르면 RLS로 자기 행만 보인다. 남의 uid는 거부한다.
create or replace function public.generate_recurring_core(p_uid uuid, p_today date)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tz text;
  r record;
  v_start date;
  v_month date;
  v_occ date;
  v_rows int;
  v_count int := 0;
begin
  if auth.uid() is not null and auth.uid() <> p_uid then
    raise exception 'generate_recurring_core: 본인 계정만 처리할 수 있습니다.';
  end if;

  select timezone into v_tz from public.profiles where user_id = p_uid;
  v_tz := coalesce(v_tz, 'Asia/Seoul');
  -- 로그인 사용자는 미래 날짜까지 미리 만들 수 없다.
  if auth.uid() is not null then
    p_today := least(p_today, (now() at time zone v_tz)::date);
  end if;

  for r in
    select * from public.recurring_transactions
    where user_id = p_uid and active
    for update
  loop
    v_start := coalesce(r.last_generated_on + 1, (r.created_at at time zone v_tz)::date);
    continue when v_start > p_today;

    v_month := date_trunc('month', v_start)::date;
    while v_month <= p_today loop
      v_occ := v_month + (least(r.day_of_month, extract(day from (v_month + interval '1 month - 1 day'))::int) - 1);
      if v_occ between v_start and p_today then
        insert into public.transactions
          (user_id, type, amount, occurred_on, category_id, payment_method_id, memo, recurring_id)
        values
          (p_uid, r.type, r.amount, v_occ, r.category_id, r.payment_method_id, r.memo, r.id)
        on conflict (recurring_id, occurred_on) where recurring_id is not null do nothing;
        get diagnostics v_rows = row_count;
        v_count := v_count + v_rows;
      end if;
      v_month := (v_month + interval '1 month')::date;
    end loop;

    update public.recurring_transactions set last_generated_on = p_today where id = r.id;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.generate_recurring_core(uuid, date) from public, anon;
grant execute on function public.generate_recurring_core(uuid, date) to authenticated, service_role;

-- 로그인 사용자용: 자기 타임존의 오늘까지 만든다.
create or replace function public.generate_recurring_transactions()
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tz text;
begin
  if auth.uid() is null then
    raise exception 'generate_recurring_transactions: 로그인이 필요합니다.';
  end if;
  select timezone into v_tz from public.profiles where user_id = auth.uid();
  return public.generate_recurring_core(auth.uid(), (now() at time zone coalesce(v_tz, 'Asia/Seoul'))::date);
end;
$$;

revoke execute on function public.generate_recurring_transactions() from public, anon;
grant execute on function public.generate_recurring_transactions() to authenticated;

-- pg_cron용: 사용 중인 고정지출이 있는 모든 사용자
create or replace function public.generate_recurring_transactions_all()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  u record;
  v_count int := 0;
begin
  for u in
    select distinct r.user_id, coalesce(p.timezone, 'Asia/Seoul') as tz
    from public.recurring_transactions r
    left join public.profiles p on p.user_id = r.user_id
    where r.active
  loop
    v_count := v_count + public.generate_recurring_core(u.user_id, (now() at time zone u.tz)::date);
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.generate_recurring_transactions_all() from public, anon, authenticated;
grant execute on function public.generate_recurring_transactions_all() to service_role;

select cron.schedule('money-recurring', '10 * * * *', 'select public.generate_recurring_transactions_all()');

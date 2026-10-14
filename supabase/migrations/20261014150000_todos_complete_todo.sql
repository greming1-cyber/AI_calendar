-- 세션 02(할일): 할일 완료·완료 취소와 반복 할일 다음 회차 생성(TODO-03, TODO-07)
-- 웹(rpc('complete_todo'))과 MCP complete_todo(05)가 같은 함수를 쓴다.
--
-- 반복 규칙(rrule) 지원 범위
--   FREQ=DAILY|WEEKLY|MONTHLY|YEARLY, INTERVAL, BYDAY(WEEKLY, 예: MO,WE), BYMONTHDAY(MONTHLY, 양수 1개 또는 -1), UNTIL
--   COUNT는 남은 횟수를 저장할 곳이 없어 무시한다.
--   월·연 반복에서 그 달에 해당 날짜가 없으면 말일로 옮긴다(RFC 5545는 건너뛰지만 할일은 빠지면 안 되므로).
--   BYMONTHDAY가 없는 월 반복은 첫 회차의 날짜를 BYMONTHDAY로 적어 넘긴다. 31일 → 11/30 → 12/31처럼 기준일이 유지된다.

-- ─────────────────────────────────────────────────────────────
-- todo_next_due(rrule, after): after 다음의 회차 날짜. 끝났거나(UNTIL) 해석할 수 없으면 null
-- ─────────────────────────────────────────────────────────────
create or replace function public.todo_next_due(p_rrule text, p_after date)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_parts text[];
  v_part text;
  v_key text;
  v_val text;
  v_freq text;
  v_interval int := 1;
  v_byday int[];
  v_bymonthday int;
  v_until date;
  v_next date;
  v_month date;
  v_last int;
  v_day int;
  k int;
begin
  if p_rrule is null or p_after is null then
    return null;
  end if;

  v_parts := string_to_array(upper(regexp_replace(p_rrule, '^\s*RRULE:', '', 'i')), ';');
  foreach v_part in array v_parts loop
    v_key := split_part(v_part, '=', 1);
    v_val := split_part(v_part, '=', 2);
    case v_key
      when 'FREQ' then v_freq := v_val;
      when 'INTERVAL' then v_interval := greatest(v_val::int, 1);
      when 'BYDAY' then
        -- ISO 요일 번호(월=1 … 일=7). "1MO" 같은 서수 접두어는 떼고 요일만 본다.
        select array_agg(array_position(array['MO','TU','WE','TH','FR','SA','SU'], right(d, 2)))
          into v_byday
          from unnest(string_to_array(v_val, ',')) as d;
      when 'BYMONTHDAY' then v_bymonthday := split_part(v_val, ',', 1)::int;
      when 'UNTIL' then v_until := to_date(left(v_val, 8), 'YYYYMMDD');
      else null;
    end case;
  end loop;

  case v_freq
    when 'DAILY' then
      v_next := p_after + v_interval;

    when 'WEEKLY' then
      if v_byday is null or array_length(v_byday, 1) is null then
        v_next := p_after + 7 * v_interval;
      else
        -- after가 속한 주(월요일 시작)부터 INTERVAL 주마다 BYDAY 요일을 찾는다.
        for k in 1 .. 7 * v_interval + 7 loop
          v_next := p_after + k;
          if extract(isodow from v_next)::int = any(v_byday)
            and ((date_trunc('week', v_next)::date - date_trunc('week', p_after)::date) / 7) % v_interval = 0 then
            exit;
          end if;
          v_next := null;
        end loop;
      end if;

    when 'MONTHLY', 'YEARLY' then
      v_day := coalesce(v_bymonthday, extract(day from p_after)::int);
      for k in 0 .. 2 loop
        v_month := (date_trunc('month', p_after)
          + make_interval(months => k * v_interval * case when v_freq = 'YEARLY' then 12 else 1 end))::date;
        v_last := extract(day from (v_month + interval '1 month' - interval '1 day'))::int;
        v_next := v_month + (case when v_day < 0 or v_day > v_last then v_last else v_day end) - 1;
        exit when v_next > p_after;
        v_next := null;
      end loop;

    else
      return null;
  end case;

  if v_until is not null and v_next > v_until then
    return null;
  end if;
  return v_next;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- complete_todo(id, done): 완료(true)·완료 취소(false)
--   반환 { "todo": 바뀐 할일, "next": 새로 만든 다음 회차 또는 null }
--   security invoker라 RLS가 그대로 적용된다. 남의 할일이면 '할일을 찾을 수 없습니다' 오류.
--   반복 할일을 완료하면 같은 트랜잭션에서 다음 회차를 만들고 rrule을 새 회차로 옮긴다.
--   완료본은 rrule이 비므로 완료 취소 후 다시 완료해도 회차가 중복 생성되지 않는다.
--   완료 취소는 그 할일만 되살리고, 이미 만든 다음 회차는 지우지 않는다.
-- ─────────────────────────────────────────────────────────────
create or replace function public.complete_todo(p_id uuid, p_done boolean default true)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_todo public.todos;
  v_next public.todos;
  v_tz text;
  v_base date;
  v_due date;
  v_rrule text;
begin
  select * into v_todo from public.todos where id = p_id for update;
  if not found then
    raise exception '할일을 찾을 수 없습니다: %', p_id using errcode = 'P0002';
  end if;

  -- 이미 원하는 상태면 그대로 돌려준다.
  if (v_todo.completed_at is not null) = p_done then
    return jsonb_build_object('todo', to_jsonb(v_todo), 'next', null);
  end if;

  if not p_done then
    update public.todos set completed_at = null where id = p_id returning * into v_todo;
    return jsonb_build_object('todo', to_jsonb(v_todo), 'next', null);
  end if;

  update public.todos set completed_at = now() where id = p_id returning * into v_todo;

  -- 서브태스크는 반복하지 않는다.
  if v_todo.rrule is null or v_todo.parent_id is not null then
    return jsonb_build_object('todo', to_jsonb(v_todo), 'next', null);
  end if;

  select coalesce((select timezone from public.profiles where user_id = v_todo.user_id), 'Asia/Seoul') into v_tz;
  v_base := coalesce(v_todo.due_date, (now() at time zone v_tz)::date);
  v_due := public.todo_next_due(v_todo.rrule, v_base);
  if v_due is null then
    return jsonb_build_object('todo', to_jsonb(v_todo), 'next', null);
  end if;

  v_rrule := v_todo.rrule;
  if v_rrule ~* 'FREQ=MONTHLY' and v_rrule !~* 'BYMONTHDAY=' then
    v_rrule := v_rrule || ';BYMONTHDAY=' || extract(day from v_base)::int;
  end if;

  insert into public.todos (user_id, title, memo, due_date, due_at, priority, project_id, rrule)
  values (
    v_todo.user_id,
    v_todo.title,
    v_todo.memo,
    v_due,
    case when v_todo.due_at is not null
      then (v_due + (v_todo.due_at at time zone v_tz)::time) at time zone v_tz end,
    v_todo.priority,
    v_todo.project_id,
    v_rrule
  )
  returning * into v_next;

  -- 체크리스트는 모두 미완료로 새 회차에 복사한다.
  insert into public.todos (user_id, title, memo, priority, project_id, parent_id, created_at)
  select s.user_id, s.title, s.memo, s.priority, v_next.project_id, v_next.id, s.created_at
  from public.todos s
  where s.parent_id = v_todo.id
  order by s.created_at;

  update public.todos set rrule = null where id = p_id returning * into v_todo;

  return jsonb_build_object('todo', to_jsonb(v_todo), 'next', to_jsonb(v_next));
end;
$$;

revoke execute on function public.complete_todo(uuid, boolean) from public, anon;
grant execute on function public.complete_todo(uuid, boolean) to authenticated;
grant execute on function public.todo_next_due(text, date) to authenticated;

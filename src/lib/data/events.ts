// 일정 데이터 계층. DB 행 ↔ 화면 타입 변환과 Supabase 쿼리를 둔다.
// 조회 함수 시그니처는 공유 계약이므로 바꾸지 않는다(필요하면 선택 인자·새 함수를 추가).
import { DEFAULT_TZ, addDays, diffDays, zonedParts, zonedToUtc } from "@/lib/date";
import { RRuleError, expandRRule, splitRRule } from "@/lib/rrule";
import { createClient } from "@/lib/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/lib/supabase/database.types";
import type {
  CalendarEvent,
  EventCategory,
  EventInput,
  ISODate,
  RecurrenceScope,
  Reminder,
  Repeat,
} from "@/lib/types";

type EventRow = Tables<"events"> & { event_categories: { name: string } | null };
type EventValues = Omit<TablesInsert<"events">, "user_id">;

// ── 변환 ─────────────────────────────────────────────────

export const REPEAT_TO_RRULE: Record<Repeat, string | null> = {
  "안 함": null,
  매일: "FREQ=DAILY",
  매주: "FREQ=WEEKLY",
  매월: "FREQ=MONTHLY",
  매년: "FREQ=YEARLY",
};

/** RRULE의 FREQ만 보고 화면 반복 옵션으로 바꾼다. 세부 규칙은 rrule 필드와 `describeRRule`로 본다. */
export const repeatFromRrule = (rrule: string | null): Repeat => {
  const freq = rrule?.match(/FREQ=(\w+)/)?.[1];
  return freq === "DAILY" ? "매일" : freq === "WEEKLY" ? "매주" : freq === "MONTHLY" ? "매월" : freq === "YEARLY" ? "매년" : "안 함";
};

const REMINDER_MINUTES: Record<Reminder, number | null> = {
  없음: null,
  정시: 0,
  "10분 전": 10,
  "30분 전": 30,
  "1시간 전": 60,
  "하루 전": 1440,
};

export const reminderFromMinutes = (min: number | null): Reminder =>
  (Object.entries(REMINDER_MINUTES).find(([, v]) => v === min)?.[0] as Reminder | undefined) ?? "없음";

/** 회차 id `"<원본id>:<날짜>"`를 나눈다. 일반 일정 id면 date는 null */
export const parseEventId = (id: string): { rowId: string; date: ISODate | null } => {
  const [rowId, date] = id.split(":");
  return { rowId, date: date ?? null };
};

export function toEvent(row: EventRow, tz: string = DEFAULT_TZ): CalendarEvent {
  const start = zonedParts(row.start_at, tz);
  const end = row.end_at ? zonedParts(row.end_at, tz) : null;
  // 종일 일정의 end_at은 다음 날 0시(배타적)라 하루를 뺀다.
  const endDate = !end ? start.date : row.all_day ? addDays(end.date, -1) : end.date;
  return {
    id: row.id,
    date: start.date,
    endDate: endDate < start.date ? start.date : endDate,
    allDay: row.all_day,
    start: row.all_day ? "" : start.time,
    end: end && !row.all_day ? end.time : "",
    title: row.title,
    category: row.event_categories?.name ?? "",
    location: row.location,
    source: row.source === "google" ? "google" : "local",
    repeat: repeatFromRrule(row.rrule),
    rrule: row.rrule,
    reminder: reminderFromMinutes(row.reminder_minutes),
    memo: row.memo,
    seriesId: row.recurrence_parent_id,
    occurrenceDate: row.original_date,
  };
}

/** 반복 원본을 [from, to] 범위의 회차로 펼친다. 규칙을 해석하지 못하면 원본 하루만 보여 준다. */
function expandRow(row: EventRow, from: ISODate, to: ISODate, tz: string): CalendarEvent[] {
  const base = toEvent(row, tz);
  const span = diffDays(base.date, base.endDate);
  let dates: ISODate[];
  try {
    dates = expandRRule(row.rrule!, base.date, row.exdates, from, to, {
      tz,
      time: base.allDay ? undefined : base.start,
      spanDays: span,
    });
  } catch (e) {
    if (!(e instanceof RRuleError)) throw e;
    dates = base.date <= to && base.endDate >= from ? [base.date] : [];
  }
  return dates.map((d) => ({ ...base, id: `${row.id}:${d}`, date: d, endDate: addDays(d, span), seriesId: row.id, occurrenceDate: d }));
}

/** 화면 입력 → events insert/update 값. 카테고리는 이름으로 받아 id로 바꾼다. */
export function fromEventInput(input: EventInput, categories: EventCategory[], tz: string = DEFAULT_TZ): EventValues {
  const endDate = input.endDate && input.endDate > input.date ? input.endDate : input.date;
  const timed = !input.allDay && input.start;
  let endAt: string | null;
  if (!timed) endAt = zonedToUtc(addDays(endDate, 1), "00:00", tz);
  else if (endDate > input.date) endAt = zonedToUtc(endDate, input.end || input.start, tz);
  else endAt = input.end && input.end > input.start ? zonedToUtc(input.date, input.end, tz) : null;
  return {
    title: input.title,
    all_day: !timed,
    start_at: zonedToUtc(input.date, timed ? input.start : "00:00", tz),
    end_at: endAt,
    location: input.location,
    memo: input.memo,
    category_id: categories.find((c) => c.name === input.category)?.id ?? null,
    rrule: input.rrule !== undefined ? input.rrule : REPEAT_TO_RRULE[input.repeat],
    reminder_minutes: REMINDER_MINUTES[input.reminder],
    // 구글 캘린더 반영(GCAL-05·06)은 04 세션이 source='google'이고 google_event_id가 없는 일정을 내보낸다.
    source: input.source,
  };
}

const EVENT_SELECT = "*, event_categories(name)";

const sortEvents = (list: CalendarEvent[]) =>
  list.sort((a, b) => a.date.localeCompare(b.date) || Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));

// ── 조회 ─────────────────────────────────────────────────

/**
 * from~to(포함) 범위의 일정.
 * - expand(기본 true): 반복 일정을 회차로 펼치고, 여러 날 일정은 범위에 걸치기만 해도 포함한다.
 * - expand=false: from~to 사이에 시작하는 행 그대로(반복 원본 1건).
 */
export async function listEvents(
  from: ISODate,
  to: ISODate,
  tz: string = DEFAULT_TZ,
  { expand = true }: { expand?: boolean } = {},
): Promise<CalendarEvent[]> {
  const lo = zonedToUtc(from, "00:00", tz);
  const hi = zonedToUtc(addDays(to, 1), "00:00", tz);
  let q = createClient().from("events").select(EVENT_SELECT).is("deleted_at", null).lt("start_at", hi);
  q = expand
    ? q.or(`rrule.not.is.null,end_at.gt."${lo}",and(end_at.is.null,start_at.gte."${lo}")`)
    : q.gte("start_at", lo);
  const { data, error } = await q.order("start_at");
  if (error) throw error;
  const rows = data as EventRow[];
  if (!expand) return sortEvents(rows.map((r) => toEvent(r, tz)));
  return sortEvents(
    rows.flatMap((r) => {
      if (r.rrule && !r.recurrence_parent_id) return expandRow(r, from, to, tz);
      const e = toEvent(r, tz);
      return e.date <= to && e.endDate >= from ? [e] : [];
    }),
  );
}

export async function listEventCategories(): Promise<EventCategory[]> {
  const { data, error } = await createClient().from("event_categories").select("id, name, color").order("sort_order").order("name");
  if (error) throw error;
  return data;
}

async function getRow(id: string): Promise<EventRow> {
  const { data, error } = await createClient().from("events").select(EVENT_SELECT).eq("id", id).single();
  if (error) throw error;
  return data as EventRow;
}

/** 이 일정에 연결된 할일·내역(EVT-07). 반복 회차는 원본 id로 찾는다 */
export async function listLinkedItems(eventId: string) {
  const { rowId } = parseEventId(eventId);
  const supabase = createClient();
  const [todos, txs] = await Promise.all([
    supabase.from("todos").select("id, title, completed_at, due_date").eq("event_id", rowId).order("due_date"),
    supabase.from("transactions").select("id, type, amount, memo, occurred_on").eq("event_id", rowId).order("occurred_on"),
  ]);
  if (todos.error) throw todos.error;
  if (txs.error) throw txs.error;
  return {
    todos: todos.data.map((t) => ({ id: t.id, title: t.title, done: t.completed_at != null, dueDate: t.due_date })),
    transactions: txs.data.map((t) => ({ id: t.id, type: t.type, amount: t.amount, memo: t.memo, date: t.occurred_on })),
  };
}

/** 고정지출 결제 예정일(EVT-09). 그 달에 없는 날(31일 등)은 말일로 옮긴다 */
export async function listRecurringPayments(from: ISODate, to: ISODate) {
  const { data, error } = await createClient()
    .from("recurring_transactions")
    .select("id, amount, day_of_month, memo, tx_categories(name)")
    .eq("active", true)
    .eq("type", "expense");
  if (error) throw error;
  const out: { id: string; date: ISODate; title: string; amount: number }[] = [];
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  for (let y = fy, m = fm; y < ty || (y === ty && m <= tm); m === 12 ? (y++, (m = 1)) : m++) {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (const r of data) {
      const date = `${y}-${String(m).padStart(2, "0")}-${String(Math.min(r.day_of_month, last)).padStart(2, "0")}`;
      if (date < from || date > to) continue;
      const category = (r.tx_categories as { name: string } | null)?.name ?? "";
      out.push({ id: `${r.id}:${date}`, date, title: r.memo || category || "고정지출", amount: r.amount });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// ── 쓰기 ─────────────────────────────────────────────────
// 구글 출처 일정의 google_event_id·google_etag는 04가 관리하므로 여기서 쓰지 않는다.

export async function createEvent(input: EventInput, categories: EventCategory[], tz: string = DEFAULT_TZ): Promise<string> {
  const { data, error } = await createClient().from("events").insert(fromEventInput(input, categories, tz)).select("id").single();
  if (error) throw error;
  return data.id;
}

const update = async (id: string, values: TablesUpdate<"events">) => {
  const { error } = await createClient().from("events").update(values).eq("id", id);
  if (error) throw error;
};

/** 반복 원본의 예외 일정을 옮기거나 지운다. original_date가 since 이상인 것만 */
async function children(parentId: string, since?: ISODate) {
  let q = createClient().from("events").select("id, original_date").eq("recurrence_parent_id", parentId).is("deleted_at", null);
  if (since) q = q.gte("original_date", since);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

/** 내 일정은 바로 지우고(예외 일정은 cascade), 구글 일정은 내보내기 반영을 위해 예외 일정까지 소프트 삭제한다 */
async function removeRows(row: Pick<EventRow, "source">, ids: string[]) {
  if (!ids.length) return;
  const supabase = createClient();
  const { error } =
    row.source === "google"
      ? await supabase.from("events").update({ deleted_at: new Date().toISOString() }).in("id", ids)
      : await supabase.from("events").delete().in("id", ids);
  if (error) throw error;
}

const removeSeries = async (row: EventRow) => removeRows(row, [row.id, ...(await children(row.id)).map((c) => c.id)]);

/**
 * 일정 수정(EVT-03). id는 행 id 또는 회차 id. 반복 회차는 scope로 범위를 정한다.
 * - this: 원본 exdates에 회차를 넣고 예외 일정(recurrence_parent_id, original_date)을 만든다.
 * - following: 원본을 회차 전날까지로 줄이고(splitRRule) 회차부터 새 시리즈를 만든다. 이후 예외 일정은 새 시리즈로 옮긴다.
 * - all: 원본을 고친다. 회차 날짜를 옮겼으면 시리즈 시작일·exdates·예외 일정도 같은 만큼 옮긴다.
 * 예외 일정은 그 일정만 고친다. 출처(source)는 바꾸지 않는다.
 */
export async function updateEvent(
  id: string,
  input: EventInput,
  categories: EventCategory[],
  scope: RecurrenceScope = "all",
  tz: string = DEFAULT_TZ,
) {
  const { rowId, date } = parseEventId(id);
  const row = await getRow(rowId);
  const { source, ...values } = fromEventInput(input, categories, tz);
  void source;

  if (!row.rrule || row.recurrence_parent_id) {
    // 예외 일정은 반복 규칙을 갖지 않는다.
    await update(row.id, row.recurrence_parent_id ? { ...values, rrule: null } : values);
    return;
  }

  const seriesStart = zonedParts(row.start_at, tz).date;
  const occ = date ?? seriesStart;
  const delta = diffDays(occ, input.date);
  const supabase = createClient();

  if (scope === "this") {
    const { error } = await supabase
      .from("events")
      .insert({ ...values, rrule: null, source: row.source, recurrence_parent_id: row.id, original_date: occ });
    if (error) throw error;
    await update(row.id, { exdates: [...new Set([...row.exdates, occ])] });
    return;
  }

  const split = scope === "following" && occ > seriesStart ? splitRRule(row.rrule, seriesStart, occ, { tz, allDay: row.all_day }) : null;

  if (!split?.before) {
    // 전체 수정: 시리즈 시작일을 회차를 옮긴 만큼 옮긴다.
    const start = addDays(seriesStart, delta);
    const shifted = fromEventInput({ ...input, date: start, endDate: addDays(input.endDate ?? input.date, diffDays(input.date, start)) }, categories, tz);
    if (!shifted.rrule) {
      await removeRows(row, (await children(row.id)).map((c) => c.id));
      await update(row.id, { ...shifted, source: row.source, exdates: [] });
      return;
    }
    await update(row.id, { ...shifted, source: row.source, exdates: row.exdates.map((d) => addDays(d, delta)) });
    if (delta) for (const c of await children(row.id)) await update(c.id, { original_date: addDays(c.original_date!, delta) });
    return;
  }

  // 이후 모두: 규칙을 바꾸지 않았으면 남은 회차(COUNT 포함)를 이어받는다.
  const rrule = values.rrule === row.rrule ? split.after : values.rrule;
  const { data: created, error } = await supabase
    .from("events")
    .insert({
      ...values,
      rrule,
      source: row.source,
      exdates: rrule ? row.exdates.filter((d) => d >= occ).map((d) => addDays(d, delta)) : [],
    })
    .select("id")
    .single();
  if (error) throw error;
  await update(row.id, { rrule: split.before, exdates: row.exdates.filter((d) => d < occ) });
  const later = await children(row.id, occ);
  if (!rrule) await removeRows(row, later.map((c) => c.id));
  else for (const c of later) await update(c.id, { recurrence_parent_id: created.id, original_date: addDays(c.original_date!, delta) });
}

/** 등록(id=null) 또는 수정. 00의 기존 시그니처에 범위(scope)를 선택 인자로 더했다. */
export async function saveEvent(
  id: string | null,
  input: EventInput,
  categories: EventCategory[],
  tz: string = DEFAULT_TZ,
  scope: RecurrenceScope = "all",
) {
  if (id) await updateEvent(id, input, categories, scope, tz);
  else await createEvent(input, categories, tz);
}

/**
 * 일정 삭제(EVT-03). 반복 회차는 scope로 범위를 정한다.
 * - this: 원본 exdates에 회차를 넣는다. 예외 일정이면 그 행만 지운다(원본 exdates에 이미 있다).
 * - following: 원본을 회차 전날까지로 줄이고 이후 예외 일정을 지운다. 첫 회차면 전체 삭제.
 * - all: 시리즈 전체(원본과 예외 일정)를 지운다.
 */
export async function deleteEvent(id: string, scope: RecurrenceScope = "all", tz: string = DEFAULT_TZ): Promise<void> {
  const { rowId, date } = parseEventId(id);
  const row = await getRow(rowId);

  if (row.recurrence_parent_id) {
    if (scope === "this") return removeRows(row, [row.id]);
    return deleteEvent(`${row.recurrence_parent_id}:${row.original_date}`, scope, tz);
  }
  if (!row.rrule || scope === "all") return removeSeries(row);

  const seriesStart = zonedParts(row.start_at, tz).date;
  const occ = date ?? seriesStart;
  if (scope === "this") return update(row.id, { exdates: [...new Set([...row.exdates, occ])] });

  const { before } = splitRRule(row.rrule, seriesStart, occ, { tz, allDay: row.all_day });
  if (!before) return removeSeries(row);
  await update(row.id, { rrule: before, exdates: row.exdates.filter((d) => d < occ) });
  await removeRows(row, (await children(row.id, occ)).map((c) => c.id));
}

// ── 카테고리 (EVT-06) ───────────────────────────────────

export async function createCategory(input: { name: string; color: string }): Promise<EventCategory> {
  const supabase = createClient();
  const { data: last } = await supabase.from("event_categories").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  const { data, error } = await supabase
    .from("event_categories")
    .insert({ ...input, sort_order: (last?.[0]?.sort_order ?? -1) + 1 })
    .select("id, name, color")
    .single();
  if (error) throw error;
  return data;
}

export async function updateCategory(id: string, patch: { name?: string; color?: string }) {
  const { error } = await createClient().from("event_categories").update(patch).eq("id", id);
  if (error) throw error;
}

/** 이 카테고리를 쓰는 일정 수(삭제 확인용) */
export async function countCategoryEvents(id: string): Promise<number> {
  const { count, error } = await createClient()
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id)
    .is("deleted_at", null);
  if (error) throw error;
  return count ?? 0;
}

/** 카테고리 삭제. moveTo를 주면 그 카테고리로 일정을 옮긴 뒤 지운다(없으면 일정은 "분류 없음") */
export async function deleteCategory(id: string, moveTo?: string | null) {
  const supabase = createClient();
  if (moveTo) {
    const { error } = await supabase.from("events").update({ category_id: moveTo }).eq("category_id", id);
    if (error) throw error;
  }
  const { error } = await supabase.from("event_categories").delete().eq("id", id);
  if (error) throw error;
}

// 일정 데이터 계층. DB 행 ↔ 화면 타입 변환과 Supabase 쿼리를 둔다.
// 조회 함수 시그니처는 공유 계약이므로 바꾸지 않는다(필요하면 선택 인자·새 함수를 추가).
import { DEFAULT_TZ, addDays, zonedParts, zonedToUtc } from "@/lib/date";
import { createClient } from "@/lib/supabase/client";
import type { Tables, TablesInsert } from "@/lib/supabase/database.types";
import type { CalendarEvent, EventCategory, EventInput, ISODate, Reminder, Repeat } from "@/lib/types";

type EventRow = Tables<"events"> & { event_categories: { name: string } | null };

// ── 변환 ─────────────────────────────────────────────────

const REPEAT_TO_RRULE: Record<Repeat, string | null> = {
  "안 함": null,
  매일: "FREQ=DAILY",
  매주: "FREQ=WEEKLY",
  매월: "FREQ=MONTHLY",
  매년: "FREQ=YEARLY",
};

/** RRULE의 FREQ만 보고 화면 반복 옵션으로 바꾼다. 세부 규칙(EVT-04)은 01 세션이 확장한다. */
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

export function toEvent(row: EventRow, tz: string = DEFAULT_TZ): CalendarEvent {
  const start = zonedParts(row.start_at, tz);
  const end = row.end_at && !row.all_day ? zonedParts(row.end_at, tz) : null;
  return {
    id: row.id,
    date: start.date,
    allDay: row.all_day,
    start: row.all_day ? "" : start.time,
    end: end ? end.time : "",
    title: row.title,
    category: row.event_categories?.name ?? "",
    location: row.location,
    source: row.source === "google" ? "google" : "local",
    repeat: repeatFromRrule(row.rrule),
    reminder: reminderFromMinutes(row.reminder_minutes),
    memo: row.memo,
  };
}

/** 화면 입력 → events insert/update 값. 카테고리는 이름으로 받아 id로 바꾼다. */
export function fromEventInput(
  input: EventInput,
  categories: EventCategory[],
  tz: string = DEFAULT_TZ,
): Omit<TablesInsert<"events">, "user_id"> {
  const timed = !input.allDay && input.start;
  return {
    title: input.title,
    all_day: input.allDay || !input.start,
    start_at: timed ? zonedToUtc(input.date, input.start, tz) : zonedToUtc(input.date, "00:00", tz),
    end_at: timed
      ? input.end && input.end > input.start
        ? zonedToUtc(input.date, input.end, tz)
        : null
      : zonedToUtc(addDays(input.date, 1), "00:00", tz),
    location: input.location,
    memo: input.memo,
    category_id: categories.find((c) => c.name === input.category)?.id ?? null,
    rrule: REPEAT_TO_RRULE[input.repeat],
    reminder_minutes: REMINDER_MINUTES[input.reminder],
    // 구글 내보내기(GCAL-05)는 04 세션이 연결한다. 그 전까지 새 일정은 내 서비스에만 저장한다.
    source: "local",
  };
}

const EVENT_SELECT = "*, event_categories(name)";

// ── 조회 ─────────────────────────────────────────────────

/** from~to(포함) 사이에 시작하는 일정. 반복 일정 펼치기(EVT-04)는 01 세션 담당. */
export async function listEvents(from: ISODate, to: ISODate, tz: string = DEFAULT_TZ): Promise<CalendarEvent[]> {
  const { data, error } = await createClient()
    .from("events")
    .select(EVENT_SELECT)
    .is("deleted_at", null)
    .gte("start_at", zonedToUtc(from, "00:00", tz))
    .lt("start_at", zonedToUtc(addDays(to, 1), "00:00", tz))
    .order("start_at");
  if (error) throw error;
  // 종일 일정을 같은 날의 시간 일정보다 앞에 둔다.
  return (data as EventRow[])
    .map((r) => toEvent(r, tz))
    .sort((a, b) => a.date.localeCompare(b.date) || Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
}

export async function listEventCategories(): Promise<EventCategory[]> {
  const { data, error } = await createClient().from("event_categories").select("id, name, color").order("sort_order").order("name");
  if (error) throw error;
  return data;
}

// ── 쓰기 (최소 구현) ─────────────────────────────────────
// TODO(01): 반복 범위(이 일정만/이후 모두/전체), 구글 내보내기 연동, 낙관적 업데이트

export async function saveEvent(id: string | null, input: EventInput, categories: EventCategory[], tz: string = DEFAULT_TZ) {
  const { source, ...values } = fromEventInput(input, categories, tz);
  const supabase = createClient();
  // 수정할 때는 출처(source)를 바꾸지 않는다. 구글 일정은 구글 일정으로 남는다.
  const { error } = id
    ? await supabase.from("events").update(values).eq("id", id)
    : await supabase.from("events").insert({ ...values, source });
  if (error) throw error;
}

/** 구글 출처 일정은 내보내기 반영을 위해 소프트 삭제(deleted_at), 내 일정은 바로 삭제한다. */
export async function deleteEvent(id: string) {
  const supabase = createClient();
  const { data, error } = await supabase.from("events").select("source").eq("id", id).single();
  if (error) throw error;
  const { error: delError } =
    data.source === "google"
      ? await supabase.from("events").update({ deleted_at: new Date().toISOString() }).eq("id", id)
      : await supabase.from("events").delete().eq("id", id);
  if (delError) throw delError;
}

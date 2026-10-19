// 일정 도구: list_events, create_event, update_event, delete_event, find_free_time
// 변환·수정 규칙은 웹 앱 src/lib/data/events.ts(세션 01)와 같다. 그쪽이 바뀌면 여기도 맞춘다.
// 구글 일정(source='google')을 쓰면 google_dirty=true로 표시한다. service role 쓰기에는 DB 트리거가 표시하지 않기 때문이다.
// 내보내기는 gcal-sync 15분 주기 실행이 처리한다(즉시 반영 안 됨).
import { RRuleError, describeRRule, expandRRule, parseRRule, splitRRule } from "../../../src/lib/rrule.ts";
import {
  ApiError,
  type Args,
  type Ctx,
  type Row,
  type ToolResult,
  addDays,
  bool,
  dateTime,
  dbError,
  diffDays,
  eventId,
  findByName,
  includesText,
  int,
  likePattern,
  oneOf,
  range,
  str,
  weekday,
  zonedParts,
  zonedToUtc,
} from "./util.ts";

type Scope = "this" | "following" | "all";
const SCOPES = ["this", "following", "all"] as const;
const SELECT = "*, event_categories(name), google_calendars(name)";

/** 화면 EventInput에 해당하는 중간 형태 */
interface Input {
  title: string;
  date: string;
  endDate: string;
  allDay: boolean;
  start: string; // HH:mm, 종일이면 ""
  end: string;
  location: string;
  memo: string;
  categoryId: string | null;
  rrule: string | null;
}

// ── 변환 ─────────────────────────────────────────────────

function toInput(row: Row, tz: string): Input {
  const s = zonedParts(row.start_at, tz);
  const e = row.end_at ? zonedParts(row.end_at, tz) : null;
  const endDate = !e ? s.date : row.all_day ? addDays(e.date, -1) : e.date;
  return {
    title: row.title,
    date: s.date,
    endDate: endDate < s.date ? s.date : endDate,
    allDay: row.all_day,
    start: row.all_day ? "" : s.time,
    end: e && !row.all_day ? e.time : "",
    location: row.location,
    memo: row.memo,
    categoryId: row.category_id,
    rrule: row.rrule,
  };
}

function toValues(input: Input, tz: string): Row {
  const endDate = input.endDate > input.date ? input.endDate : input.date;
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
    category_id: input.categoryId,
    rrule: input.rrule,
  };
}

const describe = (rrule: string | null, date: string, tz: string) => {
  if (!rrule) return null;
  try {
    return describeRRule(rrule, date, { tz });
  } catch {
    return rrule;
  }
};

/** 도구 응답용 일정 */
function view(row: Row, tz: string, occurrence?: string) {
  const i = toInput(row, tz);
  const span = diffDays(i.date, i.endDate);
  const date = occurrence ?? i.date;
  const endDate = addDays(date, span);
  return {
    id: occurrence ? `${row.id}:${occurrence}` : row.id,
    title: row.title,
    date,
    weekday: weekday(date),
    end_date: endDate !== date ? endDate : undefined,
    all_day: row.all_day,
    start: i.start || undefined,
    end: i.end || undefined,
    category: row.event_categories?.name ?? null,
    location: row.location || undefined,
    memo: row.memo || undefined,
    repeat: row.recurrence_parent_id ? "반복 일정의 수정된 회차" : describe(row.rrule, i.date, tz) ?? undefined,
    series_id: occurrence ? row.id : row.recurrence_parent_id ?? undefined,
    calendar: row.source === "google" ? `구글: ${row.google_calendars?.name ?? "기본 캘린더"}` : "내 캘린더",
  };
}
type EventView = ReturnType<typeof view>;

const compareViews = (a: EventView, b: EventView) =>
  a.date.localeCompare(b.date) || Number(b.all_day) - Number(a.all_day) || (a.start ?? "").localeCompare(b.start ?? "");

/** [from, to] 범위의 일정. 반복 일정은 회차로 펼치고, 여러 날 일정은 범위에 걸치기만 해도 넣는다 */
export async function eventsInRange(ctx: Ctx, from: string, to: string): Promise<{ row: Row; ev: EventView }[]> {
  const lo = zonedToUtc(from, "00:00", ctx.tz);
  const hi = zonedToUtc(addDays(to, 1), "00:00", ctx.tz);
  const { data, error } = await ctx.db
    .from("events")
    .select(SELECT)
    .eq("user_id", ctx.userId)
    .is("deleted_at", null)
    .lt("start_at", hi)
    .or(`rrule.not.is.null,end_at.gt."${lo}",and(end_at.is.null,start_at.gte."${lo}")`)
    .order("start_at");
  dbError(error);
  const out: { row: Row; ev: EventView }[] = [];
  for (const row of data ?? []) {
    if (row.rrule && !row.recurrence_parent_id) {
      const base = toInput(row, ctx.tz);
      let dates: string[];
      try {
        dates = expandRRule(row.rrule, base.date, row.exdates ?? [], from, to, {
          tz: ctx.tz,
          time: base.allDay ? undefined : base.start,
          spanDays: diffDays(base.date, base.endDate),
        });
      } catch (e) {
        if (!(e instanceof RRuleError)) throw e;
        dates = base.date <= to && base.endDate >= from ? [base.date] : [];
      }
      for (const d of dates) out.push({ row, ev: view(row, ctx.tz, d) });
    } else {
      const ev = view(row, ctx.tz);
      if (ev.date <= to && (ev.end_date ?? ev.date) >= from) out.push({ row, ev });
    }
  }
  return out.sort((a, b) => compareViews(a.ev, b.ev));
}

async function categories(ctx: Ctx) {
  const { data, error } = await ctx.db.from("event_categories").select("id, name").eq("user_id", ctx.userId).order("sort_order");
  dbError(error);
  return data ?? [];
}

async function getRow(ctx: Ctx, id: string): Promise<Row> {
  const { data, error } = await ctx.db
    .from("events")
    .select(SELECT)
    .eq("user_id", ctx.userId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  dbError(error);
  if (!data) throw new ApiError("NOT_FOUND", "일정을 찾을 수 없습니다. list_events로 id를 다시 확인하세요.");
  return data;
}

const checkRRule = (rrule: string | undefined) => {
  if (!rrule) return rrule;
  try {
    parseRRule(rrule);
  } catch (e) {
    throw new ApiError("VALIDATION", `rrule: ${(e as Error).message}`);
  }
  return rrule.replace(/^RRULE:/i, "");
};

// ── 쓰기 공통 ────────────────────────────────────────────

/** 구글 일정이면 내보내기 대기로 표시 */
const dirty = (row: Row, values: Row) => (row.source === "google" ? { ...values, google_dirty: true } : values);

async function update(ctx: Ctx, row: Row, id: string, values: Row) {
  const { error } = await ctx.db.from("events").update(dirty(row, values)).eq("user_id", ctx.userId).eq("id", id);
  dbError(error);
}

async function children(ctx: Ctx, parentId: string, since?: string): Promise<Row[]> {
  let q = ctx.db
    .from("events")
    .select("id, original_date")
    .eq("user_id", ctx.userId)
    .eq("recurrence_parent_id", parentId)
    .is("deleted_at", null);
  if (since) q = q.gte("original_date", since);
  const { data, error } = await q;
  dbError(error);
  return data ?? [];
}

/** 내 일정은 지우고, 구글 일정은 내보내기 반영을 위해 소프트 삭제한다 */
async function removeRows(ctx: Ctx, row: Row, ids: string[]) {
  if (!ids.length) return;
  const q = ctx.db.from("events");
  const { error } =
    row.source === "google"
      ? await q.update({ deleted_at: new Date().toISOString(), google_dirty: true }).eq("user_id", ctx.userId).in("id", ids)
      : await q.delete().eq("user_id", ctx.userId).in("id", ids);
  dbError(error);
}

const removeSeries = async (ctx: Ctx, row: Row) => removeRows(ctx, row, [row.id, ...(await children(ctx, row.id)).map((c) => c.id)]);

// ── 도구 ─────────────────────────────────────────────────

export async function listEvents(ctx: Ctx, args: Args): Promise<ToolResult> {
  const { from, to } = range(ctx, args);
  const category = str(args, "category", { max: 50 });
  const query = str(args, "query", { max: 100 });
  const limit = int(args, "limit", { min: 1, max: 500 }) ?? 200;
  let list = (await eventsInRange(ctx, from, to)).map((x) => x.ev);
  if (category) {
    const cat = findByName(await categories(ctx), category, "일정 카테고리");
    list = list.filter((e) => e.category === cat.name);
  }
  if (query) list = list.filter((e) => includesText(query, e.title, e.location, e.memo));
  return { data: { from, to, count: list.length, truncated: list.length > limit || undefined, events: list.slice(0, limit) } };
}

/** start/end/all_day 인자를 Input에 반영 */
function applyTimes(ctx: Ctx, args: Args, base: Input, creating: boolean): Input {
  const out = { ...base };
  const span = diffDays(base.date, base.endDate);
  const startRaw = str(args, "start", { required: creating, max: 40 });
  const endRaw = str(args, "end", { max: 40 });
  const allDay = bool(args, "all_day");

  if (startRaw) {
    const s = dateTime(ctx, startRaw, "start");
    out.date = s.date;
    out.endDate = addDays(s.date, span);
    if (s.time) {
      out.allDay = false;
      out.start = s.time;
    } else {
      out.allDay = true;
      out.start = "";
    }
  }
  if (endRaw) {
    const e = dateTime(ctx, endRaw, "end");
    // 종일 일정의 end가 날짜면 그날까지 포함한다(마지막 날).
    out.endDate = e.date;
    out.end = e.time ?? "";
  } else if (startRaw && !out.allDay && out.end && out.end <= out.start && out.endDate === out.date) {
    out.end = "";
  }
  if (allDay === true) {
    out.allDay = true;
    out.start = "";
    out.end = "";
  } else if (allDay === false && !out.start) {
    throw new ApiError("VALIDATION", "all_day=false이면 start에 시각(YYYY-MM-DDTHH:mm)을 함께 보내야 합니다.");
  }
  if (out.allDay) out.end = "";
  if (out.endDate < out.date) throw new ApiError("VALIDATION", "end가 start보다 앞섭니다.");
  if (!out.allDay && out.endDate === out.date && out.end && out.end <= out.start) {
    throw new ApiError("VALIDATION", "end 시각이 start 시각보다 뒤여야 합니다.");
  }
  return out;
}

/** 텍스트 필드(제목·장소·메모·카테고리·반복) 반영 */
async function applyFields(ctx: Ctx, args: Args, base: Input, creating: boolean): Promise<Input> {
  const out = { ...base };
  const title = str(args, "title", { required: creating, max: 200 });
  if (title !== undefined) {
    if (!title) throw new ApiError("VALIDATION", "title: 비어 있을 수 없습니다.");
    out.title = title;
  }
  const location = str(args, "location", { max: 200 });
  if (location !== undefined) out.location = location;
  const memo = str(args, "memo", { max: 2000 });
  if (memo !== undefined) out.memo = memo;
  if (args.category === null || args.category === "") out.categoryId = null;
  else {
    const category = str(args, "category", { max: 50 });
    if (category) out.categoryId = findByName(await categories(ctx), category, "일정 카테고리").id;
  }
  if (args.rrule === null || args.rrule === "") out.rrule = null;
  else {
    const rrule = checkRRule(str(args, "rrule", { max: 300 }));
    if (rrule) out.rrule = rrule;
  }
  return out;
}

export async function createEvent(ctx: Ctx, args: Args): Promise<ToolResult> {
  const empty: Input = {
    title: "",
    date: ctx.today,
    endDate: ctx.today,
    allDay: true,
    start: "",
    end: "",
    location: "",
    memo: "",
    categoryId: null,
    rrule: null,
  };
  const input = await applyFields(ctx, args, applyTimes(ctx, args, empty, true), true);
  const reminder = int(args, "reminder_minutes", { min: 0, max: 40320 });

  // calendar: 생략·"local"·"내 캘린더"면 내 일정, 아니면 구글 캘린더 이름
  const calendar = str(args, "calendar", { max: 100 });
  let google: Row | null = null;
  if (calendar && !["local", "내 캘린더", "내캘린더"].includes(calendar.toLowerCase())) {
    const { data, error } = await ctx.db
      .from("google_calendars")
      .select("id, name, access_role, sync_direction")
      .eq("user_id", ctx.userId)
      .eq("enabled", true);
    dbError(error);
    const writable = (data ?? []).filter((c) => ["owner", "writer"].includes(c.access_role) && c.sync_direction !== "import");
    try {
      google = findByName(writable, calendar, "쓰기 가능한 구글 캘린더");
    } catch (e) {
      if (e instanceof ApiError) e.candidates = ["local", ...(e.candidates ?? [])];
      throw e;
    }
  }

  const values = {
    ...toValues(input, ctx.tz),
    user_id: ctx.userId,
    reminder_minutes: reminder ?? null,
    source: google ? "google" : "local",
    // 웹 앱 일정 등록과 같이 대상 캘린더를 저장한다(gcal-sync가 그 캘린더로 내보낸다).
    google_calendar_id: google?.id ?? null,
    google_dirty: Boolean(google),
  };
  const { data, error } = await ctx.db.from("events").insert(values).select(SELECT).single();
  dbError(error);
  const ev = view(data, ctx.tz);
  return {
    data: { event: ev, note: google ? "구글 캘린더에는 다음 동기화(최대 15분) 때 반영됩니다." : undefined },
    summary: `일정 등록: ${ev.title} (${ev.date}${ev.start ? ` ${ev.start}` : ""})`,
  };
}

export async function updateEvent(ctx: Ctx, args: Args): Promise<ToolResult> {
  const { rowId, date } = eventId(args);
  const row = await getRow(ctx, rowId);
  const recurring = Boolean(row.rrule && !row.recurrence_parent_id);
  const scope: Scope = oneOf(args, "scope", SCOPES) ?? (recurring && date ? "this" : "all");

  const current = toInput(row, ctx.tz);
  const seriesStart = current.date;
  const occ = recurring ? date ?? seriesStart : current.date;
  const span = diffDays(current.date, current.endDate);
  const base: Input = { ...current, date: occ, endDate: addDays(occ, span) };
  const input = await applyFields(ctx, args, applyTimes(ctx, args, base, false), false);
  const values = toValues(input, ctx.tz);
  if (args.reminder_minutes !== undefined) values.reminder_minutes = int(args, "reminder_minutes", { min: 0, max: 40320 }) ?? null;

  const done = async (id: string, occurrence?: string) => {
    const fresh = await getRow(ctx, id);
    const ev = view(fresh, ctx.tz, fresh.rrule && !fresh.recurrence_parent_id ? occurrence : undefined);
    return { data: { event: ev, scope: recurring ? scope : undefined }, summary: `일정 수정: ${ev.title} (${ev.date}${recurring ? `, ${scope}` : ""})` };
  };

  if (!recurring) {
    // 예외 일정은 반복 규칙을 갖지 않는다.
    await update(ctx, row, row.id, row.recurrence_parent_id ? { ...values, rrule: null } : values);
    return done(row.id);
  }

  const delta = diffDays(occ, input.date);

  if (scope === "this") {
    const { data: created, error } = await ctx.db
      .from("events")
      .insert(
        dirty(row, {
          ...values,
          user_id: ctx.userId,
          rrule: null,
          reminder_minutes: values.reminder_minutes ?? row.reminder_minutes,
          source: row.source,
          google_calendar_id: row.google_calendar_id,
          recurrence_parent_id: row.id,
          original_date: occ,
        }),
      )
      .select("id")
      .single();
    dbError(error);
    await update(ctx, row, row.id, { exdates: [...new Set([...(row.exdates ?? []), occ])] });
    return done(created!.id);
  }

  const split = scope === "following" && occ > seriesStart ? splitRRule(row.rrule, seriesStart, occ, { tz: ctx.tz, allDay: row.all_day }) : null;

  if (!split?.before) {
    // 전체 수정: 시리즈 시작일을 회차를 옮긴 만큼 옮긴다.
    const start = addDays(seriesStart, delta);
    const shifted = toValues({ ...input, date: start, endDate: addDays(input.endDate, diffDays(input.date, start)) }, ctx.tz);
    if (values.reminder_minutes !== undefined) shifted.reminder_minutes = values.reminder_minutes;
    if (!shifted.rrule) {
      await removeRows(ctx, row, (await children(ctx, row.id)).map((c) => c.id));
      await update(ctx, row, row.id, { ...shifted, exdates: [] });
      return done(row.id);
    }
    await update(ctx, row, row.id, { ...shifted, exdates: (row.exdates ?? []).map((d: string) => addDays(d, delta)) });
    if (delta) for (const c of await children(ctx, row.id)) await update(ctx, row, c.id, { original_date: addDays(c.original_date, delta) });
    return done(row.id, input.date);
  }

  // 이후 모두: 규칙을 바꾸지 않았으면 남은 회차(COUNT 포함)를 이어받는다.
  const rrule = values.rrule === row.rrule ? split.after : values.rrule;
  const { data: created, error } = await ctx.db
    .from("events")
    .insert(
      dirty(row, {
        ...values,
        user_id: ctx.userId,
        rrule,
        reminder_minutes: values.reminder_minutes ?? row.reminder_minutes,
        source: row.source,
        google_calendar_id: row.google_calendar_id,
        exdates: rrule ? (row.exdates ?? []).filter((d: string) => d >= occ).map((d: string) => addDays(d, delta)) : [],
      }),
    )
    .select("id")
    .single();
  dbError(error);
  await update(ctx, row, row.id, { rrule: split.before, exdates: (row.exdates ?? []).filter((d: string) => d < occ) });
  const later = await children(ctx, row.id, occ);
  if (!rrule) await removeRows(ctx, row, later.map((c) => c.id));
  else for (const c of later) await update(ctx, row, c.id, { recurrence_parent_id: created!.id, original_date: addDays(c.original_date, delta) });
  return done(created!.id, input.date);
}

export async function deleteEvent(ctx: Ctx, args: Args): Promise<ToolResult> {
  const { rowId, date } = eventId(args);
  const confirm = args.confirm === true;
  let row = await getRow(ctx, rowId);
  const scopeArg = oneOf(args, "scope", SCOPES);

  // 예외 일정(수정된 회차)에 this 외 범위를 주면 원본 시리즈의 그 회차로 바꿔 처리한다.
  let occ: string | null = date;
  if (row.recurrence_parent_id && scopeArg && scopeArg !== "this") {
    occ = row.original_date;
    row = await getRow(ctx, row.recurrence_parent_id);
  }
  const recurring = Boolean(row.rrule && !row.recurrence_parent_id);
  const scope: Scope = row.recurrence_parent_id ? "this" : scopeArg ?? (recurring && occ ? "this" : "all");
  const ev = view(row, ctx.tz, recurring && occ ? occ : undefined);
  const effect = !recurring
    ? "이 일정을 삭제합니다."
    : scope === "this"
      ? `${occ ?? ev.date} 회차만 삭제합니다.`
      : scope === "following"
        ? `${occ ?? ev.date} 회차부터 이후 모든 회차를 삭제합니다.`
        : "반복 일정 전체(모든 회차)를 삭제합니다.";

  if (!confirm) {
    return {
      data: {
        confirm_required: true,
        message: `아직 삭제하지 않았습니다. 사용자에게 확인을 받은 뒤 confirm: true로 다시 호출하세요. ${effect}`,
        target: ev,
        scope: recurring ? scope : undefined,
      },
    };
  }

  if (row.recurrence_parent_id) await removeRows(ctx, row, [row.id]);
  else if (!recurring || scope === "all") await removeSeries(ctx, row);
  else {
    const seriesStart = toInput(row, ctx.tz).date;
    const at = occ ?? seriesStart;
    if (scope === "this") await update(ctx, row, row.id, { exdates: [...new Set([...(row.exdates ?? []), at])] });
    else {
      const { before } = splitRRule(row.rrule, seriesStart, at, { tz: ctx.tz, allDay: row.all_day });
      if (!before) await removeSeries(ctx, row);
      else {
        await update(ctx, row, row.id, { rrule: before, exdates: (row.exdates ?? []).filter((d: string) => d < at) });
        await removeRows(ctx, row, (await children(ctx, row.id, at)).map((c) => c.id));
      }
    }
  }
  return { data: { deleted: true, target: ev, effect }, summary: `일정 삭제: ${ev.title} (${ev.date}) — ${effect}` };
}

/** 검색: 제목·장소·메모. 반복 일정은 원본 1건(반복 설명 포함)으로 돌려준다 */
export async function searchEvents(ctx: Ctx, query: string, limit: number) {
  const found = new Map<string, Row>();
  for (const col of ["title", "location", "memo"]) {
    const { data, error } = await ctx.db
      .from("events")
      .select(SELECT)
      .eq("user_id", ctx.userId)
      .is("deleted_at", null)
      .ilike(col, likePattern(query))
      .order("start_at", { ascending: false })
      .limit(limit);
    dbError(error);
    for (const r of data ?? []) found.set(r.id, r);
  }
  return [...found.values()]
    .sort((a, b) => String(b.start_at).localeCompare(String(a.start_at)))
    .slice(0, limit)
    .map((r) => view(r, ctx.tz));
}

// ── 빈 시간 ──────────────────────────────────────────────

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const fromMin = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

export async function findFreeTime(ctx: Ctx, args: Args): Promise<ToolResult> {
  const { from, to } = range(ctx, args, 31);
  const duration = int(args, "duration_minutes", { required: true, min: 5, max: 24 * 60 })!;
  const hours = str(args, "work_hours", { max: 20 }) || "09-18";
  const m = /^(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?$/.exec(hours);
  if (!m) throw new ApiError("VALIDATION", "work_hours: '09-18' 또는 '09:30-18:00' 형식이어야 합니다.");
  const ws = +m[1] * 60 + +(m[2] ?? 0);
  const we = +m[3] * 60 + +(m[4] ?? 0);
  if (ws >= we || we > 24 * 60) throw new ApiError("VALIDATION", "work_hours: 시작이 끝보다 앞서야 합니다.");
  const skipWeekends = bool(args, "skip_weekends") ?? false;

  const events = (await eventsInRange(ctx, from, to)).map((x) => x.ev);
  const now = zonedParts(new Date(), ctx.tz);
  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (d < now.date) continue;
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (skipWeekends && (dow === 0 || dow === 6)) continue;
    // 바쁜 구간(분). 종일 일정은 막지 않는다. 끝 시각이 없는 일정은 1시간으로 본다.
    const busy: [number, number][] = [];
    for (const e of events) {
      if (e.all_day || !e.start) continue;
      const endDate = e.end_date ?? e.date;
      if (d < e.date || d > endDate) continue;
      const s = d === e.date ? toMin(e.start) : 0;
      const end = d === endDate ? (e.end ? toMin(e.end) : toMin(e.start) + 60) : 24 * 60;
      busy.push([s, Math.max(end, s)]);
    }
    busy.sort((a, b) => a[0] - b[0]);
    let cursor = d === now.date ? Math.max(ws, Math.ceil((toMin(now.time) + 1) / 5) * 5) : ws;
    const slots = [];
    for (const [s, e] of busy) {
      if (s - cursor >= duration && s > cursor) slots.push({ start: fromMin(cursor), end: fromMin(Math.min(s, we)) });
      cursor = Math.max(cursor, e);
      if (cursor >= we) break;
    }
    if (we - cursor >= duration) slots.push({ start: fromMin(cursor), end: fromMin(we) });
    const valid = slots.filter((x) => toMin(x.end) - toMin(x.start) >= duration);
    if (valid.length) days.push({ date: d, weekday: weekday(d), slots: valid });
  }
  return {
    data: {
      duration_minutes: duration,
      work_hours: `${fromMin(ws)}-${fromMin(we)}`,
      note: "종일 일정은 바쁜 시간으로 치지 않았습니다. 끝 시각이 없는 일정은 1시간으로 계산했습니다.",
      days,
    },
  };
}

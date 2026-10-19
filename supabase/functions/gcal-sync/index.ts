// Edge Function gcal-sync — 구글 캘린더 동기화(GCAL-02~05, 07, 08, 10)
//
// 호출
// - 사용자: supabase.functions.invoke('gcal-sync', { body: { action } })  — 사용자 JWT로 본인 계정만 처리
//   action: "sync"(기본, 내보내기 → 가져오기) | "calendars"(캘린더 목록만 갱신)
// - 주기: pg_cron → public.invoke_gcal_sync() → 헤더 x-cron-secret 으로 모든 활성 계정 처리
//
// 규칙
// - 가져오기는 singleEvents=false 로 받는다. 반복 원본은 rrule·exdates 로, 회차 수정은 예외 일정
//   (recurrence_parent_id·original_date)으로, 취소된 회차는 원본 exdates 로 넣는다. (문서의 singleEvents=true 대신)
// - 내보내기 대상은 google_dirty=true 인 구글 일정이다(사용자가 바꾸면 DB 트리거가 표시). 예외 일정은 반복 없는 단독 일정으로 보낸다.
// - 충돌(412): 구글 updated 와 우리 updated_at 중 늦은 쪽을 남기고 진 쪽을 sync_conflicts 에 남긴다(GCAL-08).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  GoogleApiError,
  GoogleReauthError,
  addDaysIso,
  calPath,
  dateInTz,
  gcal,
  refreshAccessToken,
  timeInTz,
  zonedMidnightUtc,
} from "../_shared/google.ts";

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
type Admin = SupabaseClient;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const LOCK_MS = 2 * 60_000;
const chunk = <T,>(list: T[], n: number) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));
const stripRRule = (r: string) => r.replace(/^RRULE:/i, "");

interface Ctx {
  admin: Admin;
  account: Row;
  userId: string;
  tz: string;
  token: string;
  stats: { exported: number; imported: number; deleted: number; conflicts: number; skipped: string[] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const body = await req.json().catch(() => ({}));
  const action: "sync" | "calendars" = body.action === "calendars" ? "calendars" : "sync";

  let q = admin.from("google_accounts").select("*");
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret && req.headers.get("x-cron-secret") === cronSecret) {
    q = q.eq("status", "active");
  } else {
    const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    const { data, error } = jwt ? await admin.auth.getUser(jwt) : { data: null, error: true };
    if (error || !data?.user) return json({ ok: false, message: "로그인이 필요합니다." }, 401);
    q = q.eq("user_id", data.user.id).neq("status", "revoked");
  }
  const { data: accounts, error } = await q;
  if (error) return json({ ok: false, message: error.message }, 500);

  const results = [];
  for (const account of accounts ?? []) results.push(await runAccount(admin, account, action));
  return json({ ok: results.every((r) => !r.error), results });
});

async function runAccount(admin: Admin, account: Row, action: "sync" | "calendars"): Promise<Row> {
  const result: Row = { accountId: account.id, email: account.google_email };
  // 동시 실행 방지: 2분 안에 시작한 동기화가 있으면 건너뛴다.
  const since = new Date(Date.now() - LOCK_MS).toISOString();
  const { data: locked } = await admin
    .from("google_accounts")
    .update({ sync_started_at: new Date().toISOString() })
    .eq("id", account.id)
    .or(`sync_started_at.is.null,sync_started_at.lt.${since}`)
    .select("id");
  if (!locked?.length) return { ...result, skipped: "이미 동기화 중" };

  try {
    const { data: refresh } = await admin.rpc("get_google_refresh_token", { p_account_id: account.id });
    if (!refresh) throw new GoogleReauthError("저장된 구글 토큰이 없습니다.");
    const token = await refreshAccessToken(refresh as string);
    const { data: profile } = await admin.from("profiles").select("timezone").eq("user_id", account.user_id).maybeSingle();
    const ctx: Ctx = {
      admin,
      account,
      userId: account.user_id,
      tz: profile?.timezone ?? "Asia/Seoul",
      token,
      stats: { exported: 0, imported: 0, deleted: 0, conflicts: 0, skipped: [] },
    };
    await refreshCalendars(ctx);
    if (action === "sync") {
      const { data: cals } = await admin.from("google_calendars").select("*").eq("google_account_id", account.id);
      await exportChanges(ctx, cals ?? []);
      for (const cal of cals ?? []) {
        if (cal.enabled && cal.sync_direction !== "export") await importCalendar(ctx, cal);
      }
    }
    await admin
      .from("google_accounts")
      .update({ status: "active", last_error: null, sync_started_at: null, ...(action === "sync" ? { last_synced_at: new Date().toISOString() } : {}) })
      .eq("id", account.id);
    return { ...result, ...ctx.stats };
  } catch (e) {
    const reauth = e instanceof GoogleReauthError;
    const message = e instanceof Error ? e.message : String(e);
    await admin
      .from("google_accounts")
      .update({ sync_started_at: null, last_error: message.slice(0, 500), ...(reauth ? { status: "reauth_required" } : {}) })
      .eq("id", account.id);
    return { ...result, error: message, reauth };
  }
}

// ── 캘린더 목록(GCAL-02, 07) ─────────────────────────────

async function refreshCalendars(ctx: Ctx) {
  const items: Row[] = [];
  let pageToken: string | undefined;
  do {
    const page = await gcal<Row>(ctx.token, "/users/me/calendarList", { query: { maxResults: "250", pageToken } });
    items.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);

  const { data: existing } = await ctx.admin.from("google_calendars").select("id, calendar_id").eq("google_account_id", ctx.account.id);
  const known = new Map((existing ?? []).map((c) => [c.calendar_id, c.id]));
  const base = (c: Row) => ({
    user_id: ctx.userId,
    google_account_id: ctx.account.id,
    calendar_id: c.id,
    name: c.summaryOverride ?? c.summary ?? c.id,
    color: c.backgroundColor ?? null,
    is_primary: Boolean(c.primary),
    access_role: c.accessRole ?? "reader",
  });
  for (const c of items) {
    const id = known.get(c.id);
    if (id) await ctx.admin.from("google_calendars").update(base(c)).eq("id", id);
  }
  // 새 캘린더: 기본 캘린더만 켜고, 읽기 전용은 가져오기만.
  const fresh = items
    .filter((c) => !known.has(c.id))
    .map((c) => ({
      ...base(c),
      enabled: Boolean(c.primary),
      sync_direction: c.accessRole === "owner" || c.accessRole === "writer" ? "both" : "import",
    }));
  if (fresh.length) {
    const { error } = await ctx.admin.from("google_calendars").insert(fresh);
    if (error) throw new Error(`캘린더 저장 실패: ${error.message}`);
  }
}

// ── 내보내기(GCAL-05, 08) ────────────────────────────────

const writable = (cal: Row) => cal.access_role === "owner" || cal.access_role === "writer";
const canExport = (cal: Row | undefined) => Boolean(cal && cal.enabled && cal.sync_direction !== "import" && writable(cal));

function toGoogle(row: Row, tz: string) {
  const allDay = row.all_day as boolean;
  const startDate = dateInTz(row.start_at, tz);
  const start = allDay ? { date: startDate } : { dateTime: row.start_at, timeZone: tz };
  const endIso: string = row.end_at ?? new Date(Date.parse(row.start_at) + (allDay ? 86_400_000 : 3_600_000)).toISOString();
  const end = allDay ? { date: row.end_at ? dateInTz(endIso, tz) : addDaysIso(startDate, 1) } : { dateTime: endIso, timeZone: tz };
  const body: Row = {
    summary: row.title,
    location: row.location ?? "",
    description: row.memo ?? "",
    start,
    end,
    reminders:
      row.reminder_minutes == null ? { useDefault: true } : { useDefault: false, overrides: [{ method: "popup", minutes: row.reminder_minutes }] },
  };
  // 예외 일정은 반복 없이 단독 일정으로 보낸다.
  if (!row.recurrence_parent_id) {
    if (row.rrule) {
      const hhmmss = allDay ? "" : timeInTz(row.start_at, tz);
      const ex = (row.exdates as string[]).map((d) =>
        allDay ? `EXDATE;VALUE=DATE:${d.replaceAll("-", "")}` : `EXDATE;TZID=${tz}:${d.replaceAll("-", "")}T${hhmmss}`,
      );
      body.recurrence = [`RRULE:${stripRRule(row.rrule)}`, ...ex];
    } else body.recurrence = [];
  }
  return body;
}

async function recordConflict(ctx: Ctx, eventId: string | null, local: Row | null, remote: Row | null, winner: "local" | "remote") {
  ctx.stats.conflicts++;
  await ctx.admin
    .from("sync_conflicts")
    .insert({ user_id: ctx.userId, event_id: eventId, local_snapshot: local, remote_snapshot: remote, resolved_with: winner });
}

/** 내보낸 결과를 저장한다. 그사이 사용자가 또 고쳤으면(updated_at 변경) dirty는 그대로 둔다 */
async function markExported(ctx: Ctx, row: Row, values: Row) {
  const { data } = await ctx.admin
    .from("events")
    .update({ ...values, google_dirty: false })
    .eq("id", row.id)
    .eq("updated_at", row.updated_at)
    .select("id");
  if (!data?.length) await ctx.admin.from("events").update(values).eq("id", row.id);
}

async function exportChanges(ctx: Ctx, cals: Row[]) {
  const { data: rows, error } = await ctx.admin
    .from("events")
    .select("*")
    .eq("user_id", ctx.userId)
    .eq("source", "google")
    .eq("google_dirty", true)
    .order("created_at");
  if (error) throw new Error(`내보낼 일정 조회 실패: ${error.message}`);
  const byId = new Map(cals.map((c) => [c.id, c]));
  // 저장 위치가 없는 새 구글 일정은 기본 캘린더(없으면 첫 번째 쓰기 가능 캘린더)로 보낸다.
  const fallback = cals.find((c) => c.is_primary && canExport(c)) ?? cals.find(canExport);

  for (const row of rows ?? []) {
    const cal = row.google_calendar_id ? byId.get(row.google_calendar_id) : fallback;
    if (!cal || !canExport(cal)) {
      ctx.stats.skipped.push(row.id);
      continue;
    }
    try {
      await exportRow(ctx, row, cal);
    } catch (e) {
      if (e instanceof GoogleApiError && (e.status === 401 || e.status === 403)) throw e;
      ctx.stats.skipped.push(row.id);
      console.error("내보내기 실패", row.id, e instanceof Error ? e.message : e);
    }
  }
}

async function exportRow(ctx: Ctx, row: Row, cal: Row) {
  const gid: string | null = row.google_event_id;

  // 삭제
  if (row.deleted_at) {
    if (gid) {
      try {
        await gcal(ctx.token, calPath(cal.calendar_id, gid), { method: "DELETE", etag: row.google_etag });
      } catch (e) {
        if (!(e instanceof GoogleApiError)) throw e;
        if (e.status === 412) {
          const remote = await gcal<Row>(ctx.token, calPath(cal.calendar_id, gid));
          if (Date.parse(remote.updated) > Date.parse(row.updated_at)) {
            // 구글 쪽 수정이 더 늦다: 삭제를 취소하고 구글 내용을 남긴다.
            await recordConflict(ctx, row.id, row, remote, "remote");
            await ctx.admin.from("events").update({ ...fromGoogle(ctx, remote, cal), deleted_at: null }).eq("id", row.id);
            return;
          }
          await recordConflict(ctx, null, row, remote, "local");
          await gcal(ctx.token, calPath(cal.calendar_id, gid), { method: "DELETE" });
        } else if (e.status !== 404 && e.status !== 410) throw e;
      }
    }
    await ctx.admin.from("events").delete().eq("id", row.id);
    ctx.stats.deleted++;
    return;
  }

  const body = toGoogle(row, ctx.tz);
  const saved = (g: Row) => ({
    google_event_id: g.id,
    google_etag: g.etag,
    google_updated_at: g.updated,
    google_calendar_id: cal.id,
  });

  if (!gid) {
    const created = await gcal<Row>(ctx.token, calPath(cal.calendar_id), { method: "POST", body });
    await markExported(ctx, row, saved(created));
    ctx.stats.exported++;
    return;
  }

  try {
    const updated = await gcal<Row>(ctx.token, calPath(cal.calendar_id, gid), { method: "PATCH", body, etag: row.google_etag });
    await markExported(ctx, row, saved(updated));
    ctx.stats.exported++;
  } catch (e) {
    if (!(e instanceof GoogleApiError)) throw e;
    if (e.status === 404 || e.status === 410) {
      // 구글에서 지워진 일정을 여기서 고쳤다: 새로 만든다.
      const { recurrence: _r, ...single } = body;
      const created = await gcal<Row>(ctx.token, calPath(cal.calendar_id), {
        method: "POST",
        body: row.recurrence_parent_id ? single : body,
      });
      await markExported(ctx, row, saved(created));
      ctx.stats.exported++;
      return;
    }
    if (e.status !== 412) throw e;
    const remote = await gcal<Row>(ctx.token, calPath(cal.calendar_id, gid));
    if (Date.parse(remote.updated) > Date.parse(row.updated_at)) {
      await recordConflict(ctx, row.id, row, remote, "remote");
      await ctx.admin.from("events").update(fromGoogle(ctx, remote, cal)).eq("id", row.id);
      return;
    }
    await recordConflict(ctx, row.id, null, remote, "local");
    const forced = await gcal<Row>(ctx.token, calPath(cal.calendar_id, gid), { method: "PATCH", body });
    await markExported(ctx, row, saved(forced));
    ctx.stats.exported++;
  }
}

// ── 가져오기(GCAL-04) ────────────────────────────────────

/** "EXDATE;TZID=Asia/Seoul:20261020T090000,20261027T090000" → 날짜 목록 */
function parseExdates(lines: string[], tz: string): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (!/^EXDATE/i.test(line)) continue;
    for (const v of line.slice(line.indexOf(":") + 1).split(",")) {
      const m = v.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
      if (!m) continue;
      out.push(m[7] ? dateInTz(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]), tz) : `${m[1]}-${m[2]}-${m[3]}`);
    }
  }
  return out;
}

const originalDate = (item: Row, tz: string): string | null => {
  const o = item.originalStartTime;
  if (!o) return null;
  return o.date ?? dateInTz(o.dateTime, tz);
};

/** 구글 일정 → events 값(upsert용, 모든 행이 같은 키를 갖는다) */
function fromGoogle(ctx: Ctx, item: Row, cal: Row): Row {
  const allDay = Boolean(item.start?.date);
  const start_at = allDay ? zonedMidnightUtc(item.start.date, ctx.tz) : new Date(item.start.dateTime).toISOString();
  let end_at = allDay ? zonedMidnightUtc(item.end?.date ?? addDaysIso(item.start.date, 1), ctx.tz) : new Date(item.end?.dateTime ?? item.start.dateTime).toISOString();
  if (end_at < start_at) end_at = start_at;
  const recurrence: string[] = item.recurrence ?? [];
  const rruleLine = recurrence.find((l) => /^RRULE:/i.test(l));
  const overrides = item.reminders && !item.reminders.useDefault ? item.reminders.overrides ?? [] : null;
  return {
    user_id: ctx.userId,
    title: item.summary || "(제목 없음)",
    start_at,
    end_at,
    all_day: allDay,
    location: item.location ?? "",
    memo: item.description ?? "",
    rrule: rruleLine ? stripRRule(rruleLine) : null,
    reminder_minutes: overrides ? (overrides[0]?.minutes ?? null) : null,
    source: "google",
    google_calendar_id: cal.id,
    google_event_id: item.id,
    google_etag: item.etag,
    google_updated_at: item.updated,
    google_dirty: false,
    deleted_at: null,
  };
}

async function listGoogleEvents(ctx: Ctx, cal: Row): Promise<{ items: Row[]; nextSyncToken: string | null; full: boolean }> {
  let syncToken: string | undefined = cal.sync_token ?? undefined;
  for (;;) {
    const items: Row[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | null = null;
    try {
      do {
        const page = await gcal<Row>(ctx.token, calPath(cal.calendar_id), {
          query: { singleEvents: "false", maxResults: "2500", pageToken, syncToken, showDeleted: syncToken ? "true" : undefined },
        });
        items.push(...(page.items ?? []));
        pageToken = page.nextPageToken;
        nextSyncToken = page.nextSyncToken ?? nextSyncToken;
      } while (pageToken);
      return { items, nextSyncToken, full: !syncToken };
    } catch (e) {
      // syncToken 만료: 전체를 다시 받는다.
      if (e instanceof GoogleApiError && e.status === 410 && syncToken) {
        syncToken = undefined;
        continue;
      }
      throw e;
    }
  }
}

async function rowsByGid(ctx: Ctx, gids: string[]): Promise<Map<string, Row>> {
  const map = new Map<string, Row>();
  for (const part of chunk([...new Set(gids)], 150)) {
    const { data, error } = await ctx.admin.from("events").select("*").eq("user_id", ctx.userId).in("google_event_id", part);
    if (error) throw new Error(`일정 조회 실패: ${error.message}`);
    for (const r of data ?? []) map.set(r.google_event_id, r);
  }
  return map;
}

async function upsertRows(ctx: Ctx, values: Row[]): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const part of chunk(values, 200)) {
    const { data, error } = await ctx.admin
      .from("events")
      .upsert(part, { onConflict: "user_id,google_event_id" })
      .select("id, google_event_id");
    if (error) throw new Error(`일정 저장 실패: ${error.message}`);
    for (const r of data ?? []) ids.set(r.google_event_id, r.id);
  }
  return ids;
}

async function importCalendar(ctx: Ctx, cal: Row) {
  const { items, nextSyncToken, full } = await listGoogleEvents(ctx, cal);
  const existing = await rowsByGid(ctx, [...items.map((i) => i.id), ...items.map((i) => i.recurringEventId).filter(Boolean)]);
  const masters: Row[] = [];
  const instances: Row[] = [];
  const addExdates = new Map<string, Set<string>>(); // 원본 gid → 추가할 제외 날짜
  const addEx = (gid: string, d: string | null) => {
    if (!d) return;
    if (!addExdates.has(gid)) addExdates.set(gid, new Set());
    addExdates.get(gid)!.add(d);
  };
  const toDelete: Row[] = [];

  for (const item of items) {
    const local = existing.get(item.id);
    if (item.status === "cancelled") {
      if (item.recurringEventId) addEx(item.recurringEventId, originalDate(item, ctx.tz));
      if (local) toDelete.push(local);
      continue;
    }
    const values = fromGoogle(ctx, item, cal);
    if (local) {
      if (local.deleted_at && local.google_dirty) continue; // 삭제 대기 중: 내보내기가 처리한다
      if (local.google_dirty) {
        // 양쪽에서 고쳤다: 늦은 쪽을 남긴다(GCAL-08).
        if (Date.parse(item.updated) <= Date.parse(local.updated_at)) continue;
        await recordConflict(ctx, local.id, local, item, "remote");
      }
      // 구글에 없는 정보(분류)는 그대로 두고, 알림은 구글이 기본값이면 우리 값을 유지한다.
      if (values.reminder_minutes == null && item.reminders?.useDefault) values.reminder_minutes = local.reminder_minutes;
    }
    if (item.recurringEventId) {
      addEx(item.recurringEventId, originalDate(item, ctx.tz));
      instances.push({ ...values, rrule: null, original_date: originalDate(item, ctx.tz), _parent: item.recurringEventId });
    } else {
      const ex = new Set<string>([...(local?.exdates ?? []), ...parseExdates(item.recurrence ?? [], ctx.tz)]);
      masters.push({ ...values, exdates: [...ex].sort(), recurrence_parent_id: null, original_date: null });
    }
  }

  // 원본 → 회차 수정 순서로 저장한다(회차가 원본 id를 참조).
  const ids = await upsertRows(ctx, masters);
  const parentId = (gid: string) => ids.get(gid) ?? existing.get(gid)?.id ?? null;
  const linked = instances.map(({ _parent, ...v }) => ({ ...v, recurrence_parent_id: parentId(_parent) }));
  await upsertRows(ctx, linked);
  ctx.stats.imported += masters.length + linked.length;

  // 회차 수정·취소를 원본 exdates에 더한다.
  for (const [gid, dates] of addExdates) {
    const id = parentId(gid);
    if (!id) continue;
    const { data: row } = await ctx.admin.from("events").select("exdates").eq("id", id).maybeSingle();
    if (!row) continue;
    const merged = [...new Set([...(row.exdates ?? []), ...dates])].sort();
    if (merged.length !== (row.exdates ?? []).length) await ctx.admin.from("events").update({ exdates: merged }).eq("id", id);
  }

  for (const part of chunk(toDelete.map((r) => r.id), 150)) {
    await ctx.admin.from("events").delete().in("id", part);
    ctx.stats.deleted += part.length;
  }

  // 전체 동기화였으면 구글에 없는 이 캘린더의 일정을 지운다(아직 내보내지 않은 변경은 남긴다).
  if (full) {
    const seen = new Set(items.map((i) => i.id));
    const { data: mine } = await ctx.admin
      .from("events")
      .select("id, google_event_id")
      .eq("google_calendar_id", cal.id)
      .eq("google_dirty", false)
      .not("google_event_id", "is", null);
    const stale = (mine ?? []).filter((r) => !seen.has(r.google_event_id)).map((r) => r.id);
    for (const part of chunk(stale, 150)) {
      await ctx.admin.from("events").delete().in("id", part);
      ctx.stats.deleted += part.length;
    }
  }

  await ctx.admin
    .from("google_calendars")
    .update({ sync_token: nextSyncToken, last_synced_at: new Date().toISOString() })
    .eq("id", cal.id);
}

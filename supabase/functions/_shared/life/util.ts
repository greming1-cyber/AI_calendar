// mcp-api 공통: 오류, 인자 검증, 타임존 날짜 계산, 이름 찾기.
// Edge Function(Deno)이라 웹 앱의 src/lib/date.ts를 import하지 않고 같은 규칙을 여기 둔다.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

// deno-lint-ignore no-explicit-any
export type Row = Record<string, any>;
export type Args = Record<string, unknown>;

export type ErrorCode = "UNAUTHORIZED" | "FORBIDDEN_SCOPE" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "UPSTREAM";

export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public candidates?: string[],
  ) {
    super(message);
  }
}

/** 도구 실행 문맥. 모든 쿼리는 userId 조건을 붙인다 */
export interface Ctx {
  db: SupabaseClient;
  userId: string;
  tz: string;
  scopes: Set<string>;
  today: string;
}

/** 쓰기 도구가 사용 기록에 남길 한 줄 요약을 함께 돌려준다 */
export interface ToolResult {
  data: unknown;
  summary?: string;
}

/** Supabase 오류 → ApiError */
export function dbError(error: { code?: string; message: string } | null): never | void {
  if (!error) return;
  if (error.code === "23505") throw new ApiError("CONFLICT", "같은 항목이 이미 있습니다.");
  if (error.code === "P0002") throw new ApiError("NOT_FOUND", error.message);
  throw new ApiError("UPSTREAM", `데이터베이스 오류: ${error.message}`);
}

// ── 인자 검증 ────────────────────────────────────────────

const fail = (key: string, msg: string): never => {
  throw new ApiError("VALIDATION", `${key}: ${msg}`);
};

export function str(args: Args, key: string, opts: { required: true; max?: number }): string;
export function str(args: Args, key: string, opts?: { required?: boolean; max?: number }): string | undefined;
export function str(args: Args, key: string, opts: { required?: boolean; max?: number } = {}) {
  const v = args[key];
  if (v === undefined || v === null) return opts.required ? fail(key, "필수 값입니다.") : undefined;
  if (typeof v !== "string") return fail(key, "문자열이어야 합니다.");
  const s = v.trim();
  if (opts.required && !s) fail(key, "비어 있을 수 없습니다.");
  if (s.length > (opts.max ?? 500)) fail(key, `${opts.max ?? 500}자 이하로 입력하세요.`);
  return s;
}

export function int(args: Args, key: string, opts: { min?: number; max?: number; required?: boolean } = {}): number | undefined {
  const v = args[key];
  if (v === undefined || v === null) return opts.required ? fail(key, "필수 값입니다.") : undefined;
  const n = typeof v === "string" && /^-?\d+$/.test(v.replaceAll(",", "")) ? Number(v.replaceAll(",", "")) : v;
  if (typeof n !== "number" || !Number.isInteger(n)) return fail(key, "정수여야 합니다.");
  if (opts.min !== undefined && n < opts.min) fail(key, `${opts.min} 이상이어야 합니다.`);
  if (opts.max !== undefined && n > opts.max) fail(key, `${opts.max} 이하여야 합니다.`);
  return n;
}

export function bool(args: Args, key: string): boolean | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "boolean") return fail(key, "true 또는 false여야 합니다.");
  return v;
}

export function oneOf<T extends string>(args: Args, key: string, values: readonly T[]): T | undefined {
  const v = str(args, key);
  if (v === undefined || v === "") return undefined;
  if (!values.includes(v as T)) fail(key, `다음 중 하나여야 합니다: ${values.join(", ")}`);
  return v as T;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuid(args: Args, key = "id"): string {
  const v = str(args, key, { required: true, max: 100 });
  if (!UUID.test(v)) fail(key, "올바른 id가 아닙니다. 목록 도구가 돌려준 id를 그대로 쓰세요.");
  return v;
}

/** 일정 id: 행 id 또는 반복 회차 id "<행id>:<YYYY-MM-DD>" */
export function eventId(args: Args): { rowId: string; date: string | null } {
  const v = str(args, "id", { required: true, max: 100 });
  const [rowId, date] = v.split(":");
  if (!UUID.test(rowId) || (date !== undefined && !ISO_DATE.test(date))) {
    fail("id", "올바른 일정 id가 아닙니다. list_events가 돌려준 id를 그대로 쓰세요.");
  }
  return { rowId, date: date ?? null };
}

// ── 날짜·시각 ────────────────────────────────────────────

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_LOCAL = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;
const ISO_ZONED = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/;

const validDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

/** YYYY-MM-DD 날짜 인자. 일시를 주면 사용자 타임존의 날짜로 본다 */
export function date(ctx: Ctx, args: Args, key: string, opts: { required?: boolean } = {}): string | undefined {
  const v = str(args, key, { max: 40 });
  if (v === undefined || v === "") return opts.required ? fail(key, "필수 값입니다(YYYY-MM-DD).") : undefined;
  const p = dateTime(ctx, v, key);
  return p.date;
}

/**
 * ISO 8601 날짜·일시 문자열 → 사용자 타임존 기준 { date, time }.
 * - YYYY-MM-DD → time null(종일)
 * - YYYY-MM-DDTHH:mm[:ss] → 사용자 타임존의 벽시계 시각
 * - 오프셋/Z가 붙은 일시 → 사용자 타임존으로 바꾼다
 */
export function dateTime(ctx: Ctx, v: string, key: string): { date: string; time: string | null } {
  if (ISO_DATE.test(v)) {
    if (!validDate(v)) fail(key, `없는 날짜입니다: ${v}`);
    return { date: v, time: null };
  }
  const local = ISO_LOCAL.exec(v);
  if (local) {
    if (!validDate(local[1]) || +local[2] > 23 || +local[3] > 59) fail(key, `잘못된 일시입니다: ${v}`);
    return { date: local[1], time: `${local[2]}:${local[3]}` };
  }
  if (ISO_ZONED.test(v) && !Number.isNaN(Date.parse(v))) {
    const z = zonedParts(new Date(v), ctx.tz);
    return { date: z.date, time: z.time };
  }
  return fail(key, `ISO 8601 형식(YYYY-MM-DD 또는 YYYY-MM-DDTHH:mm)이어야 합니다: ${v}. 상대 날짜는 now를 기준으로 절대 날짜로 바꿔 보내세요.`);
}

export const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/** b - a (일) */
export const diffDays = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;
export const weekday = (iso: string) => WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()];

const fmtCache = new Map<string, Intl.DateTimeFormat>();
const zonedFormat = (tz: string) => {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    fmtCache.set(tz, f);
  }
  return f;
};

/** 순간을 타임존의 날짜·시각(HH:mm)으로 */
export const zonedParts = (at: Date | string, tz: string) => {
  const p = Object.fromEntries(
    zonedFormat(tz)
      .formatToParts(typeof at === "string" ? new Date(at) : at)
      .map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, second: Number(p.second) };
};

/** 타임존의 날짜·시각 → timestamptz용 ISO 문자열(UTC). 웹 앱 date.ts의 zonedToUtc와 같다 */
export const zonedToUtc = (date: string, time = "00:00", tz: string): string => {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const offsetAt = (t: number) => {
    const z = zonedParts(new Date(t), tz);
    const [zy, zm, zd] = z.date.split("-").map(Number);
    const [zh, zmin] = z.time.split(":").map(Number);
    return Date.UTC(zy, zm - 1, zd, zh, zmin, z.second) - t;
  };
  let utc = wall - offsetAt(wall);
  utc = wall - offsetAt(utc);
  return new Date(utc).toISOString();
};

/** 사용자 타임존 기준 현재 시각. 예: 2026-10-19T14:03:22+09:00 */
export function nowIso(tz: string, at = new Date()): string {
  const z = zonedParts(at, tz);
  const [y, m, d] = z.date.split("-").map(Number);
  const [hh, mm] = z.time.split(":").map(Number);
  const offsetMin = Math.round((Date.UTC(y, m - 1, d, hh, mm, z.second) - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const off = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  return `${z.date}T${z.time}:${String(z.second).padStart(2, "0")}${off}`;
}

/** 조회 기간 검사: from ≤ to, 최대 maxDays일 */
export function range(ctx: Ctx, args: Args, maxDays = 366): { from: string; to: string } {
  const from = date(ctx, args, "from", { required: true })!;
  const to = date(ctx, args, "to", { required: true })!;
  if (to < from) fail("to", "from보다 같거나 뒤여야 합니다.");
  if (diffDays(from, to) > maxDays) fail("to", `조회 기간은 최대 ${maxDays}일입니다.`);
  return { from, to };
}

// ── 이름으로 찾기 ────────────────────────────────────────

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/**
 * 이름이 같은 항목(공백·대소문자 무시)을 찾는다. 없으면 만들지 않고 NOT_FOUND와 후보 이름을 돌려준다.
 * 후보는 이름이 서로 포함되는 것, 없으면 전체 목록이다(웹 앱 transactions.ts findCategoryByName과 같은 규칙).
 */
export function findByName<T extends { name: string }>(list: T[], name: string, label: string): T {
  const key = norm(name);
  const hit = list.find((x) => norm(x.name) === key);
  if (hit) return hit;
  const close = list.filter((x) => norm(x.name).includes(key) || key.includes(norm(x.name)));
  const candidates = [...new Set((close.length ? close : list).map((x) => x.name))];
  throw new ApiError("NOT_FOUND", `${label} "${name}"을(를) 찾을 수 없습니다. 새로 만들지 않으니 후보 중에서 고르거나 사용자에게 물어보세요.`, candidates);
}

export const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** ilike 패턴용 이스케이프 */
export const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export const includesText = (q: string, ...fields: (string | null | undefined)[]) => {
  const key = q.toLowerCase();
  return fields.some((f) => f?.toLowerCase().includes(key));
};

// 구글 OAuth·Calendar API 호출과 시간대 변환 (Deno, Edge Function 공용)

const CAL_API = "https://www.googleapis.com/calendar/v3";

/** refresh token이 만료·철회돼 사용자가 다시 연결해야 한다(GCAL-10) */
export class GoogleReauthError extends Error {}

/** 구글 API 오류. status로 412(etag 불일치)·404·410 등을 구분한다 */
export class GoogleApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID") ?? "",
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (body.error === "invalid_grant") throw new GoogleReauthError("구글 권한이 만료되었거나 철회되었습니다.");
    throw new GoogleApiError(res.status, `토큰 갱신 실패: ${body.error ?? res.status}`);
  }
  return body.access_token as string;
}

/** Calendar API 호출. 2xx가 아니면 GoogleApiError. 204·빈 응답은 null */
export async function gcal<T = unknown>(
  token: string,
  path: string,
  init: { method?: string; query?: Record<string, string | undefined>; body?: unknown; etag?: string | null } = {},
): Promise<T> {
  const url = new URL(CAL_API + path);
  for (const [k, v] of Object.entries(init.query ?? {})) if (v !== undefined) url.searchParams.set(k, v);
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.etag) headers["If-Match"] = init.etag;
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GoogleApiError(res.status, `${init.method ?? "GET"} ${path} → ${res.status} ${text.slice(0, 200)}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export const calPath = (calendarId: string, eventId?: string) =>
  `/calendars/${encodeURIComponent(calendarId)}/events${eventId ? `/${encodeURIComponent(eventId)}` : ""}`;

// ── 시간대 ───────────────────────────────────────────────

const fmtCache = new Map<string, Intl.DateTimeFormat>();
const fmt = (tz: string) => {
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

/** 시각(ms)을 tz의 벽시계 부분으로 나눈다 */
function wall(ms: number, tz: string) {
  const p = Object.fromEntries(fmt(tz).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}

/** tz 기준 날짜 YYYY-MM-DD */
export function dateInTz(iso: string | number, tz: string): string {
  const w = wall(typeof iso === "number" ? iso : Date.parse(iso), tz);
  return `${w.y}-${String(w.m).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`;
}

/** tz 기준 시각 HHMMSS */
export function timeInTz(iso: string, tz: string): string {
  const w = wall(Date.parse(iso), tz);
  return [w.h, w.mi, w.s].map((n) => String(n).padStart(2, "0")).join("");
}

/** tz의 date 0시를 UTC ISO로 */
export function zonedMidnightUtc(date: string, tz: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d);
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const w = wall(guess, tz);
    guess += target - Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s);
  }
  return new Date(guess).toISOString();
}

export const addDaysIso = (date: string, n: number) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

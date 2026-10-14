import type { ISODate } from "./types/common";

export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

// 날짜 계산은 UTC 기준으로 해서 브라우저 타임존 영향을 받지 않게 한다.
const toDate = (iso: ISODate) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

const fromDate = (dt: Date): ISODate => dt.toISOString().slice(0, 10);

export const isoDate = (y: number, m: number, d: number): ISODate =>
  fromDate(new Date(Date.UTC(y, m - 1, d)));

export const addDays = (iso: ISODate, n: number): ISODate => {
  const dt = toDate(iso);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromDate(dt);
};

export const parts = (iso: ISODate) => {
  const dt = toDate(iso);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), dow: dt.getUTCDay() };
};

export const weekday = (iso: ISODate) => WEEKDAYS[parts(iso).dow];

/** 10월 14일 수요일 */
export const longLabel = (iso: ISODate) => {
  const { m, d } = parts(iso);
  return `${m}월 ${d}일 ${weekday(iso)}요일`;
};

/** 10/14 */
export const shortLabel = (iso: ISODate) => {
  const { m, d } = parts(iso);
  return `${m}/${d}`;
};

/** 일요일 시작 월 달력 칸. 앞뒤 달 날짜를 포함해 7의 배수로 채운다. */
export const monthGrid = (y: number, m: number) => {
  const first = isoDate(y, m, 1);
  const lead = parts(first).dow;
  const days = parts(isoDate(y, m + 1, 0)).d;
  const total = Math.ceil((lead + days) / 7) * 7;
  return Array.from({ length: total }, (_, i) => {
    const date = addDays(first, i - lead);
    return { date, inMonth: parts(date).m === m };
  });
};

export const shiftMonth = (y: number, m: number, n: number) => {
  const { y: ny, m: nm } = parts(isoDate(y, m + n, 1));
  return { y: ny, m: nm };
};

/** 월의 첫날·마지막 날 */
export const monthRange = (y: number, m: number) => ({ from: isoDate(y, m, 1), to: isoDate(y, m + 1, 0) });

/** YYYY-MM (budgets.month 형식) */
export const monthKey = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;

// ── 타임존 ───────────────────────────────────────────────
// DB의 timestamptz ↔ 사용자 타임존의 날짜(YYYY-MM-DD)·시각(HH:mm) 변환.

export const DEFAULT_TZ = "Asia/Seoul";

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

/** 순간(Date·ISO 문자열)을 타임존의 날짜·시각으로 */
export const zonedParts = (at: Date | string, tz: string = DEFAULT_TZ) => {
  const p = Object.fromEntries(
    zonedFormat(tz)
      .formatToParts(typeof at === "string" ? new Date(at) : at)
      .map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}` as ISODate, time: `${p.hour}:${p.minute}`, second: Number(p.second) };
};

/** 타임존 기준 오늘 */
export const todayIn = (tz: string = DEFAULT_TZ, now: Date = new Date()): ISODate => zonedParts(now, tz).date;

/** 타임존의 날짜·시각(HH:mm, 생략 시 0시)을 timestamptz용 ISO 문자열(UTC)로 */
export const zonedToUtc = (date: ISODate, time = "00:00", tz: string = DEFAULT_TZ): string => {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  // 같은 순간을 그 타임존에서 본 벽시계와의 차이가 오프셋이다. 서머타임 경계를 위해 한 번 더 보정한다.
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

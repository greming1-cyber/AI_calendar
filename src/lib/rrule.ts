// RRULE(RFC 5545) 부분 구현. 외부 import 없는 순수 TS라 웹 앱과 Edge Function(Deno)이 함께 쓴다.
//
// - 지원: FREQ(DAILY/WEEKLY/MONTHLY/YEARLY), INTERVAL, COUNT, UNTIL, BYDAY(MONTHLY·YEARLY+BYMONTH는 서수 허용),
//   BYMONTHDAY, BYMONTH, WKST. 그 밖의 규칙 부분은 RRuleError를 던진다.
// - 날짜는 사용자 타임존 기준 `YYYY-MM-DD` 문자열이다. 시각은 다루지 않고 회차 날짜만 계산한다.
// - DTSTART는 규칙과 맞지 않아도 첫 회차로 센다. COUNT는 EXDATE로 뺀 회차도 포함해 센다(RFC 5545).
// - 31일·2월 29일처럼 없는 날짜의 회차는 기본으로 건너뛴다(RFC 5545, 구글 캘린더와 같음).
//   할일은 `TODO_RULE_OPTIONS`(말일 보정, COUNT 무시)로 DB 함수 `todo_next_due`와 같은 결과를 낸다.

export type ISODate = string; // YYYY-MM-DD
export type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export type Weekday = "SU" | "MO" | "TU" | "WE" | "TH" | "FR" | "SA";

export interface ByDay {
  day: Weekday;
  /** 서수. 2 = 둘째, -1 = 마지막. 없으면 해당 요일 전부 */
  ord?: number;
}

export interface RRule {
  freq: Freq;
  interval: number;
  byDay: ByDay[];
  byMonthDay: number[];
  byMonth: number[];
  wkst: Weekday;
  count?: number;
  /** RFC 5545 원문 값. `20261231` 또는 `20261231T145959Z` */
  until?: string;
}

export interface ExpandOptions {
  /** UNTIL이 UTC 일시일 때 로컬 날짜로 바꿀 타임존. 기본 Asia/Seoul */
  tz?: string;
  /** 회차 시작 시각 HH:mm. UNTIL 당일 회차를 포함할지 판단한다. 종일이면 생략 */
  time?: string;
  /** 일정이 걸치는 추가 일수(여러 날 일정). from 이전에 시작해 범위에 걸치는 회차도 돌려준다 */
  spanDays?: number;
  /** 그 달에 없는 날짜(31일, 2월 29일 등). skip = 건너뜀(RFC 5545, 기본), clamp = 말일로 보정 */
  monthEnd?: "skip" | "clamp";
  /** COUNT를 무시한다(할일 다음 회차 계산용) */
  ignoreCount?: boolean;
  /** UNTIL의 시각·타임존을 무시하고 앞 8자리 날짜만 본다(할일 DB 함수와 같은 방식) */
  untilDateOnly?: boolean;
}

/** 할일 반복 규칙. DB 함수 `todo_next_due`(세션 02)와 같은 결과를 내도록 맞춘 옵션 */
export const TODO_RULE_OPTIONS: ExpandOptions = { monthEnd: "clamp", ignoreCount: true, untilDateOnly: true };

export interface SplitOptions {
  tz?: string;
  /** 종일 일정이면 UNTIL을 날짜 형식으로, 아니면 UTC 일시 형식으로 쓴다 */
  allDay?: boolean;
}

export class RRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RRuleError";
  }
}

export const WEEKDAY_CODES: readonly Weekday[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];
const DEFAULT_TZ = "Asia/Seoul";
const MAX_PERIODS = 100_000;

// ---------- 날짜 계산 (1970-01-01부터의 일수) ----------

const DAY_MS = 86_400_000;

const toDay = (iso: ISODate) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
};

const fromDay = (n: number): ISODate => new Date(n * DAY_MS).toISOString().slice(0, 10);

const ymd = (n: number) => {
  const dt = new Date(n * DAY_MS);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), dow: dt.getUTCDay() };
};

/** 없는 날짜(2월 30일 등)면 null */
const dayOf = (y: number, m: number, d: number) => {
  const n = Date.UTC(y, m - 1, d) / DAY_MS;
  return ymd(n).m === m && ymd(n).d === d ? n : null;
};

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// ---------- 타임존 ----------

/** UTC 시각을 tz 기준 { date, time: HH:mm:ss }로 */
const localParts = (ms: number, tz: string) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}:${p.second}` };
};

/** tz 기준 로컬 일시를 UTC ms로 */
const localToUtc = (date: ISODate, time: string, tz: string) => {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm, ss] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm, ss || 0);
  const offset = (ms: number) => {
    const l = localParts(ms, tz);
    const [ly, lm, ld] = l.date.split("-").map(Number);
    const [lh, lmi, ls] = l.time.split(":").map(Number);
    return Date.UTC(ly, lm - 1, ld, lh, lmi, ls) - ms;
  };
  const first = guess - offset(guess);
  return guess - offset(first);
};

/** UNTIL 원문을 로컬 { date, time }으로. 날짜 형식이면 그날 하루 전체를 포함한다 */
const untilLocal = (raw: string, tz: string) => {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(raw);
  if (!m) throw new RRuleError(`UNTIL 형식 오류: ${raw}`);
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (!m[4]) return { date, time: "23:59:59" };
  const time = `${m[4]}:${m[5]}:${m[6]}`;
  if (!m[7]) return { date, time }; // 떠 있는 시각은 로컬로 본다
  return localParts(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]), tz);
};

const compact = (iso: ISODate) => iso.replaceAll("-", "");

// ---------- 파싱·직렬화 ----------

/** `FREQ=WEEKLY;BYDAY=TU,TH` 형태를 읽는다. `RRULE:` 접두어와 여러 줄 입력(DTSTART 등)도 받는다 */
export function parseRRule(input: string): RRule {
  const line =
    input
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find((s) => /^RRULE:/i.test(s) || /^FREQ=/i.test(s) || /;FREQ=/i.test(s)) ?? "";
  const body = line.replace(/^RRULE:/i, "");
  if (!body) throw new RRuleError("RRULE이 비어 있습니다.");

  const rule: Partial<RRule> & { byDay: ByDay[]; byMonthDay: number[]; byMonth: number[] } = {
    interval: 1,
    byDay: [],
    byMonthDay: [],
    byMonth: [],
    wkst: "MO",
  };

  const int = (key: string, v: string) => {
    if (!/^[+-]?\d+$/.test(v)) throw new RRuleError(`${key} 값 오류: ${v}`);
    return Number(v);
  };

  for (const part of body.split(";")) {
    if (!part) continue;
    const [k, v = ""] = part.split("=");
    const key = k.toUpperCase();
    const val = v.toUpperCase();
    switch (key) {
      case "FREQ":
        if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(val)) throw new RRuleError(`지원하지 않는 FREQ: ${val}`);
        rule.freq = val as Freq;
        break;
      case "INTERVAL":
        rule.interval = int(key, val);
        if (rule.interval < 1) throw new RRuleError("INTERVAL은 1 이상이어야 합니다.");
        break;
      case "COUNT":
        rule.count = int(key, val);
        if (rule.count < 1) throw new RRuleError("COUNT는 1 이상이어야 합니다.");
        break;
      case "UNTIL":
        untilLocal(val, DEFAULT_TZ); // 형식 검사
        rule.until = val;
        break;
      case "WKST":
        if (!WEEKDAY_CODES.includes(val as Weekday)) throw new RRuleError(`WKST 값 오류: ${val}`);
        rule.wkst = val as Weekday;
        break;
      case "BYDAY":
        rule.byDay = val.split(",").map((s) => {
          const m = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(s);
          if (!m) throw new RRuleError(`BYDAY 값 오류: ${s}`);
          const ord = m[1] ? Number(m[1]) : undefined;
          if (ord !== undefined && (ord === 0 || Math.abs(ord) > 5)) throw new RRuleError(`BYDAY 서수 오류: ${s}`);
          return ord === undefined ? { day: m[2] as Weekday } : { day: m[2] as Weekday, ord };
        });
        break;
      case "BYMONTHDAY":
        rule.byMonthDay = val.split(",").map((s) => {
          const n = int(key, s);
          if (n === 0 || Math.abs(n) > 31) throw new RRuleError(`BYMONTHDAY 값 오류: ${s}`);
          return n;
        });
        break;
      case "BYMONTH":
        rule.byMonth = val.split(",").map((s) => {
          const n = int(key, s);
          if (n < 1 || n > 12) throw new RRuleError(`BYMONTH 값 오류: ${s}`);
          return n;
        });
        break;
      default:
        throw new RRuleError(`지원하지 않는 규칙: ${key}`);
    }
  }

  if (!rule.freq) throw new RRuleError("FREQ가 없습니다.");
  if (rule.count !== undefined && rule.until !== undefined) throw new RRuleError("COUNT와 UNTIL은 함께 쓸 수 없습니다.");
  const hasOrd = rule.byDay.some((b) => b.ord !== undefined);
  if (hasOrd && !(rule.freq === "MONTHLY" || (rule.freq === "YEARLY" && rule.byMonth.length > 0)))
    throw new RRuleError("서수 BYDAY는 MONTHLY 또는 BYMONTH가 있는 YEARLY에서만 지원합니다.");
  return rule as RRule;
}

/** RRULE 본문(`RRULE:` 접두어 없음)으로 직렬화한다. DB `events.rrule`에 그대로 저장하는 형태 */
export function buildRRule(rule: Partial<RRule> & { freq: Freq }): string {
  const parts = [`FREQ=${rule.freq}`];
  if (rule.interval && rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.byMonth?.length) parts.push(`BYMONTH=${rule.byMonth.join(",")}`);
  if (rule.byMonthDay?.length) parts.push(`BYMONTHDAY=${rule.byMonthDay.join(",")}`);
  if (rule.byDay?.length) parts.push(`BYDAY=${rule.byDay.map((b) => `${b.ord ?? ""}${b.day}`).join(",")}`);
  if (rule.wkst && rule.wkst !== "MO") parts.push(`WKST=${rule.wkst}`);
  if (rule.count !== undefined) parts.push(`COUNT=${rule.count}`);
  else if (rule.until) parts.push(`UNTIL=${rule.until}`);
  return parts.join(";");
}

/** 로컬 날짜까지(그날 포함) 반복하는 UNTIL 값. 종일은 `YYYYMMDD`, 시간 일정은 그날 23:59:59의 UTC 일시 */
export function untilValue(date: ISODate, opts: SplitOptions = {}): string {
  if (opts.allDay) return compact(date);
  const ms = localToUtc(date, "23:59:59", opts.tz ?? DEFAULT_TZ);
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// ---------- 회차 생성 ----------

const dowIndex = (d: Weekday) => WEEKDAY_CODES.indexOf(d);

/** 한 달 안에서 BYDAY(서수 포함)에 맞는 날 */
const monthByDay = (y: number, m: number, byDay: ByDay[]) => {
  const first = dayOf(y, m, 1)!;
  const len = daysInMonth(y, m);
  const out: number[] = [];
  for (const b of byDay) {
    const offset = (dowIndex(b.day) - ymd(first).dow + 7) % 7;
    const all: number[] = [];
    for (let n = first + offset; n < first + len; n += 7) all.push(n);
    if (b.ord === undefined) out.push(...all);
    else {
      const pick = b.ord > 0 ? all[b.ord - 1] : all[all.length + b.ord];
      if (pick !== undefined) out.push(pick);
    }
  }
  return out;
};

const monthDays = (y: number, m: number, byMonthDay: number[], clamp = false) => {
  const len = daysInMonth(y, m);
  return byMonthDay.flatMap((d) => {
    let day = d > 0 ? d : len + d + 1;
    if (clamp) day = Math.min(Math.max(day, 1), len);
    return day >= 1 && day <= len ? [dayOf(y, m, day)!] : [];
  });
};

/** 한 달의 후보. BYMONTHDAY·BYDAY가 둘 다 있으면 교집합, 없으면 DTSTART의 일 */
const monthCandidates = (y: number, m: number, rule: RRule, startD: number, clamp: boolean) => {
  if (rule.byMonthDay.length && rule.byDay.length) {
    const days = new Set(monthByDay(y, m, rule.byDay));
    return monthDays(y, m, rule.byMonthDay, clamp).filter((n) => days.has(n));
  }
  if (rule.byMonthDay.length) return monthDays(y, m, rule.byMonthDay, clamp);
  if (rule.byDay.length) return monthByDay(y, m, rule.byDay);
  return monthDays(y, m, [startD], clamp);
};

/** 기간(일·주·월·년) 단위로 후보 날짜를 오름차순으로 만든다. DTSTART 이전은 뺀다 */
function* candidates(rule: RRule, start: number, clamp: boolean): Generator<number> {
  const s = ymd(start);
  const plainDays = new Set(rule.byDay.filter((b) => b.ord === undefined).map((b) => dowIndex(b.day)));
  const monthOk = (n: number) => !rule.byMonth.length || rule.byMonth.includes(ymd(n).m);

  for (let i = 0; i < MAX_PERIODS; i++) {
    let list: number[] = [];
    switch (rule.freq) {
      case "DAILY": {
        const n = start + i * rule.interval;
        const p = ymd(n);
        const mdOk = !rule.byMonthDay.length || monthDays(p.y, p.m, rule.byMonthDay).includes(n);
        if (monthOk(n) && mdOk && (!plainDays.size || plainDays.has(p.dow))) list = [n];
        break;
      }
      case "WEEKLY": {
        const weekStart = start - ((s.dow - dowIndex(rule.wkst) + 7) % 7) + i * 7 * rule.interval;
        const days = plainDays.size ? plainDays : new Set([s.dow]);
        for (let k = 0; k < 7; k++) {
          const n = weekStart + k;
          if (days.has(ymd(n).dow) && monthOk(n)) list.push(n);
        }
        break;
      }
      case "MONTHLY": {
        const total = s.m - 1 + i * rule.interval;
        const y = s.y + Math.floor(total / 12);
        const m = (total % 12) + 1;
        if (!rule.byMonth.length || rule.byMonth.includes(m)) list = monthCandidates(y, m, rule, s.d, clamp);
        break;
      }
      case "YEARLY": {
        const y = s.y + i * rule.interval;
        if (rule.byMonth.length) {
          for (const m of [...rule.byMonth].sort((a, b) => a - b)) list.push(...monthCandidates(y, m, rule, s.d, clamp));
        } else if (rule.byDay.length) {
          // 연 단위 BYDAY(서수 없음): 그해의 해당 요일 전부
          for (let m = 1; m <= 12; m++) list.push(...monthByDay(y, m, rule.byDay));
        } else {
          list = monthCandidates(y, s.m, rule, s.d, clamp);
        }
        break;
      }
    }
    for (const n of [...new Set(list)].sort((a, b) => a - b)) if (n > start) yield n;
  }
}

/** DTSTART부터 규칙이 끝날 때까지의 회차(EXDATE 포함). COUNT·UNTIL을 적용한다 */
function* occurrences(rule: RRule, dtstart: ISODate, opts: ExpandOptions): Generator<number> {
  const start = toDay(dtstart);
  const until = !rule.until
    ? null
    : opts.untilDateOnly
      ? untilLocal(rule.until.slice(0, 8), DEFAULT_TZ)
      : untilLocal(rule.until, opts.tz ?? DEFAULT_TZ);
  const untilDay = until ? toDay(until.date) : Infinity;
  const time = opts.time ? `${opts.time.slice(0, 5)}:00` : "00:00:00";
  const within = (n: number) => n < untilDay || (n === untilDay && time <= until!.time);
  const limit = opts.ignoreCount ? undefined : rule.count;

  let count = 0;
  if (!within(start)) return;
  yield start;
  count++;
  for (const n of candidates(rule, start, opts.monthEnd === "clamp")) {
    if (limit !== undefined && count >= limit) return;
    if (!within(n)) return;
    yield n;
    count++;
  }
}

const toRule = (rrule: string | RRule) => (typeof rrule === "string" ? parseRRule(rrule) : rrule);

/**
 * 반복 일정을 [from, to] 범위(양 끝 포함)의 회차 날짜로 펼친다.
 * exdates에 있는 날짜는 빠진다(COUNT에는 포함). 규칙이 잘못되면 RRuleError를 던진다.
 */
export function expandRRule(
  rrule: string | RRule,
  dtstart: ISODate,
  exdates: readonly ISODate[],
  from: ISODate,
  to: ISODate,
  opts: ExpandOptions = {},
): ISODate[] {
  const rule = toRule(rrule);
  const lo = toDay(from) - (opts.spanDays ?? 0);
  const hi = toDay(to);
  if (hi < lo) return [];
  const skip = new Set(exdates.map(toDay));
  const out: ISODate[] = [];
  for (const n of occurrences(rule, dtstart, opts)) {
    if (n > hi) break;
    if (n >= lo && !skip.has(n)) out.push(fromDay(n));
  }
  return out;
}

/** from(포함) 이후 첫 회차. 없으면 null. 오늘 다음 회차를 원하면 from에 내일 날짜를 넘긴다 */
export function nextOccurrence(
  rrule: string | RRule,
  dtstart: ISODate,
  from: ISODate,
  exdates: readonly ISODate[] = [],
  opts: ExpandOptions = {},
): ISODate | null {
  const rule = toRule(rrule);
  const lo = toDay(from);
  const skip = new Set(exdates.map(toDay));
  for (const n of occurrences(rule, dtstart, opts)) if (n >= lo && !skip.has(n)) return fromDay(n);
  return null;
}

/**
 * 할일 다음 회차. DB `todo_next_due(rrule, after)`와 같다: after를 기준일로 보고 after보다 뒤의 첫 회차.
 * 끝났거나 해석할 수 없으면 null.
 */
export function todoNextDue(rrule: string, after: ISODate): ISODate | null {
  try {
    return nextOccurrence(rrule, after, fromDay(toDay(after) + 1), [], TODO_RULE_OPTIONS);
  } catch (e) {
    if (e instanceof RRuleError) return null;
    throw e;
  }
}

/** date가 이 시리즈의 회차인지(EXDATE 제외) */
export function isOccurrence(
  rrule: string | RRule,
  dtstart: ISODate,
  date: ISODate,
  exdates: readonly ISODate[] = [],
  opts: ExpandOptions = {},
): boolean {
  return expandRRule(rrule, dtstart, exdates, date, date, opts).length > 0;
}

/**
 * "이후 모두" 수정용. splitDate 전날까지의 원본 규칙(before)과 splitDate부터 시작할 새 시리즈 규칙(after)을 만든다.
 * - before가 null이면 splitDate 이전 회차가 없으므로 원본 전체를 바꾸면 된다.
 * - after가 null이면 splitDate 이후 남은 회차가 없다.
 * - COUNT 규칙은 회차 수를 나눠 가진다(EXDATE로 뺀 회차도 센다).
 */
export function splitRRule(
  rrule: string | RRule,
  dtstart: ISODate,
  splitDate: ISODate,
  opts: SplitOptions = {},
): { before: string | null; after: string | null } {
  const rule = toRule(rrule);
  const split = toDay(splitDate);
  let k = 0;
  let remaining = false;
  for (const n of occurrences(rule, dtstart, { tz: opts.tz })) {
    if (n >= split) {
      remaining = true;
      break;
    }
    k++;
  }
  const before =
    k === 0
      ? null
      : rule.count !== undefined
        ? buildRRule({ ...rule, count: k, until: undefined })
        : buildRRule({ ...rule, until: untilValue(fromDay(split - 1), opts) });
  const after = !remaining
    ? null
    : rule.count !== undefined
      ? buildRRule({ ...rule, count: rule.count - k })
      : buildRRule(rule);
  return { before, after };
}

// ---------- 표시 ----------

const ORD_KO: Record<number, string> = { 1: "첫째", 2: "둘째", 3: "셋째", 4: "넷째", 5: "다섯째", [-1]: "마지막" };
const ordKo = (n: number) => ORD_KO[n] ?? (n > 0 ? `${n}번째` : `끝에서 ${-n}번째`);
const dayKo = (d: Weekday) => WEEKDAY_KO[dowIndex(d)];
const monthDayKo = (d: number) => (d === -1 ? "마지막 날" : d > 0 ? `${d}일` : `끝에서 ${-d}번째 날`);

const byDayKo = (byDay: ByDay[]) => {
  const sorted = [...byDay].sort((a, b) => ((dowIndex(a.day) + 6) % 7) - ((dowIndex(b.day) + 6) % 7));
  if (sorted.every((b) => b.ord === undefined)) {
    const names = sorted.map((b) => dayKo(b.day));
    if (names.length === 5 && !names.includes("토") && !names.includes("일")) return "평일";
    return names.length === 1 ? `${names[0]}요일` : names.join("·");
  }
  return sorted.map((b) => (b.ord === undefined ? `${dayKo(b.day)}요일` : `${ordKo(b.ord)} ${dayKo(b.day)}요일`)).join(", ");
};

/**
 * 화면용 한국어 설명. 예: "매주 화·목", "2주마다 월요일 · 10회", "매월 마지막 금요일 · 2026년 12월 31일까지".
 * dtstart를 주면 BYDAY·BYMONTHDAY가 없는 규칙의 요일·날짜를 채운다.
 */
export function describeRRule(rrule: string | RRule, dtstart?: ISODate, opts: { tz?: string } = {}): string {
  const rule = toRule(rrule);
  const s = dtstart ? ymd(toDay(dtstart)) : null;
  const every = (unit: string, word: string) => (rule.interval === 1 ? word : `${rule.interval}${unit}마다`);
  let text: string;

  switch (rule.freq) {
    case "DAILY":
      text = every("일", "매일");
      if (rule.byDay.length) text += ` ${byDayKo(rule.byDay)}`;
      break;
    case "WEEKLY": {
      const days = rule.byDay.length ? rule.byDay : s ? [{ day: WEEKDAY_CODES[s.dow] }] : [];
      text = every("주", "매주") + (days.length ? ` ${byDayKo(days)}` : "");
      break;
    }
    case "MONTHLY": {
      text = every("개월", "매월");
      if (rule.byMonthDay.length) text += ` ${rule.byMonthDay.map(monthDayKo).join(", ")}`;
      else if (rule.byDay.length) text += ` ${byDayKo(rule.byDay)}`;
      else if (s) text += ` ${s.d}일`;
      break;
    }
    case "YEARLY": {
      text = every("년", "매년");
      const months = rule.byMonth.length ? rule.byMonth : s ? [s.m] : [];
      const monthText = months.map((m) => `${m}월`).join(", ");
      if (rule.byMonthDay.length) text += ` ${monthText} ${rule.byMonthDay.map(monthDayKo).join(", ")}`;
      else if (rule.byDay.length) text += ` ${monthText ? `${monthText} ` : ""}${byDayKo(rule.byDay)}`;
      else if (s) text += ` ${monthText} ${s.d}일`;
      break;
    }
  }
  if (rule.byMonth.length && rule.freq !== "YEARLY") text += ` (${rule.byMonth.map((m) => `${m}월`).join(", ")})`;

  if (rule.count !== undefined) text += ` · ${rule.count}회`;
  else if (rule.until) {
    const { y, m, d } = ymd(toDay(untilLocal(rule.until, opts.tz ?? DEFAULT_TZ).date));
    text += ` · ${y}년 ${m}월 ${d}일까지`;
  }
  return text;
}

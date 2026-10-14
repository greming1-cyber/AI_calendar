// 캘린더 화면 계산: 보기별 범위, 주 시작 요일, 시간 축 배치
import { WEEKDAYS, addDays, isoDate, parts } from "@/lib/date";
import type { CalendarEvent, ISODate } from "@/lib/types";

export type CalendarViewMode = "month" | "week" | "day";

/** weekStart(0=일, 1=월)에 맞춘 그 주의 첫날 */
export const startOfWeek = (date: ISODate, weekStart: 0 | 1) => addDays(date, -((parts(date).dow - weekStart + 7) % 7));

export const weekdayLabels = (weekStart: 0 | 1) => [...WEEKDAYS.slice(weekStart), ...WEEKDAYS.slice(0, weekStart)];

/** 월 달력 칸. 앞뒤 달 날짜를 포함해 7의 배수로 채운다 */
export function monthCells(y: number, m: number, weekStart: 0 | 1) {
  const first = isoDate(y, m, 1);
  const start = startOfWeek(first, weekStart);
  const lead = (parts(first).dow - weekStart + 7) % 7;
  const total = Math.ceil((lead + parts(isoDate(y, m + 1, 0)).d) / 7) * 7;
  return Array.from({ length: total }, (_, i) => {
    const date = addDays(start, i);
    return { date, inMonth: parts(date).m === m };
  });
}

/** 보기의 조회 범위(양 끝 포함) */
export function viewRange(view: CalendarViewMode, anchor: ISODate, weekStart: 0 | 1) {
  if (view === "day") return { from: anchor, to: anchor };
  if (view === "week") {
    const from = startOfWeek(anchor, weekStart);
    return { from, to: addDays(from, 6) };
  }
  const { y, m } = parts(anchor);
  const cells = monthCells(y, m, weekStart);
  return { from: cells[0].date, to: cells[cells.length - 1].date };
}

/** 보기 이동: 월은 한 달, 주는 7일, 일은 하루 */
export function shiftAnchor(view: CalendarViewMode, anchor: ISODate, n: number) {
  if (view === "day") return addDays(anchor, n);
  if (view === "week") return addDays(anchor, 7 * n);
  const { y, m, d } = parts(anchor);
  const target = isoDate(y, m + n, 1);
  const { y: ny, m: nm } = parts(target);
  return isoDate(ny, nm, Math.min(d, parts(isoDate(ny, nm + 1, 0)).d));
}

export function viewTitle(view: CalendarViewMode, anchor: ISODate, weekStart: 0 | 1) {
  const { y, m, d } = parts(anchor);
  if (view === "month") return `${y}년 ${m}월`;
  if (view === "day") return `${y}년 ${m}월 ${d}일 ${WEEKDAYS[parts(anchor).dow]}요일`;
  const from = parts(startOfWeek(anchor, weekStart));
  const to = parts(addDays(startOfWeek(anchor, weekStart), 6));
  return from.m === to.m ? `${from.y}년 ${from.m}월 ${from.d}–${to.d}일` : `${from.y}년 ${from.m}월 ${from.d}일 – ${to.m}월 ${to.d}일`;
}

/** 그날에 걸친 일정(여러 날 일정 포함) */
export const eventsOn = (events: CalendarEvent[], date: ISODate) => events.filter((e) => e.date <= date && e.endDate >= date);

// ── 시간 축 ──────────────────────────────────────────────

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export const fromMinutes = (min: number) => {
  const v = Math.max(0, Math.min(24 * 60 - 1, min));
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
};

/** 시간 일정이 그날 차지하는 분 구간 [시작, 끝). 끝이 없으면 1시간으로 본다 */
export function dayInterval(e: CalendarEvent, date: ISODate): [number, number] {
  const start = e.date < date ? 0 : toMinutes(e.start);
  let end: number;
  if (e.endDate > date) end = 24 * 60;
  else if (e.end && (e.endDate > e.date || e.end > e.start)) end = toMinutes(e.end);
  else end = start + 60;
  return [start, Math.max(end, start + 15)];
}

/** 겹치는 일정을 나란히 놓을 열 번호와 열 수 */
export function layoutDay(events: CalendarEvent[], date: ISODate) {
  const items = events
    .map((e) => ({ e, range: dayInterval(e, date) }))
    .sort((a, b) => a.range[0] - b.range[0] || b.range[1] - a.range[1]);
  const out: { e: CalendarEvent; range: [number, number]; col: number; cols: number }[] = [];
  let group: typeof out = [];
  let groupEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...group.map((g) => g.col + 1));
    group.forEach((g) => out.push({ ...g, cols }));
    group = [];
  };
  for (const it of items) {
    if (it.range[0] >= groupEnd) {
      flush();
      groupEnd = -1;
    }
    const used = new Set(group.filter((g) => g.range[1] > it.range[0]).map((g) => g.col));
    let col = 0;
    while (used.has(col)) col++;
    group.push({ ...it, col, cols: 1 });
    groupEnd = Math.max(groupEnd, it.range[1]);
  }
  flush();
  return out;
}

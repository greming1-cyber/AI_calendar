import { WEEKDAYS, parts, shortLabel } from "./date";
import {
  RRuleError,
  WEEKDAY_CODES,
  buildRRule,
  describeRRule,
  parseRRule,
  todoNextDue,
  type Freq,
  type Weekday,
} from "./rrule";
import type { ISODate, Priority, Todo } from "./types";

export const PRIORITY: Record<Priority, { label: string; rank: number; bg: string; fg: string }> = {
  high: { label: "높음", rank: 0, bg: "oklch(0.45 0.12 28 / .6)", fg: "oklch(0.85 0.08 28)" },
  normal: { label: "보통", rank: 1, bg: "rgb(255 255 255 / .1)", fg: "var(--color-soft)" },
  low: { label: "낮음", rank: 2, bg: "rgb(255 255 255 / .05)", fg: "var(--color-subtle)" },
};

export const PRIORITIES = Object.keys(PRIORITY) as Priority[];

export const isOverdue = (t: Todo, today: ISODate) => !t.done && t.dueDate != null && t.dueDate < today;

export const dueLabel = (t: Todo, today: ISODate) =>
  t.dueDate == null
    ? "기한 없음"
    : t.dueDate === today
      ? `오늘${t.dueTime ? ` ${t.dueTime}` : ""}`
      : isOverdue(t, today)
        ? `${shortLabel(t.dueDate)} 지남`
        : shortLabel(t.dueDate);

// ── 정렬 (TODO-02) ───────────────────────────────────────

const dueKey = (t: Todo) => `${t.dueDate ?? "9999-99-99"} ${t.dueTime || "99:99"}`;

/** 우선순위 → 마감일 순(마감 없음은 뒤) */
export const byPriority = (a: Todo, b: Todo) =>
  PRIORITY[a.priority].rank - PRIORITY[b.priority].rank || dueKey(a).localeCompare(dueKey(b));

/** 마감일(시각 포함, 없음은 뒤) → 우선순위. 기본 정렬 */
export const byDue = (a: Todo, b: Todo) =>
  dueKey(a).localeCompare(dueKey(b)) || PRIORITY[a.priority].rank - PRIORITY[b.priority].rank;

export const byCreated = (a: Todo, b: Todo) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "");

/** 최근 완료순 */
export const byCompletedDesc = (a: Todo, b: Todo) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "");

export const TODO_SORTS = {
  due: { label: "마감일", compare: byDue },
  priority: { label: "우선순위", compare: byPriority },
  created: { label: "생성순", compare: byCreated },
} as const;

export type TodoSort = keyof typeof TODO_SORTS;

// ── 탭 ───────────────────────────────────────────────────

const dueBy = (t: Todo, today: ISODate) => t.dueDate != null && t.dueDate <= today;

export const TODO_TABS = {
  today: { label: "오늘", filter: (t: Todo, today: ISODate) => !t.done && dueBy(t, today) },
  upcoming: { label: "예정", filter: (t: Todo, today: ISODate) => !t.done && !dueBy(t, today) },
  all: { label: "전체", filter: (t: Todo) => !t.done },
  done: { label: "완료", filter: (t: Todo) => t.done },
} as const;

export type TodoTab = keyof typeof TODO_TABS;

export const projectProgress = (todos: Todo[], projects: string[]) =>
  projects.map((name) => {
    const list = todos.filter((t) => t.project === name);
    const done = list.filter((t) => t.done).length;
    return { name, done, total: list.length, percent: list.length ? Math.round((done / list.length) * 100) : 0 };
  });

/** 목록 두 번째 줄: 체크리스트 n/m · 반복 · 메모(없으면 프로젝트) */
export const todoMeta = (t: Todo) =>
  [
    t.subtaskCount ? `체크리스트 ${t.subtaskDone ?? 0}/${t.subtaskCount}` : "",
    t.rrule ? rruleLabel(t.rrule) : "",
    t.note.split("\n")[0] || t.project,
  ]
    .filter(Boolean)
    .join(" · ");

// ── 반복 규칙 (TODO-07) ──────────────────────────────────
// 계산·설명·직렬화는 rrule.ts(01)를 쓴다. 할일은 DB todo_next_due가 지원하는 규칙만 만든다:
// FREQ=DAILY|WEEKLY|MONTHLY|YEARLY, INTERVAL, BYDAY(서수 없음, WEEKLY), BYMONTHDAY(마감일 날짜 또는 -1, MONTHLY), UNTIL(날짜)

export const RULE_FREQS = { DAILY: "매일", WEEKLY: "매주", MONTHLY: "매월", YEARLY: "매년" } as const satisfies Record<Freq, string>;

/** 화면 요일 순서(월요일부터) */
export const RULE_DAYS: readonly Weekday[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
export const dayLabel = (d: Weekday) => WEEKDAYS[WEEKDAY_CODES.indexOf(d)];
export const ruleDayOf = (iso: ISODate): Weekday => WEEKDAY_CODES[parts(iso).dow];

/** TodoModal 반복 입력 */
export interface TodoRule {
  freq: Freq;
  interval: number;
  byDay: Weekday[]; // WEEKLY
  monthLast: boolean; // MONTHLY: true면 말일, false면 마감일의 날짜
  until: ISODate | null;
}

/** 저장된 rrule → 입력값. 해석할 수 없으면 null */
export function readTodoRule(rrule: string | null): TodoRule | null {
  if (!rrule) return null;
  try {
    const r = parseRRule(rrule);
    return {
      freq: r.freq,
      interval: r.interval,
      byDay: r.byDay.map((b) => b.day),
      monthLast: r.byMonthDay[0] === -1,
      until: r.until ? `${r.until.slice(0, 4)}-${r.until.slice(4, 6)}-${r.until.slice(6, 8)}` : null,
    };
  } catch (e) {
    if (e instanceof RRuleError) return null;
    throw e;
  }
}

/** 입력값 → rrule. base는 마감일(월 반복의 날짜, 주 반복의 기본 요일) */
export const buildTodoRule = (rule: TodoRule, base: ISODate) =>
  buildRRule({
    freq: rule.freq,
    interval: rule.interval,
    byDay:
      rule.freq === "WEEKLY"
        ? RULE_DAYS.filter((d) => (rule.byDay.length ? rule.byDay : [ruleDayOf(base)]).includes(d)).map((day) => ({ day }))
        : [],
    byMonthDay: rule.freq === "MONTHLY" ? [rule.monthLast ? -1 : parts(base).d] : [],
    until: rule.until ? rule.until.replaceAll("-", "") : undefined,
  });

/** "매주 수요일", "2주마다 월·금", "매월 마지막 날 · 2026년 12월 31일까지". 해석할 수 없으면 "반복" */
export function rruleLabel(rrule: string, dtstart?: ISODate) {
  try {
    return describeRRule(rrule, dtstart);
  } catch (e) {
    if (e instanceof RRuleError) return "반복";
    throw e;
  }
}

/** after 다음 회차(완료하면 생길 날짜). DB todo_next_due와 같다 */
export const nextDue = (rrule: string | null, after: ISODate) => (rrule ? todoNextDue(rrule, after) : null);


import { addDays, isoDate, parts, shortLabel } from "./date";
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
// TODO(02): rrule.ts로 교체. 01이 main에 병합되면 todoNextDue·describeRRule·buildRRule을 쓴다.
// 지금은 DB 함수 todo_next_due(20261014150000_todos_complete_todo.sql)와 같은 규칙으로 계산한다.
// 지원: FREQ=DAILY|WEEKLY|MONTHLY|YEARLY, INTERVAL, BYDAY(서수 없음), BYMONTHDAY(양수 1개 또는 -1), UNTIL

export const RULE_FREQS = { DAILY: "매일", WEEKLY: "매주", MONTHLY: "매월", YEARLY: "매년" } as const;
export type RuleFreq = keyof typeof RULE_FREQS;

/** 월요일부터. ISO 요일 번호(월=1 … 일=7)는 index + 1 */
export const RULE_DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export type RuleDay = (typeof RULE_DAYS)[number];
const DAY_LABEL: Record<RuleDay, string> = { MO: "월", TU: "화", WE: "수", TH: "목", FR: "금", SA: "토", SU: "일" };
export const dayLabel = (d: RuleDay) => DAY_LABEL[d];

export interface TodoRule {
  freq: RuleFreq;
  interval: number;
  byDay: RuleDay[]; // WEEKLY
  monthDay: number | null; // MONTHLY. -1이면 말일, null이면 마감일의 날짜
  until: ISODate | null;
}

/** ISO 요일(월=0 … 일=6) */
export const ruleDayOf = (iso: ISODate): RuleDay => RULE_DAYS[(parts(iso).dow + 6) % 7];

export function parseRule(rrule: string | null): TodoRule | null {
  if (!rrule) return null;
  const get = (k: string) => rrule.toUpperCase().match(new RegExp(`(?:^|;)${k}=([^;]+)`))?.[1];
  const freq = get("FREQ") as RuleFreq | undefined;
  if (!freq || !(freq in RULE_FREQS)) return null;
  const until = get("UNTIL");
  const monthDay = get("BYMONTHDAY");
  return {
    freq,
    interval: Math.max(Number(get("INTERVAL") ?? 1) || 1, 1),
    byDay: (get("BYDAY")?.split(",") ?? []).map((d) => d.slice(-2) as RuleDay).filter((d) => RULE_DAYS.includes(d)),
    monthDay: monthDay ? Number(monthDay.split(",")[0]) : null,
    until: until ? `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}` : null,
  };
}

export function buildRule(rule: TodoRule): string {
  const out = [`FREQ=${rule.freq}`];
  if (rule.interval > 1) out.push(`INTERVAL=${rule.interval}`);
  if (rule.freq === "WEEKLY" && rule.byDay.length) {
    out.push(`BYDAY=${RULE_DAYS.filter((d) => rule.byDay.includes(d)).join(",")}`);
  }
  if (rule.freq === "MONTHLY" && rule.monthDay != null) out.push(`BYMONTHDAY=${rule.monthDay}`);
  if (rule.until) out.push(`UNTIL=${rule.until.replaceAll("-", "")}`);
  return out.join(";");
}

/** "매주 수", "2주마다 월·금", "매월 말일", "매월 12일 · 12/31까지" */
export function rruleLabel(rrule: string) {
  const r = parseRule(rrule);
  if (!r) return "반복";
  const unit = { DAILY: "일", WEEKLY: "주", MONTHLY: "개월", YEARLY: "년" }[r.freq];
  let s = r.interval > 1 ? `${r.interval}${unit}마다` : RULE_FREQS[r.freq];
  if (r.freq === "WEEKLY" && r.byDay.length) s += ` ${RULE_DAYS.filter((d) => r.byDay.includes(d)).map(dayLabel).join("·")}`;
  if (r.freq === "MONTHLY" && r.monthDay != null) s += r.monthDay < 0 ? " 말일" : ` ${r.monthDay}일`;
  if (r.until) s += ` · ${shortLabel(r.until)}까지`;
  return s;
}

const dayNumber = (iso: ISODate) => Date.UTC(parts(iso).y, parts(iso).m - 1, parts(iso).d) / 86_400_000;
const mondayOf = (iso: ISODate) => addDays(iso, -((parts(iso).dow + 6) % 7));

/** after 다음 회차 날짜. 끝났거나 해석할 수 없으면 null. DB todo_next_due와 같은 결과 */
export function nextDue(rrule: string | null, after: ISODate): ISODate | null {
  const r = parseRule(rrule);
  if (!r) return null;
  let next: ISODate | null = null;

  if (r.freq === "DAILY") next = addDays(after, r.interval);
  else if (r.freq === "WEEKLY") {
    if (!r.byDay.length) next = addDays(after, 7 * r.interval);
    else {
      const base = dayNumber(mondayOf(after));
      for (let k = 1; k <= 7 * r.interval + 7 && !next; k++) {
        const d = addDays(after, k);
        const weeks = (dayNumber(mondayOf(d)) - base) / 7;
        if (r.byDay.includes(ruleDayOf(d)) && weeks % r.interval === 0) next = d;
      }
    }
  } else {
    const { y, m, d } = parts(after);
    const day = r.monthDay ?? d;
    const step = r.interval * (r.freq === "YEARLY" ? 12 : 1);
    for (let k = 0; k <= 2 && !next; k++) {
      const last = parts(isoDate(y, m + k * step + 1, 0)).d;
      const cand = isoDate(y, m + k * step, day < 0 || day > last ? last : day);
      if (cand > after) next = cand;
    }
  }

  return next && r.until && next > r.until ? null : next;
}

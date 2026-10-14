import { shortLabel } from "./date";
import type { ISODate, Priority, Todo } from "./types";

export const PRIORITY: Record<Priority, { label: string; rank: number; bg: string; fg: string }> = {
  high: { label: "높음", rank: 0, bg: "oklch(0.45 0.12 28 / .6)", fg: "oklch(0.85 0.08 28)" },
  normal: { label: "보통", rank: 1, bg: "rgb(255 255 255 / .1)", fg: "var(--color-soft)" },
  low: { label: "낮음", rank: 2, bg: "rgb(255 255 255 / .05)", fg: "var(--color-subtle)" },
};

export const isOverdue = (t: Todo, today: ISODate) => !t.done && t.dueDate != null && t.dueDate < today;

export const dueLabel = (t: Todo, today: ISODate) =>
  t.dueDate == null
    ? "기한 없음"
    : t.dueDate === today
      ? "오늘"
      : isOverdue(t, today)
        ? `${shortLabel(t.dueDate)} 지남`
        : shortLabel(t.dueDate);

/** TODO-02: 우선순위 → 마감일 순(마감 없음은 뒤) */
export const byPriority = (a: Todo, b: Todo) =>
  PRIORITY[a.priority].rank - PRIORITY[b.priority].rank || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");

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

const BYDAY: Record<string, string> = { SU: "일", MO: "월", TU: "화", WE: "수", TH: "목", FR: "금", SA: "토" };

/** RRULE → "매주 수", "매월 12일" 같은 요약. TODO(02): 반복 규칙 편집(TODO-07)에 맞춰 확장 */
export const rruleLabel = (rrule: string) => {
  const get = (k: string) => rrule.match(new RegExp(`${k}=([^;]+)`))?.[1];
  const freq = get("FREQ");
  const days = get("BYDAY")?.split(",").map((d) => BYDAY[d] ?? d).join("·");
  if (freq === "DAILY") return "매일";
  if (freq === "WEEKLY") return days ? `매주 ${days}` : "매주";
  if (freq === "MONTHLY") return get("BYMONTHDAY") ? `매월 ${get("BYMONTHDAY")}일` : "매월";
  if (freq === "YEARLY") return "매년";
  return "반복";
};

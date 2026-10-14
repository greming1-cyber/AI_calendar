import { shortLabel } from "./date";
import type { ISODate, Priority, Todo } from "./types";

export const PRIORITY: Record<Priority, { label: string; rank: number; bg: string; fg: string }> = {
  high: { label: "높음", rank: 0, bg: "oklch(0.45 0.12 28 / .6)", fg: "oklch(0.85 0.08 28)" },
  normal: { label: "보통", rank: 1, bg: "rgb(255 255 255 / .1)", fg: "var(--color-soft)" },
  low: { label: "낮음", rank: 2, bg: "rgb(255 255 255 / .05)", fg: "var(--color-subtle)" },
};

export const isOverdue = (t: Todo, today: ISODate) => !t.done && t.dueDate < today;

export const dueLabel = (t: Todo, today: ISODate) =>
  t.dueDate === today ? "오늘" : isOverdue(t, today) ? `${shortLabel(t.dueDate)} 지남` : shortLabel(t.dueDate);

/** TODO-02: 우선순위 → 마감일 순 */
export const byPriority = (a: Todo, b: Todo) =>
  PRIORITY[a.priority].rank - PRIORITY[b.priority].rank || a.dueDate.localeCompare(b.dueDate);

export const TODO_TABS = {
  today: { label: "오늘", filter: (t: Todo, today: ISODate) => !t.done && t.dueDate <= today },
  upcoming: { label: "예정", filter: (t: Todo, today: ISODate) => !t.done && t.dueDate > today },
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

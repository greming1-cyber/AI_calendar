"use client";

import { useState } from "react";
import { CardHead, ErrorState, LoadingState, ProgressBar, useToast } from "@/components/ui";
import { shortLabel } from "@/lib/date";
import { useToday } from "@/lib/hooks/use-today";
import { useProjects, useTodos, useToggleTodo } from "@/lib/hooks/use-todos";
import { PRIORITY, TODO_TABS, byPriority, dueLabel, isOverdue, projectProgress, rruleLabel, type TodoTab } from "@/lib/todo";

export function TodoView() {
  const today = useToday();
  const toast = useToast();
  const todosQuery = useTodos();
  const { data: projectList } = useProjects();
  const toggle = useToggleTodo();
  const [tab, setTab] = useState<TodoTab>("today");

  if (todosQuery.isPending) return <LoadingState />;
  if (todosQuery.isError) return <ErrorState retry={() => todosQuery.refetch()} />;
  const todos = todosQuery.data;

  const list = todos.filter((t) => TODO_TABS[tab].filter(t, today)).sort(byPriority);
  const projects = projectProgress(todos, projectList?.map((p) => p.name) ?? []);
  const recurring = todos.filter((t) => t.rrule && !t.done);

  const toggleTodo = (id: string, done: boolean) =>
    toggle.mutate({ id, done }, { onError: () => toast.error("완료 상태를 바꾸지 못했어요.") });

  return (
    <main className="flex flex-wrap items-start gap-4 px-4 pb-7 md:px-7">
      <section className="card card-flat min-w-0 flex-[1_1_560px] gap-3.5 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-2xl font-bold">할일</span>
          <div className="seg sm:ml-3">
            {(Object.keys(TODO_TABS) as TodoTab[]).map((id) => (
              <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)} className="seg-item">
                {TODO_TABS[id].label} {todos.filter((t) => TODO_TABS[id].filter(t, today)).length}
              </button>
            ))}
          </div>
          <span className="ml-auto text-xs text-muted">정렬 · 우선순위 ▾</span>
          <span className="pill pill-accent">+ 할일</span>
        </div>

        <div className="flex flex-col">
          {list.map((t) => {
            const over = isOverdue(t, today);
            const pri = PRIORITY[t.priority];
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleTodo(t.id, !t.done)}
                aria-pressed={t.done}
                className="grid grid-cols-[22px_minmax(0,1fr)_52px_70px] items-center gap-3.5 border-b border-line px-2 py-3.5 text-left hover:bg-white/[.03] sm:grid-cols-[22px_minmax(0,1fr)_60px_60px_70px]"
              >
                <span
                  className="flex size-5 items-center justify-center rounded-md border-[1.5px] text-xs text-ink"
                  style={{
                    borderColor: t.done ? "var(--color-accent)" : over ? "var(--color-danger)" : "rgb(255 255 255 / .35)",
                    background: t.done ? "var(--color-accent)" : "transparent",
                  }}
                >
                  {t.done ? "✓" : ""}
                </span>
                <div className="flex min-w-0 flex-col gap-[3px]">
                  <span
                    className={`truncate text-[15px] ${t.done ? "line-through" : ""}`}
                    style={{ color: t.done ? "var(--color-subtle)" : over ? "var(--color-danger)" : "var(--color-fg)" }}
                  >
                    {t.title}
                  </span>
                  <span className="truncate text-[11px] text-subtle">{t.note || t.project}</span>
                </div>
                <span className="rounded-full py-[3px] text-center text-[11px]" style={{ background: pri.bg, color: pri.fg }}>
                  {pri.label}
                </span>
                <span className="hidden text-xs text-muted sm:inline">{t.project}</span>
                <span className="text-right text-xs" style={{ color: over ? "var(--color-danger)" : "var(--color-muted)" }}>
                  {dueLabel(t, today)}
                </span>
              </button>
            );
          })}
          {!list.length && <span className="px-2 py-8 text-sm text-subtle">이 탭에 할일이 없어요.</span>}
        </div>
      </section>

      <div className="flex max-w-[420px] min-w-0 flex-[1_1_280px] flex-col gap-3">
        {/* TODO-05 */}
        <section className="card card-warm gap-3.5 p-5">
          <CardHead title="프로젝트" meta={<span className="text-xs">+ 추가</span>} />
          {projects.map((p) => (
            <div key={p.name} className="flex flex-col gap-1.5">
              <div className="flex justify-between text-[13px]">
                <span>{p.name}</span>
                <span className="text-muted">
                  {p.done}/{p.total}
                </span>
              </div>
              <ProgressBar percent={p.percent} />
            </div>
          ))}
        </section>

        {/* TODO-07 */}
        <section className="card card-flat gap-2.5 p-5">
          <span className="text-[15px] font-semibold">반복 할일</span>
          {!recurring.length && <span className="text-[13px] text-subtle">반복 할일이 없어요.</span>}
          {recurring.map((r) => (
            <div key={r.id} className="flex flex-col gap-0.5 border-b border-line py-1.5">
              <span className="text-[13px]">{r.title}</span>
              <span className="text-[11px] text-subtle">
                {rruleLabel(r.rrule ?? "")}
                {r.dueDate ? ` · 다음 ${shortLabel(r.dueDate)}` : ""}
              </span>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}

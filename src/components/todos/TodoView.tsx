"use client";

import { useState } from "react";
import { CardHead, ProgressBar } from "@/components/ui";
import { shortLabel } from "@/lib/date";
import { PROJECTS, RECURRING_TODOS, TODAY } from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import { PRIORITY, TODO_TABS, byPriority, dueLabel, isOverdue, projectProgress, type TodoTab } from "@/lib/todo";

export function TodoView() {
  const { todos, toggleTodo } = useStore();
  const [tab, setTab] = useState<TodoTab>("today");
  const list = todos.filter((t) => TODO_TABS[tab].filter(t, TODAY)).sort(byPriority);
  const projects = projectProgress(todos, PROJECTS);

  return (
    <main className="flex flex-wrap items-start gap-4 px-4 pb-7 md:px-7">
      <section className="card card-flat min-w-0 flex-[1_1_560px] gap-3.5 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-2xl font-bold">할일</span>
          <div className="seg sm:ml-3">
            {(Object.keys(TODO_TABS) as TodoTab[]).map((id) => (
              <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)} className="seg-item">
                {TODO_TABS[id].label} {todos.filter((t) => TODO_TABS[id].filter(t, TODAY)).length}
              </button>
            ))}
          </div>
          <span className="ml-auto text-xs text-muted">정렬 · 우선순위 ▾</span>
          <span className="pill pill-accent">+ 할일</span>
        </div>

        <div className="flex flex-col">
          {list.map((t) => {
            const over = isOverdue(t, TODAY);
            const pri = PRIORITY[t.priority];
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleTodo(t.id)}
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
                  {dueLabel(t, TODAY)}
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
          {RECURRING_TODOS.map((r) => (
            <div key={r.title} className="flex flex-col gap-0.5 border-b border-line py-1.5">
              <span className="text-[13px]">{r.title}</span>
              <span className="text-[11px] text-subtle">
                {r.rule} · 다음 {shortLabel(r.next)}
              </span>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}

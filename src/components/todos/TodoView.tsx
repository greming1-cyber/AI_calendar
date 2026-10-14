"use client";

import { useState } from "react";
import { ErrorState, LoadingState, useToast } from "@/components/ui";
import { shortLabel, zonedParts } from "@/lib/date";
import { useTimezone } from "@/lib/hooks/use-profile";
import { useToday } from "@/lib/hooks/use-today";
import { useProjects, useTodos, useToggleTodo } from "@/lib/hooks/use-todos";
import {
  PRIORITY,
  TODO_SORTS,
  TODO_TABS,
  byCompletedDesc,
  dueLabel,
  isOverdue,
  nextDue,
  rruleLabel,
  todoMeta,
  type TodoSort,
  type TodoTab,
} from "@/lib/todo";
import type { Todo, TodoInput } from "@/lib/types";
import { ProjectPanel } from "./ProjectPanel";
import { TodoModal } from "./TodoModal";

const EMPTY: Record<TodoTab, string> = {
  today: "오늘까지 할 일이 없어요.",
  upcoming: "예정된 할일이 없어요.",
  all: "남은 할일이 없어요.",
  done: "완료한 할일이 없어요.",
};

type ModalState = { todo?: Todo; initial?: Partial<TodoInput> } | null;

export function TodoView() {
  const today = useToday();
  const tz = useTimezone();
  const toast = useToast();
  const todosQuery = useTodos();
  const { data: projectList = [] } = useProjects();
  const toggle = useToggleTodo();
  const [tab, setTab] = useState<TodoTab>("today");
  const [sort, setSort] = useState<TodoSort>("due");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);

  if (todosQuery.isPending) return <LoadingState />;
  if (todosQuery.isError) return <ErrorState retry={() => todosQuery.refetch()} />;
  const todos = todosQuery.data;

  const scoped = projectId ? todos.filter((t) => t.projectId === projectId) : todos;
  const list = scoped
    .filter((t) => TODO_TABS[tab].filter(t, today))
    .sort(tab === "done" ? byCompletedDesc : TODO_SORTS[sort].compare);
  const recurring = todos.filter((t) => t.rrule && !t.done).sort(TODO_SORTS.due.compare);
  const selectedProject = projectList.find((p) => p.id === projectId);

  // mutate의 호출별 콜백은 마지막 호출만 받으므로, 여러 개를 빠르게 체크해도 알림이 남도록 promise로 받는다.
  const toggleTodo = (t: Todo) =>
    toggle
      .mutateAsync({ id: t.id, done: !t.done })
      .then(({ next }) => next?.dueDate && toast.success(`다음 회차를 ${shortLabel(next.dueDate)}에 만들었어요.`))
      .catch(() => toast.error("완료 상태를 바꾸지 못했어요."));

  const openNew = () =>
    setModal({ initial: { dueDate: tab === "upcoming" || tab === "all" ? null : today, projectId } });

  return (
    <main className="flex flex-wrap items-start gap-4 px-4 pb-7 md:px-7">
      <section className="card card-flat min-w-0 flex-[1_1_560px] gap-3.5 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-2xl font-bold">할일</span>
          <div className="seg overflow-x-auto sm:ml-3">
            {(Object.keys(TODO_TABS) as TodoTab[]).map((id) => (
              <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)} className="seg-item">
                {TODO_TABS[id].label} {scoped.filter((t) => TODO_TABS[id].filter(t, today)).length}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {/* 모바일: 프로젝트 필터 드롭다운 */}
            <select
              aria-label="프로젝트 필터"
              value={projectId ?? ""}
              onChange={(e) => setProjectId(e.target.value || null)}
              className="field w-auto py-1.5 text-xs md:hidden"
            >
              <option value="">모든 프로젝트</option>
              {projectList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {tab !== "done" && (
              <label className="flex items-center gap-1.5 text-xs text-muted">
                정렬
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as TodoSort)}
                  className="field w-auto py-1.5 text-xs"
                >
                  {(Object.keys(TODO_SORTS) as TodoSort[]).map((s) => (
                    <option key={s} value={s}>
                      {TODO_SORTS[s].label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button type="button" onClick={openNew} className="pill pill-accent">
              + 할일
            </button>
          </div>
        </div>

        {selectedProject && (
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="pill px-3 py-1">{selectedProject.name}</span>
            <button type="button" onClick={() => setProjectId(null)} className="hover:text-fg">
              필터 해제 ✕
            </button>
          </div>
        )}

        <div className="flex flex-col">
          {list.map((t) => (
            <TodoRow
              key={t.id}
              todo={t}
              today={today}
              doneTab={tab === "done"}
              completedOn={t.completedAt ? zonedParts(t.completedAt, tz).date : null}
              onToggle={() => toggleTodo(t)}
              onOpen={() => setModal({ todo: t })}
            />
          ))}
          {!list.length && (
            <div className="flex flex-col items-start gap-3 px-2 py-8 text-sm text-subtle">
              {EMPTY[tab]}
              {tab !== "done" && (
                <button type="button" onClick={openNew} className="pill">
                  + 할일 등록
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      <div className="flex max-w-[420px] min-w-0 flex-[1_1_280px] flex-col gap-3">
        <ProjectPanel todos={todos} projects={projectList} selected={projectId} onSelect={setProjectId} />

        {/* TODO-07 */}
        <section className="card card-flat gap-2.5 p-5">
          <span className="text-[15px] font-semibold">반복 할일</span>
          {!recurring.length && <span className="text-[13px] text-subtle">반복 할일이 없어요. 할일을 등록할 때 반복을 고르세요.</span>}
          {recurring.map((r) => {
            const after = r.dueDate ? nextDue(r.rrule, r.dueDate) : null;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setModal({ todo: r })}
                className="flex flex-col gap-0.5 border-b border-line py-1.5 text-left hover:bg-white/[.03]"
              >
                <span className="text-[13px]">{r.title}</span>
                <span className="text-[11px] text-subtle">
                  {rruleLabel(r.rrule!)}
                  {r.dueDate && ` · 이번 ${shortLabel(r.dueDate)}`}
                  {after && ` · 다음 ${shortLabel(after)}`}
                </span>
              </button>
            );
          })}
        </section>
      </div>

      <TodoModal open={modal !== null} onClose={() => setModal(null)} todo={modal?.todo} initial={modal?.initial} />
    </main>
  );
}

function TodoRow({
  todo: t,
  today,
  doneTab,
  completedOn,
  onToggle,
  onOpen,
}: {
  todo: Todo;
  today: string;
  doneTab: boolean;
  completedOn: string | null;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const over = isOverdue(t, today);
  const pri = PRIORITY[t.priority];
  return (
    <div className="flex items-center gap-1.5 border-b border-line hover:bg-white/[.03]">
      {/* 완료 체크는 체크박스 영역만 반응한다(TODO-03). */}
      <button
        type="button"
        role="checkbox"
        aria-checked={t.done}
        aria-label={`${t.title} ${t.done ? "완료 취소" : "완료"}`}
        onClick={onToggle}
        className="flex size-11 flex-none items-center justify-center"
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
      </button>
      <button
        type="button"
        onClick={onOpen}
        className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_52px_70px] items-center gap-3.5 py-3.5 pr-2 text-left sm:grid-cols-[minmax(0,1fr)_60px_60px_70px]"
      >
        <span className="flex min-w-0 flex-col gap-[3px]">
          <span
            className={`truncate text-[15px] ${t.done ? "line-through" : ""}`}
            style={{ color: t.done ? "var(--color-subtle)" : over ? "var(--color-danger)" : "var(--color-fg)" }}
          >
            {t.title}
          </span>
          <span className="truncate text-[11px] text-subtle">{todoMeta(t) || " "}</span>
        </span>
        <span className="rounded-full py-[3px] text-center text-[11px]" style={{ background: pri.bg, color: pri.fg }}>
          {pri.label}
        </span>
        <span className="hidden truncate text-xs text-muted sm:inline">{t.project}</span>
        <span className="text-right text-xs" style={{ color: over ? "var(--color-danger)" : "var(--color-muted)" }}>
          {doneTab ? (completedOn ? `${shortLabel(completedOn)} 완료` : "완료") : dueLabel(t, today)}
        </span>
      </button>
      {doneTab && (
        <button type="button" onClick={onToggle} className="pill mr-1 px-2.5 py-1 text-[11px]">
          완료 취소
        </button>
      )}
    </div>
  );
}

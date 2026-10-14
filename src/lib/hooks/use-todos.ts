"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  completeTodo,
  createProject,
  createTodo,
  deleteProject,
  deleteTodo,
  listProjects,
  listTodos,
  renameTodo,
  updateProject,
  updateTodo,
} from "@/lib/data/todos";
import type { Project, Todo, TodoFilter, TodoInput } from "@/lib/types";
import { useTimezone } from "./use-profile";

export const todoKeys = {
  all: ["todos"] as const,
  list: (filter: TodoFilter = {}) => ["todos", filter] as const,
  projects: ["projects"] as const,
};

/** 기본값: 상위 할일 전체(완료 포함). 필터는 TodoFilter 참고 */
export function useTodos(filter?: TodoFilter) {
  const tz = useTimezone();
  return useQuery({ queryKey: todoKeys.list(filter), queryFn: () => listTodos(filter, tz) });
}

export function useProjects() {
  return useQuery({ queryKey: todoKeys.projects, queryFn: listProjects, staleTime: 5 * 60_000 });
}

// ── 낙관적 업데이트 공통 ─────────────────────────────────
// 캐시된 모든 할일 목록에 patch를 적용하고, 실패하면 이전 값으로 되돌린다. 끝나면 다시 읽는다.

type Snapshot = [readonly unknown[], Todo[] | undefined][];

async function patchTodos(qc: QueryClient, patch: (list: Todo[]) => Todo[]): Promise<{ prev: Snapshot }> {
  await qc.cancelQueries({ queryKey: todoKeys.all });
  const prev = qc.getQueriesData<Todo[]>({ queryKey: todoKeys.all });
  qc.setQueriesData<Todo[]>({ queryKey: todoKeys.all }, (list) => list && patch(list));
  return { prev };
}

const rollback = (qc: QueryClient) => (_e: unknown, _v: unknown, ctx?: { prev: Snapshot }) =>
  ctx?.prev.forEach(([key, data]) => qc.setQueryData(key, data));

const findTodo = (qc: QueryClient, id: string) =>
  qc
    .getQueriesData<Todo[]>({ queryKey: todoKeys.all })
    .flatMap(([, list]) => list ?? [])
    .find((t) => t.id === id);

/**
 * 완료 토글(complete_todo). 체크 즉시 화면에 반영하고(낙관적 업데이트) 실패하면 되돌린다.
 * 반복 할일이면 결과의 next에 새 회차가 들어 있다.
 */
export function useToggleTodo() {
  const qc = useQueryClient();
  const tz = useTimezone();
  return useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => completeTodo(id, done, tz),
    onMutate: ({ id, done }) => {
      const parentId = findTodo(qc, id)?.parentId;
      return patchTodos(qc, (list) =>
        list.map((t) =>
          t.id === id
            ? { ...t, done, completedAt: done ? new Date().toISOString() : null }
            : t.id === parentId && t.subtaskDone != null
              ? { ...t, subtaskDone: t.subtaskDone + (done ? 1 : -1) }
              : t,
        ),
      );
    },
    onError: rollback(qc),
    onSettled: () => qc.invalidateQueries({ queryKey: todoKeys.all }),
  });
}

/** 등록(id 없음)·수정. 등록할 때 subtasks 제목을 함께 만든다. */
export function useSaveTodo() {
  const qc = useQueryClient();
  const tz = useTimezone();
  return useMutation({
    mutationFn: ({ id, input, subtasks }: { id: string | null; input: TodoInput; subtasks?: string[] }) =>
      id ? updateTodo(id, input, tz).then(() => id) : createTodo(input, subtasks, tz),
    onMutate: ({ id, input }) => {
      if (!id) return { prev: [] as Snapshot }; // 등록은 저장 후 다시 읽는다.
      const project = qc.getQueryData<Project[]>(todoKeys.projects)?.find((p) => p.id === input.projectId)?.name ?? "";
      return patchTodos(qc, (list) =>
        list.map((t) =>
          t.id === id
            ? {
                ...t,
                title: input.title.trim(),
                dueDate: input.dueDate,
                dueTime: input.dueTime,
                priority: input.priority,
                projectId: input.projectId,
                project,
                note: input.note,
                rrule: input.rrule,
                eventId: input.eventId,
              }
            : t,
        ),
      );
    },
    onError: rollback(qc),
    onSettled: () => qc.invalidateQueries({ queryKey: todoKeys.all }),
  });
}

export function useRenameTodo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => renameTodo(id, title),
    onMutate: ({ id, title }) => patchTodos(qc, (list) => list.map((t) => (t.id === id ? { ...t, title } : t))),
    onError: rollback(qc),
    onSettled: () => qc.invalidateQueries({ queryKey: todoKeys.all }),
  });
}

export function useDeleteTodo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteTodo,
    onMutate: (id: string) => {
      const target = findTodo(qc, id);
      return patchTodos(qc, (list) =>
        list
          .filter((t) => t.id !== id && t.parentId !== id)
          .map((t) =>
            target && t.id === target.parentId && t.subtaskCount != null
              ? { ...t, subtaskCount: t.subtaskCount - 1, subtaskDone: (t.subtaskDone ?? 0) - (target.done ? 1 : 0) }
              : t,
          ),
      );
    },
    onError: rollback(qc),
    onSettled: () => qc.invalidateQueries({ queryKey: todoKeys.all }),
  });
}

/** 서브태스크 추가 */
export function useAddSubtask() {
  const qc = useQueryClient();
  const tz = useTimezone();
  return useMutation({
    mutationFn: ({ parent, title }: { parent: Todo; title: string }) =>
      createTodo(
        { title, dueDate: null, dueTime: "", priority: "normal", projectId: parent.projectId, note: "", rrule: null, eventId: null, parentId: parent.id },
        [],
        tz,
      ),
    onSettled: () => qc.invalidateQueries({ queryKey: todoKeys.all }),
  });
}

// ── 프로젝트 ─────────────────────────────────────────────

const invalidateAll = (qc: QueryClient) =>
  Promise.all([qc.invalidateQueries({ queryKey: todoKeys.projects }), qc.invalidateQueries({ queryKey: todoKeys.all })]);

/** 등록(id 없음)·이름 수정 */
export function useSaveProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string | null; name: string }) =>
      id ? updateProject(id, { name }) : createProject(name).then(() => undefined),
    onSettled: () => invalidateAll(qc),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, moveTo }: { id: string; moveTo: string | null }) => deleteProject(id, moveTo),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: todoKeys.projects });
      const prev = qc.getQueryData<Project[]>(todoKeys.projects);
      qc.setQueryData<Project[]>(todoKeys.projects, (list) => list?.filter((p) => p.id !== id));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(todoKeys.projects, ctx.prev),
    onSettled: () => invalidateAll(qc),
  });
}

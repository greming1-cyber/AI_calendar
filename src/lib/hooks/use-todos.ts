"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listProjects, listTodos, setTodoDone } from "@/lib/data/todos";
import type { Todo, TodoFilter } from "@/lib/types";

export const todoKeys = {
  all: ["todos"] as const,
  list: (filter: TodoFilter = {}) => ["todos", filter] as const,
  projects: ["projects"] as const,
};

/** 기본값: 상위 할일 전체(완료 포함). 필터는 TodoFilter 참고 */
export function useTodos(filter?: TodoFilter) {
  return useQuery({ queryKey: todoKeys.list(filter), queryFn: () => listTodos(filter) });
}

export function useProjects() {
  return useQuery({ queryKey: todoKeys.projects, queryFn: listProjects, staleTime: 5 * 60_000 });
}

/** 완료 토글. 체크 즉시 화면에 반영하고(낙관적 업데이트) 실패하면 되돌린다. */
export function useToggleTodo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => setTodoDone(id, done),
    onMutate: async ({ id, done }) => {
      await qc.cancelQueries({ queryKey: todoKeys.all });
      const prev = qc.getQueriesData<Todo[]>({ queryKey: todoKeys.all });
      qc.setQueriesData<Todo[]>({ queryKey: todoKeys.all }, (list) => list?.map((t) => (t.id === id ? { ...t, done } : t)));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev.forEach(([key, data]) => qc.setQueryData(key, data)),
    onSettled: () => qc.invalidateQueries({ queryKey: todoKeys.all }),
  });
}

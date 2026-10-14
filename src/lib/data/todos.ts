// 할일 데이터 계층. 조회 함수 시그니처는 공유 계약이므로 바꾸지 않는다.
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";
import type { Priority, Project, Todo, TodoFilter } from "@/lib/types";

type TodoRow = Tables<"todos"> & { projects: { name: string } | null };

// ── 변환 ─────────────────────────────────────────────────

const PRIORITY_FROM_DB: Record<number, Priority> = { 1: "high", 2: "normal", 3: "low" };
export const PRIORITY_TO_DB: Record<Priority, number> = { high: 1, normal: 2, low: 3 };

export function toTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    dueDate: row.due_date,
    priority: PRIORITY_FROM_DB[row.priority] ?? "normal",
    project: row.projects?.name ?? "",
    projectId: row.project_id,
    note: row.memo,
    done: row.completed_at != null,
    rrule: row.rrule,
    parentId: row.parent_id,
  };
}

// ── 조회 ─────────────────────────────────────────────────

/** 기본값: 상위 할일(서브태스크 제외) 전체. 정렬은 마감일(없으면 뒤) → 우선순위 */
export async function listTodos(filter: TodoFilter = {}): Promise<Todo[]> {
  const { status = "all", parentId = null } = filter;
  let q = createClient().from("todos").select("*, projects(name)");
  if (parentId === null) q = q.is("parent_id", null);
  else if (parentId !== undefined) q = q.eq("parent_id", parentId);
  if (status === "open") q = q.is("completed_at", null);
  if (status === "done") q = q.not("completed_at", "is", null);
  const { data, error } = await q.order("due_date", { nullsFirst: false }).order("priority").order("created_at");
  if (error) throw error;
  return (data as TodoRow[]).map(toTodo);
}

export async function listProjects(): Promise<Project[]> {
  const { data, error } = await createClient()
    .from("projects")
    .select("id, name, color")
    .eq("archived", false)
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return data;
}

// ── 쓰기 (최소 구현) ─────────────────────────────────────
// TODO(02): 반복 할일 완료 시 다음 회차 생성(complete_todo), 등록·수정·삭제

export async function setTodoDone(id: string, done: boolean) {
  const { error } = await createClient()
    .from("todos")
    .update({ completed_at: done ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}

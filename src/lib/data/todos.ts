// 할일 데이터 계층. 조회 함수 시그니처는 공유 계약이므로 바꾸지 않는다.
import { DEFAULT_TZ, zonedParts, zonedToUtc } from "@/lib/date";
import { createClient } from "@/lib/supabase/client";
import type { Tables, TablesInsert } from "@/lib/supabase/database.types";
import type { CompleteTodoResult, Priority, Project, Todo, TodoFilter, TodoInput } from "@/lib/types";

type TodoRow = Tables<"todos"> & { projects?: { name: string } | null };

// ── 변환 ─────────────────────────────────────────────────

const PRIORITY_FROM_DB: Record<number, Priority> = { 1: "high", 2: "normal", 3: "low" };
export const PRIORITY_TO_DB: Record<Priority, number> = { high: 1, normal: 2, low: 3 };

export function toTodo(row: TodoRow, tz: string = DEFAULT_TZ): Todo {
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
    dueTime: row.due_at ? zonedParts(row.due_at, tz).time : "",
    eventId: row.event_id,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    subtaskCount: 0,
    subtaskDone: 0,
  };
}

/** 화면 입력 → todos insert/update 값. 시각이 있으면 due_at도 채운다(due_date와 같은 날). */
export function fromTodoInput(input: TodoInput, tz: string = DEFAULT_TZ): Omit<TablesInsert<"todos">, "user_id"> {
  return {
    title: input.title.trim(),
    due_date: input.dueDate,
    due_at: input.dueDate && input.dueTime ? zonedToUtc(input.dueDate, input.dueTime, tz) : null,
    priority: PRIORITY_TO_DB[input.priority],
    project_id: input.projectId,
    memo: input.note,
    rrule: input.rrule,
    event_id: input.eventId,
    parent_id: input.parentId,
  };
}

// ── 조회 ─────────────────────────────────────────────────

/** 기본값: 상위 할일(서브태스크 제외) 전체. 정렬은 마감일(없으면 뒤) → 우선순위 → 생성순 */
export async function listTodos(filter: TodoFilter = {}, tz: string = DEFAULT_TZ): Promise<Todo[]> {
  const { status = "all", parentId = null, dueFrom, dueTo, projectId } = filter;
  const supabase = createClient();
  let q = supabase.from("todos").select("*, projects(name)");
  if (parentId === null) q = q.is("parent_id", null);
  else if (parentId !== undefined) q = q.eq("parent_id", parentId);
  if (status === "open") q = q.is("completed_at", null);
  if (status === "done") q = q.not("completed_at", "is", null);
  if (dueFrom) q = q.gte("due_date", dueFrom);
  if (dueTo) q = q.lte("due_date", dueTo);
  if (projectId) q = q.eq("project_id", projectId);
  const { data, error } = await q.order("due_date", { nullsFirst: false }).order("priority").order("created_at");
  if (error) throw error;
  const todos = (data as TodoRow[]).map((r) => toTodo(r, tz));

  // 서브태스크 수(체크리스트 n/m). 서브태스크 목록을 조회할 때는 필요 없다.
  if (typeof parentId !== "string" && todos.length) {
    const { data: subs, error: subError } = await supabase
      .from("todos")
      .select("parent_id, completed_at")
      .not("parent_id", "is", null);
    if (subError) throw subError;
    const byParent = new Map(todos.map((t) => [t.id, t]));
    for (const s of subs) {
      const parent = byParent.get(s.parent_id!);
      if (!parent) continue;
      parent.subtaskCount! += 1;
      if (s.completed_at) parent.subtaskDone! += 1;
    }
  }
  return todos;
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

// ── 할일 쓰기 ────────────────────────────────────────────

/** 새 할일 id를 돌려준다. subtasks는 함께 만들 서브태스크 제목 */
export async function createTodo(input: TodoInput, subtasks: string[] = [], tz: string = DEFAULT_TZ): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.from("todos").insert(fromTodoInput(input, tz)).select("id").single();
  if (error) throw error;
  const titles = subtasks.map((s) => s.trim()).filter(Boolean);
  if (titles.length) {
    const { error: subError } = await supabase
      .from("todos")
      .insert(titles.map((title) => ({ title, parent_id: data.id, project_id: input.projectId })));
    if (subError) throw subError;
  }
  return data.id;
}

export async function updateTodo(id: string, input: TodoInput, tz: string = DEFAULT_TZ) {
  const supabase = createClient();
  const { parent_id, ...values } = fromTodoInput(input, tz);
  void parent_id; // 상위·하위 관계는 수정으로 바꾸지 않는다.
  const { error } = await supabase.from("todos").update(values).eq("id", id);
  if (error) throw error;
  // 서브태스크는 상위 할일의 프로젝트를 따른다.
  const { error: subError } = await supabase.from("todos").update({ project_id: input.projectId }).eq("parent_id", id);
  if (subError) throw subError;
}

export async function renameTodo(id: string, title: string) {
  const { error } = await createClient().from("todos").update({ title: title.trim() }).eq("id", id);
  if (error) throw error;
}

/** 서브태스크는 DB가 함께 지운다(parent_id on delete cascade). */
export async function deleteTodo(id: string) {
  const { error } = await createClient().from("todos").delete().eq("id", id);
  if (error) throw error;
}

/**
 * 완료·완료 취소(DB 함수 complete_todo). 반복 할일이면 같은 트랜잭션에서 다음 회차가 생긴다.
 */
export async function completeTodo(id: string, done = true, tz: string = DEFAULT_TZ): Promise<CompleteTodoResult> {
  const { data, error } = await createClient().rpc("complete_todo", { p_id: id, p_done: done });
  if (error) throw error;
  const result = data as unknown as { todo: TodoRow; next: TodoRow | null }; // 반환형이 jsonb라 행 모양을 지정한다
  return { todo: toTodo(result.todo, tz), next: result.next ? toTodo(result.next, tz) : null };
}

/** 00 계약 유지용. completeTodo와 같다. */
export async function setTodoDone(id: string, done: boolean) {
  await completeTodo(id, done);
}

// ── 프로젝트 쓰기 (TODO-05) ──────────────────────────────

export async function createProject(name: string): Promise<Project> {
  const supabase = createClient();
  const { data: last } = await supabase.from("projects").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  const { data, error } = await supabase
    .from("projects")
    .insert({ name: name.trim(), sort_order: (last?.[0]?.sort_order ?? -1) + 1 })
    .select("id, name, color")
    .single();
  if (error) throw error;
  return data;
}

export async function updateProject(id: string, values: { name?: string; color?: string | null }) {
  const { error } = await createClient()
    .from("projects")
    .update({ ...values, name: values.name?.trim() })
    .eq("id", id);
  if (error) throw error;
}

export async function archiveProject(id: string, archived = true) {
  const { error } = await createClient().from("projects").update({ archived }).eq("id", id);
  if (error) throw error;
}

/** moveTo: 이 프로젝트의 할일을 옮길 프로젝트(null이면 프로젝트 없음) */
export async function deleteProject(id: string, moveTo: string | null = null) {
  const supabase = createClient();
  if (moveTo) {
    const { error } = await supabase.from("todos").update({ project_id: moveTo }).eq("project_id", id);
    if (error) throw error;
  }
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
}

/** 이름이 겹치면 DB unique(user_id, name) 오류(23505)가 난다. */
export const isDuplicateName = (e: unknown) => (e as { code?: string } | null)?.code === "23505";

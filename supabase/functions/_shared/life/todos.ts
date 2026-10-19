// 할일 도구: list_todos, create_todo, update_todo, complete_todo, delete_todo
// 변환 규칙은 웹 앱 src/lib/data/todos.ts(세션 02)와 같다. 우선순위 DB 값 1=높음, 2=보통, 3=낮음.
import { describeRRule, parseRRule } from "../../../../src/lib/rrule.ts";
import {
  ApiError,
  type Args,
  type Ctx,
  type Row,
  type ToolResult,
  dateTime,
  dbError,
  findByName,
  int,
  likePattern,
  oneOf,
  str,
  uuid,
  weekday,
  zonedParts,
  zonedToUtc,
} from "./util.ts";

const PRIORITIES = ["high", "normal", "low"] as const;
const PRIORITY_TO_DB = { high: 1, normal: 2, low: 3 } as const;
const PRIORITY_NAME: Record<number, string> = { 1: "high", 2: "normal", 3: "low" };

function view(row: Row, tz: string, subs?: { total: number; done: number }) {
  let repeat: string | undefined;
  if (row.rrule) {
    try {
      repeat = describeRRule(row.rrule, row.due_date ?? undefined, { tz });
    } catch {
      repeat = row.rrule;
    }
  }
  return {
    id: row.id,
    title: row.title,
    due_date: row.due_date ?? undefined,
    due_weekday: row.due_date ? weekday(row.due_date) : undefined,
    due_time: row.due_at ? zonedParts(row.due_at, tz).time : undefined,
    priority: PRIORITY_NAME[row.priority] ?? "normal",
    project: row.projects?.name ?? null,
    memo: row.memo || undefined,
    done: row.completed_at != null,
    completed_at: row.completed_at ?? undefined,
    repeat,
    checklist: subs?.total ? `${subs.done}/${subs.total}` : undefined,
  };
}

async function projects(ctx: Ctx) {
  const { data, error } = await ctx.db
    .from("projects")
    .select("id, name")
    .eq("user_id", ctx.userId)
    .eq("archived", false)
    .order("sort_order");
  dbError(error);
  return data ?? [];
}

async function getRow(ctx: Ctx, id: string): Promise<Row> {
  const { data, error } = await ctx.db.from("todos").select("*, projects(name)").eq("user_id", ctx.userId).eq("id", id).maybeSingle();
  dbError(error);
  if (!data) throw new ApiError("NOT_FOUND", "할일을 찾을 수 없습니다. list_todos로 id를 다시 확인하세요.");
  return data;
}

const priorityArg = (args: Args) => {
  const v = args.priority;
  if (typeof v === "number") {
    if (![1, 2, 3].includes(v)) throw new ApiError("VALIDATION", "priority: high, normal, low 중 하나여야 합니다.");
    return v;
  }
  const p = oneOf(args, "priority", PRIORITIES);
  return p ? PRIORITY_TO_DB[p] : undefined;
};

/** due 인자 → { due_date, due_at }. null이면 마감 없음 */
function dueArg(ctx: Ctx, args: Args): { due_date: string | null; due_at: string | null } | undefined {
  if (args.due === null || args.due === "") return { due_date: null, due_at: null };
  const raw = str(args, "due", { max: 40 });
  if (!raw) return undefined;
  const d = dateTime(ctx, raw, "due");
  return { due_date: d.date, due_at: d.time ? zonedToUtc(d.date, d.time, ctx.tz) : null };
}

function rruleArg(args: Args): string | null | undefined {
  if (args.rrule === null || args.rrule === "") return null;
  const v = str(args, "rrule", { max: 300 });
  if (!v) return undefined;
  try {
    parseRRule(v);
  } catch (e) {
    throw new ApiError("VALIDATION", `rrule: ${(e as Error).message}`);
  }
  return v.replace(/^RRULE:/i, "");
}

async function projectArg(ctx: Ctx, args: Args): Promise<string | null | undefined> {
  if (args.project === null || args.project === "") return null;
  const name = str(args, "project", { max: 50 });
  if (!name) return undefined;
  return findByName(await projects(ctx), name, "프로젝트").id;
}

export async function listTodos(ctx: Ctx, args: Args): Promise<ToolResult> {
  const status = oneOf(args, "status", ["open", "done", "all"] as const) ?? "open";
  const dueBefore = str(args, "due_before", { max: 40 });
  const dueAfter = str(args, "due_after", { max: 40 });
  const priority = priorityArg(args);
  const query = str(args, "query", { max: 100 });
  const limit = int(args, "limit", { min: 1, max: 500 }) ?? 100;

  let q = ctx.db.from("todos").select("*, projects(name)").eq("user_id", ctx.userId).is("parent_id", null);
  if (status === "open") q = q.is("completed_at", null);
  if (status === "done") q = q.not("completed_at", "is", null);
  if (dueBefore) q = q.lte("due_date", dateTime(ctx, dueBefore, "due_before").date);
  if (dueAfter) q = q.gte("due_date", dateTime(ctx, dueAfter, "due_after").date);
  if (priority) q = q.eq("priority", priority);
  const project = await projectArg(ctx, args);
  if (project) q = q.eq("project_id", project);
  if (query) {
    // or() 필터 문법을 깨는 문자(, ( ) * ")는 공백으로 바꾼다.
    const safe = query.replace(/[,()*"\\]/g, " ").trim();
    if (safe) q = q.or(`title.ilike.*${safe}*,memo.ilike.*${safe}*`);
  }
  q = status === "done" ? q.order("completed_at", { ascending: false }) : q.order("due_date", { nullsFirst: false }).order("priority");
  const { data, error } = await q.order("created_at").limit(limit + 1);
  dbError(error);
  const rows = (data ?? []).slice(0, limit);

  // 체크리스트(서브태스크) 진행
  const subs = new Map<string, { total: number; done: number }>();
  if (rows.length) {
    const { data: children, error: subError } = await ctx.db
      .from("todos")
      .select("parent_id, completed_at")
      .eq("user_id", ctx.userId)
      .in("parent_id", rows.map((r) => r.id));
    dbError(subError);
    for (const c of children ?? []) {
      const s = subs.get(c.parent_id) ?? { total: 0, done: 0 };
      s.total++;
      if (c.completed_at) s.done++;
      subs.set(c.parent_id, s);
    }
  }
  const todos = rows.map((r) => view(r, ctx.tz, subs.get(r.id)));
  const overdue = todos.filter((t) => !t.done && t.due_date && t.due_date < ctx.today).length;
  return { data: { status, count: todos.length, overdue, truncated: (data ?? []).length > limit || undefined, todos } };
}

export async function createTodo(ctx: Ctx, args: Args): Promise<ToolResult> {
  const title = str(args, "title", { required: true, max: 200 });
  const due = dueArg(ctx, args);
  const rrule = rruleArg(args);
  if (rrule && !due?.due_date) throw new ApiError("VALIDATION", "반복 할일은 due(첫 마감일)가 필요합니다.");
  const projectId = await projectArg(ctx, args);
  const subtasks = Array.isArray(args.subtasks) ? args.subtasks : [];
  if (subtasks.some((s) => typeof s !== "string") || subtasks.length > 30) {
    throw new ApiError("VALIDATION", "subtasks: 문자열 배열(최대 30개)이어야 합니다.");
  }

  const { data, error } = await ctx.db
    .from("todos")
    .insert({
      user_id: ctx.userId,
      title,
      memo: str(args, "memo", { max: 2000 }) ?? "",
      due_date: due?.due_date ?? null,
      due_at: due?.due_at ?? null,
      priority: priorityArg(args) ?? 2,
      project_id: projectId ?? null,
      rrule: rrule ?? null,
    })
    .select("*, projects(name)")
    .single();
  dbError(error);
  const titles = (subtasks as string[]).map((s) => s.trim()).filter(Boolean);
  if (titles.length) {
    const { error: subError } = await ctx.db
      .from("todos")
      .insert(titles.map((t) => ({ user_id: ctx.userId, title: t, parent_id: data.id, project_id: data.project_id })));
    dbError(subError);
  }
  const todo = view(data, ctx.tz, titles.length ? { total: titles.length, done: 0 } : undefined);
  return { data: { todo }, summary: `할일 등록: ${todo.title}${todo.due_date ? ` (마감 ${todo.due_date})` : ""}` };
}

export async function updateTodo(ctx: Ctx, args: Args): Promise<ToolResult> {
  const id = uuid(args);
  const row = await getRow(ctx, id);
  const values: Row = {};
  const title = str(args, "title", { max: 200 });
  if (title) values.title = title;
  const memo = str(args, "memo", { max: 2000 });
  if (memo !== undefined) values.memo = memo;
  const due = dueArg(ctx, args);
  if (due) Object.assign(values, due);
  const priority = priorityArg(args);
  if (priority) values.priority = priority;
  const rrule = rruleArg(args);
  if (rrule !== undefined) {
    if (row.parent_id && rrule) throw new ApiError("VALIDATION", "체크리스트 항목(서브태스크)은 반복할 수 없습니다.");
    values.rrule = rrule;
  }
  const projectId = await projectArg(ctx, args);
  if (projectId !== undefined) values.project_id = projectId;
  if (!Object.keys(values).length) throw new ApiError("VALIDATION", "바꿀 값을 하나 이상 보내세요.");
  if (values.rrule && !(values.due_date ?? row.due_date)) throw new ApiError("VALIDATION", "반복 할일은 due(마감일)가 필요합니다.");

  const { error } = await ctx.db.from("todos").update(values).eq("user_id", ctx.userId).eq("id", id);
  dbError(error);
  // 서브태스크는 상위 할일의 프로젝트를 따른다.
  if (projectId !== undefined) {
    const { error: subError } = await ctx.db.from("todos").update({ project_id: projectId }).eq("user_id", ctx.userId).eq("parent_id", id);
    dbError(subError);
  }
  const todo = view(await getRow(ctx, id), ctx.tz);
  return { data: { todo }, summary: `할일 수정: ${todo.title}` };
}

export async function completeTodo(ctx: Ctx, args: Args): Promise<ToolResult> {
  const id = uuid(args);
  const done = args.done === undefined || args.done === null ? true : args.done;
  if (typeof done !== "boolean") throw new ApiError("VALIDATION", "done: true 또는 false여야 합니다.");
  // DB 함수 complete_todo는 security invoker(RLS 의존)라 service role에서는 소유자를 먼저 확인한다.
  const row = await getRow(ctx, id);
  const { data, error } = await ctx.db.rpc("complete_todo", { p_id: row.id, p_done: done });
  dbError(error);
  const result = data as { todo: Row; next: Row | null };
  const todo = view({ ...result.todo, projects: row.projects }, ctx.tz);
  const next = result.next ? view({ ...result.next, projects: row.projects }, ctx.tz) : null;
  return {
    data: { todo, next_occurrence: next ?? undefined },
    summary: `할일 ${done ? "완료" : "완료 취소"}: ${todo.title}${next ? ` (다음 회차 ${next.due_date})` : ""}`,
  };
}

export async function deleteTodo(ctx: Ctx, args: Args): Promise<ToolResult> {
  const id = uuid(args);
  const row = await getRow(ctx, id);
  const { count } = await ctx.db.from("todos").select("id", { count: "exact", head: true }).eq("user_id", ctx.userId).eq("parent_id", id);
  const todo = view(row, ctx.tz);
  const effect = count ? `할일과 체크리스트 ${count}개를 함께 삭제합니다.` : "할일을 삭제합니다.";
  if (args.confirm !== true) {
    return {
      data: {
        confirm_required: true,
        message: `아직 삭제하지 않았습니다. 사용자에게 확인을 받은 뒤 confirm: true로 다시 호출하세요. ${effect}`,
        target: todo,
      },
    };
  }
  const { error } = await ctx.db.from("todos").delete().eq("user_id", ctx.userId).eq("id", id);
  dbError(error);
  return { data: { deleted: true, target: todo }, summary: `할일 삭제: ${todo.title}` };
}

/** 검색: 제목·메모(체크리스트 항목 포함) */
export async function searchTodos(ctx: Ctx, query: string, limit: number) {
  const found = new Map<string, Row>();
  for (const col of ["title", "memo"]) {
    const { data, error } = await ctx.db
      .from("todos")
      .select("*, projects(name)")
      .eq("user_id", ctx.userId)
      .ilike(col, likePattern(query))
      .order("created_at", { ascending: false })
      .limit(limit);
    dbError(error);
    for (const r of data ?? []) found.set(r.id, r);
  }
  return [...found.values()].slice(0, limit).map((r) => ({ ...view(r, ctx.tz), parent_id: r.parent_id ?? undefined }));
}

/** 오늘 요약용: 마감이 date 이전·당일인 미완료 할일 */
export async function dueTodos(ctx: Ctx, date: string) {
  const { data, error } = await ctx.db
    .from("todos")
    .select("*, projects(name)")
    .eq("user_id", ctx.userId)
    .is("parent_id", null)
    .is("completed_at", null)
    .lte("due_date", date)
    .order("due_date")
    .order("priority")
    .limit(50);
  dbError(error);
  return (data ?? []).map((r) => view(r, ctx.tz));
}

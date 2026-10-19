// 도구 실행 공통: 범위 검사 → 인자 검증·실행 → 쓰기 사용 기록. mcp-api(HTTP JSON)와 mcp-remote(MCP Streamable HTTP)가 함께 쓴다.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { READ_SCOPES, TOOL_DEFS, type ToolDef } from "./defs.ts";
import { createEvent, deleteEvent, eventsInRange, findFreeTime, listEvents, searchEvents, updateEvent } from "./events.ts";
import {
  addTransaction,
  budgetFor,
  deleteTransaction,
  getBudgetStatus,
  getSpendingSummary,
  listTransactions,
  searchTransactions,
  spendingOn,
  updateTransaction,
} from "./money.ts";
import { completeTodo, createTodo, deleteTodo, dueTodos, listTodos, searchTodos, updateTodo } from "./todos.ts";
import { ApiError, type Args, type Ctx, type ToolResult, date, int, nowIso, str, weekday, zonedParts } from "./util.ts";

/** 요청한 쪽: PAT(tokenId) 또는 OAuth 연결(clientId) */
export interface Principal {
  userId: string;
  scopes: Set<string>;
  tokenId: string | null;
  clientId: string | null;
}

export interface ApiBody {
  ok: boolean;
  now?: string;
  timezone?: string;
  data?: unknown;
  code?: string;
  message?: string;
  candidates?: string[];
}

export const STATUS: Record<string, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN_SCOPE: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
  UPSTREAM: 502,
};

type Run = (ctx: Ctx, args: Args) => Promise<ToolResult>;

// ── 공통 도구 ────────────────────────────────────────────

/** 날씨(04 weather Edge Function)가 아직 없다. 준비되면 여기서 weather 함수를 부른다. TODO(04) */
function weather(): Promise<ToolResult> {
  return Promise.reject(new ApiError("UPSTREAM", "날씨 기능은 아직 준비 중입니다. 날씨 정보를 제공할 수 없다고 안내하세요."));
}

async function todaySummary(ctx: Ctx, args: Args): Promise<ToolResult> {
  const d = date(ctx, args, "date") ?? ctx.today;
  const has = (s: string) => ctx.scopes.has(s);
  const [events, todos, spending, budget] = await Promise.all([
    has("events:read") ? eventsInRange(ctx, d, d).then((l) => l.map((x) => x.ev)) : undefined,
    has("todos:read") ? dueTodos(ctx, d) : undefined,
    has("tx:read") ? spendingOn(ctx, d) : undefined,
    has("tx:read") ? budgetFor(ctx, d.slice(0, 7)) : undefined,
  ]);
  return {
    data: {
      date: d,
      weekday: weekday(d),
      events,
      todos: todos && {
        overdue: todos.filter((t) => t.due_date! < d),
        due: todos.filter((t) => t.due_date === d),
      },
      spending: spending && {
        date_expense: spending.date_expense,
        month_to_date_expense: spending.month_to_date_expense,
        transactions: spending.date_transactions,
      },
      budget: budget && budget.has_budget ? { month: budget.month, ...budget.total } : undefined,
      weather: has("weather:read") ? "날씨 기능 준비 중" : undefined,
      omitted: READ_SCOPES.filter((s) => !has(s)).map((s) => `${s} 범위가 없어 뺐습니다.`),
    },
  };
}

async function search(ctx: Ctx, args: Args): Promise<ToolResult> {
  const query = str(args, "query", { required: true, max: 100 });
  const limit = int(args, "limit", { min: 1, max: 100 }) ?? 20;
  const all = ["events", "todos", "transactions"] as const;
  const scopeOf = { events: "events:read", todos: "todos:read", transactions: "tx:read" } as const;
  let types: (typeof all)[number][] = [...all];
  if (args.types !== undefined && args.types !== null) {
    if (!Array.isArray(args.types) || args.types.some((t) => !all.includes(t))) {
      throw new ApiError("VALIDATION", `types: ${all.join(", ")} 중에서 고른 배열이어야 합니다.`);
    }
    types = args.types;
  }
  const allowed = types.filter((t) => ctx.scopes.has(scopeOf[t]));
  const [events, todos, transactions] = await Promise.all([
    allowed.includes("events") ? searchEvents(ctx, query, limit) : undefined,
    allowed.includes("todos") ? searchTodos(ctx, query, limit) : undefined,
    allowed.includes("transactions") ? searchTransactions(ctx, query, limit) : undefined,
  ]);
  const skipped = types.filter((t) => !allowed.includes(t));
  return {
    data: { query, events, todos, transactions, skipped: skipped.length ? skipped.map((t) => `${t}: ${scopeOf[t]} 범위 없음`) : undefined },
  };
}

const RUNNERS: Record<string, Run> = {
  list_events: listEvents,
  create_event: createEvent,
  update_event: updateEvent,
  delete_event: deleteEvent,
  find_free_time: findFreeTime,
  list_todos: listTodos,
  create_todo: createTodo,
  update_todo: updateTodo,
  complete_todo: completeTodo,
  delete_todo: deleteTodo,
  list_transactions: listTransactions,
  add_transaction: addTransaction,
  update_transaction: updateTransaction,
  delete_transaction: deleteTransaction,
  get_budget_status: getBudgetStatus,
  get_spending_summary: getSpendingSummary,
  get_today_summary: todaySummary,
  get_weather: weather,
  search,
};

const DEFS = new Map<string, ToolDef>(TOOL_DEFS.map((d) => [d.name, d]));

// ── 실행 ─────────────────────────────────────────────────

/** 사용 기록에 남길 인자. 너무 긴 값은 자른다 */
const auditArgs = (args: Args) =>
  Object.fromEntries(Object.entries(args).map(([k, v]) => [k, typeof v === "string" && v.length > 300 ? `${v.slice(0, 300)}…` : v]));

/**
 * 도구 하나를 실행해 { status, body }를 돌려준다. 예외를 던지지 않는다.
 * - name "ping"은 연결 확인용(범위 목록, 도구 목록에는 없다)
 * - 쓰기 도구가 실제로 바꾼 경우(삭제 미리보기 제외)와 실패(VALIDATION·NOT_FOUND 제외)를 mcp_audit_logs에 남긴다.
 */
export async function runTool(db: SupabaseClient, who: Principal, name: string, args: Args): Promise<{ status: number; body: ApiBody }> {
  const { data: profile } = await db.from("profiles").select("timezone").eq("user_id", who.userId).maybeSingle();
  const tz = profile?.timezone || "Asia/Seoul";
  const now = new Date();
  const base = { now: nowIso(tz, now), timezone: tz };
  const ctx: Ctx = { db, userId: who.userId, tz, scopes: who.scopes, today: zonedParts(now, tz).date };

  if (name === "ping") return { status: 200, body: { ok: true, ...base, data: { scopes: [...who.scopes].sort() } } };
  const def = DEFS.get(name);
  const run = RUNNERS[name];
  if (!def || !run) return { status: 400, body: { ok: false, ...base, code: "VALIDATION", message: `알 수 없는 도구입니다: ${name || "(없음)"}` } };

  const permitted = def.scope === "any-read" ? READ_SCOPES.some((s) => who.scopes.has(s)) : who.scopes.has(def.scope);
  if (!permitted) {
    const need = def.scope === "any-read" ? "읽기 범위 하나 이상" : def.scope;
    return {
      status: 403,
      body: { ok: false, ...base, code: "FORBIDDEN_SCOPE", message: `이 연결에는 ${need} 권한이 없습니다. 설정 → MCP 연결에서 권한을 바꾸거나 다시 연결하세요.` },
    };
  }

  const audit = (status: "ok" | "error", summary: string) =>
    db.from("mcp_audit_logs").insert({
      user_id: who.userId,
      token_id: who.tokenId,
      ...(who.clientId ? { client_id: who.clientId } : {}),
      tool: name,
      args: auditArgs(args),
      result_summary: summary,
      status,
    });

  try {
    const result = await run(ctx, args);
    if (def.write && result.summary) await audit("ok", result.summary);
    return { status: 200, body: { ok: true, ...base, data: result.data } };
  } catch (e) {
    if (e instanceof ApiError) {
      if (def.write && e.code !== "VALIDATION" && e.code !== "NOT_FOUND") await audit("error", `${e.code}: ${e.message}`);
      return { status: STATUS[e.code] ?? 400, body: { ok: false, ...base, code: e.code, message: e.message, candidates: e.candidates } };
    }
    console.error(name, e);
    if (def.write) await audit("error", `오류: ${(e as Error).message}`);
    return { status: 500, body: { ok: false, ...base, code: "UPSTREAM", message: `처리 중 오류가 났습니다: ${(e as Error).message}` } };
  }
}

// Edge Function mcp-api — 로컬 MCP 서버(life-manager-mcp)가 부르는 API (MCP-01~06, PRD 4.4)
//
// 요청: POST { tool, args }, 헤더 Authorization: Bearer <PAT(lm_mcp_…)>
// 응답: { ok: true, now, timezone, data } | { ok: false, now?, code, message, candidates? }
//
// 처리 순서
// 1. 토큰 SHA-256 해시로 mcp_tokens를 찾고 폐기 여부를 본다(UNAUTHORIZED). last_used_at을 갱신한다.
// 2. 도구에 필요한 범위를 확인한다(FORBIDDEN_SCOPE).
// 3. 인자를 검증한다(VALIDATION). 날짜는 절대값(ISO 8601)만 받는다.
// 4. service role 클라이언트로 처리하되 모든 쿼리에 user_id = 토큰 소유자 조건을 붙인다.
// 5. 쓰기 도구가 실제로 바꾼 경우(삭제 미리보기 제외) mcp_audit_logs에 남긴다. 실패도 status='error'로 남긴다.
//
// 배포: npx supabase functions deploy mcp-api --no-verify-jwt (JWT 대신 PAT로 인증)
import { createClient } from "npm:@supabase/supabase-js@2";
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

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const STATUS: Record<string, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN_SCOPE: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
  UPSTREAM: 502,
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });

const READ_SCOPES = ["events:read", "todos:read", "tx:read", "weather:read"];

/** "any-read" = 읽기 범위 하나 이상(결과는 가진 범위만큼만) */
interface Tool {
  scope: string | "any-read";
  write?: boolean;
  run: (ctx: Ctx, args: Args) => Promise<ToolResult>;
}

const TOOLS: Record<string, Tool> = {
  list_events: { scope: "events:read", run: listEvents },
  create_event: { scope: "events:write", write: true, run: createEvent },
  update_event: { scope: "events:write", write: true, run: updateEvent },
  delete_event: { scope: "events:write", write: true, run: deleteEvent },
  find_free_time: { scope: "events:read", run: findFreeTime },
  list_todos: { scope: "todos:read", run: listTodos },
  create_todo: { scope: "todos:write", write: true, run: createTodo },
  update_todo: { scope: "todos:write", write: true, run: updateTodo },
  complete_todo: { scope: "todos:write", write: true, run: completeTodo },
  delete_todo: { scope: "todos:write", write: true, run: deleteTodo },
  list_transactions: { scope: "tx:read", run: listTransactions },
  add_transaction: { scope: "tx:write", write: true, run: addTransaction },
  update_transaction: { scope: "tx:write", write: true, run: updateTransaction },
  delete_transaction: { scope: "tx:write", write: true, run: deleteTransaction },
  get_budget_status: { scope: "tx:read", run: getBudgetStatus },
  get_spending_summary: { scope: "tx:read", run: getSpendingSummary },
  get_today_summary: { scope: "any-read", run: todaySummary },
  get_weather: { scope: "weather:read", run: weather },
  search: { scope: "any-read", run: search },
  // 연결 확인용(도구 목록에는 없다): 토큰 이름·범위
  ping: { scope: "", run: (ctx) => Promise.resolve({ data: { scopes: [...ctx.scopes].sort() } }) },
};

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

// ── 요청 처리 ────────────────────────────────────────────

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 사용 기록에 남길 인자. 너무 긴 값은 자른다 */
const auditArgs = (args: Args) =>
  Object.fromEntries(Object.entries(args).map(([k, v]) => [k, typeof v === "string" && v.length > 300 ? `${v.slice(0, 300)}…` : v]));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, code: "VALIDATION", message: "POST로 호출하세요." }, 405);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. 토큰
  const raw = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!/^lm_mcp_[0-9A-Za-z]{20,64}$/.test(raw)) {
    return json({ ok: false, code: "UNAUTHORIZED", message: "토큰이 없거나 형식이 잘못됐습니다(LIFE_TOKEN 확인)." }, 401);
  }
  const { data: token, error: tokenError } = await db
    .from("mcp_tokens")
    .select("id, user_id, name, scopes, revoked_at")
    .eq("token_hash", await sha256Hex(raw))
    .maybeSingle();
  if (tokenError) return json({ ok: false, code: "UPSTREAM", message: "토큰 확인 중 오류가 났습니다." }, 502);
  if (!token || token.revoked_at) {
    return json({ ok: false, code: "UNAUTHORIZED", message: "유효하지 않거나 폐기된 토큰입니다. 설정 → MCP 연결에서 새 토큰을 발급하세요." }, 401);
  }

  const { data: profile } = await db.from("profiles").select("timezone").eq("user_id", token.user_id).maybeSingle();
  const tz = profile?.timezone || "Asia/Seoul";
  const now = new Date();
  const base = { now: nowIso(tz, now), timezone: tz };
  const ctx: Ctx = { db, userId: token.user_id, tz, scopes: new Set(token.scopes ?? []), today: zonedParts(now, tz).date };
  await db.from("mcp_tokens").update({ last_used_at: now.toISOString() }).eq("id", token.id);

  const body = await req.json().catch(() => null);
  const name = typeof body?.tool === "string" ? body.tool : "";
  const args: Args = body?.args && typeof body.args === "object" && !Array.isArray(body.args) ? body.args : {};
  const tool = TOOLS[name];
  if (!tool) return json({ ok: false, ...base, code: "VALIDATION", message: `알 수 없는 도구입니다: ${name || "(없음)"}` }, 400);

  // 2. 범위
  const permitted = tool.scope === "" || (tool.scope === "any-read" ? READ_SCOPES.some((s) => ctx.scopes.has(s)) : ctx.scopes.has(tool.scope));
  if (!permitted) {
    const need = tool.scope === "any-read" ? "읽기 범위 하나 이상" : tool.scope;
    return json(
      { ok: false, ...base, code: "FORBIDDEN_SCOPE", message: `이 토큰에는 ${need} 권한이 없습니다. 설정 → MCP 연결에서 권한이 있는 토큰을 발급하세요.` },
      403,
    );
  }

  const audit = (status: "ok" | "error", summary: string) =>
    db.from("mcp_audit_logs").insert({ user_id: ctx.userId, token_id: token.id, tool: name, args: auditArgs(args), result_summary: summary, status });

  // 3~5. 실행
  try {
    const result = await tool.run(ctx, args);
    if (tool.write && result.summary) await audit("ok", result.summary);
    return json({ ok: true, ...base, data: result.data });
  } catch (e) {
    if (e instanceof ApiError) {
      if (tool.write && e.code !== "VALIDATION" && e.code !== "NOT_FOUND") await audit("error", `${e.code}: ${e.message}`);
      return json({ ok: false, ...base, code: e.code, message: e.message, candidates: e.candidates }, STATUS[e.code] ?? 400);
    }
    console.error(name, e);
    if (tool.write) await audit("error", `오류: ${(e as Error).message}`);
    return json({ ok: false, ...base, code: "UPSTREAM", message: `처리 중 오류가 났습니다: ${(e as Error).message}` }, 500);
  }
});

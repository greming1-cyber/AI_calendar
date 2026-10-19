// 가계부 도구: list_transactions, add_transaction, update_transaction, delete_transaction,
//              get_budget_status, get_spending_summary
// 거래는 transactions 테이블에 직접 쓴다(via_mcp=true, recurring_id는 비운다). 집계 규칙은 웹 앱 src/lib/money.ts와 같다.
import {
  ApiError,
  type Args,
  type Ctx,
  type Row,
  type ToolResult,
  addDays,
  date,
  dbError,
  findByName,
  includesText,
  int,
  oneOf,
  range,
  str,
  uuid,
  weekday,
  won,
} from "./util.ts";

const TYPES = ["income", "expense"] as const;
type TxType = (typeof TYPES)[number];
const SELECT = "*, tx_categories(name), payment_methods(name)";
const MAX_AMOUNT = 1_000_000_000_000;

function view(row: Row) {
  return {
    id: row.id,
    date: row.occurred_on,
    weekday: weekday(row.occurred_on),
    type: row.type as TxType,
    amount: row.amount,
    amount_text: `${row.type === "income" ? "+" : "-"}${won(row.amount)}`,
    category: row.tx_categories?.name ?? null,
    payment_method: row.payment_methods?.name ?? null,
    memo: row.memo || undefined,
    via_claude: row.via_mcp || undefined,
    recurring: row.recurring_id ? true : undefined,
  };
}

async function txCategories(ctx: Ctx, type?: TxType) {
  let q = ctx.db.from("tx_categories").select("id, type, name").eq("user_id", ctx.userId);
  if (type) q = q.eq("type", type);
  const { data, error } = await q.order("sort_order");
  dbError(error);
  return data ?? [];
}

async function paymentMethods(ctx: Ctx) {
  const { data, error } = await ctx.db.from("payment_methods").select("id, name").eq("user_id", ctx.userId).order("sort_order");
  dbError(error);
  return data ?? [];
}

async function getRow(ctx: Ctx, id: string): Promise<Row> {
  const { data, error } = await ctx.db.from("transactions").select(SELECT).eq("user_id", ctx.userId).eq("id", id).maybeSingle();
  dbError(error);
  if (!data) throw new ApiError("NOT_FOUND", "내역을 찾을 수 없습니다. list_transactions로 id를 다시 확인하세요.");
  return data;
}

const typeLabel = (t: TxType) => (t === "income" ? "수입" : "지출");

async function fetchRange(ctx: Ctx, from: string, to: string, type?: TxType): Promise<Row[]> {
  let q = ctx.db.from("transactions").select(SELECT).eq("user_id", ctx.userId).gte("occurred_on", from).lte("occurred_on", to);
  if (type) q = q.eq("type", type);
  const { data, error } = await q.order("occurred_on", { ascending: false }).order("created_at", { ascending: false }).limit(5000);
  dbError(error);
  return data ?? [];
}

const totals = (rows: Row[]) => {
  const income = rows.filter((r) => r.type === "income").reduce((s, r) => s + r.amount, 0);
  const expense = rows.filter((r) => r.type === "expense").reduce((s, r) => s + r.amount, 0);
  return { income, expense, balance: income - expense, count: rows.length };
};

export async function listTransactions(ctx: Ctx, args: Args): Promise<ToolResult> {
  const { from, to } = range(ctx, args);
  const type = oneOf(args, "type", TYPES);
  const categoryName = str(args, "category", { max: 50 });
  const methodName = str(args, "payment_method", { max: 50 });
  const query = str(args, "query", { max: 100 });
  const limit = int(args, "limit", { min: 1, max: 500 }) ?? 100;

  let rows = await fetchRange(ctx, from, to, type);
  if (categoryName) {
    // type이 없으면 수입·지출에 같은 이름(예: 기타)이 있을 수 있어 둘 다 본다.
    const cats = await txCategories(ctx, type);
    const hit = findByName(cats, categoryName, "분류");
    const ids = new Set(cats.filter((c) => c.name === hit.name).map((c) => c.id));
    rows = rows.filter((r) => ids.has(r.category_id));
  }
  if (methodName) {
    const m = findByName(await paymentMethods(ctx), methodName, "결제수단");
    rows = rows.filter((r) => r.payment_method_id === m.id);
  }
  if (query) rows = rows.filter((r) => includesText(query, r.memo, r.tx_categories?.name, r.payment_methods?.name));
  const t = totals(rows);
  return {
    data: {
      from,
      to,
      totals: { ...t, income_text: won(t.income), expense_text: won(t.expense), balance_text: won(t.balance) },
      truncated: rows.length > limit || undefined,
      transactions: rows.slice(0, limit).map(view),
    },
  };
}

/** 분류 이름 → id. 그 유형(수입/지출)의 분류에서만 찾는다 */
async function categoryId(ctx: Ctx, type: TxType, name: string) {
  return findByName(await txCategories(ctx, type), name, `${typeLabel(type)} 분류`).id;
}

export async function addTransaction(ctx: Ctx, args: Args): Promise<ToolResult> {
  const type = oneOf(args, "type", TYPES);
  if (!type) throw new ApiError("VALIDATION", "type: income 또는 expense가 필요합니다.");
  const amount = int(args, "amount", { required: true, min: 1, max: MAX_AMOUNT })!;
  const occurredOn = date(ctx, args, "date") ?? ctx.today;
  const categoryName = str(args, "category", { max: 50 });
  const methodName = str(args, "payment_method", { max: 50 });

  const { data, error } = await ctx.db
    .from("transactions")
    .insert({
      user_id: ctx.userId,
      type,
      amount,
      occurred_on: occurredOn,
      category_id: categoryName ? await categoryId(ctx, type, categoryName) : null,
      payment_method_id: methodName ? findByName(await paymentMethods(ctx), methodName, "결제수단").id : null,
      memo: str(args, "memo", { max: 500 }) ?? "",
      via_mcp: true,
    })
    .select(SELECT)
    .single();
  dbError(error);
  const tx = view(data);
  return {
    data: { transaction: tx },
    summary: `${typeLabel(type)} 기록: ${tx.memo ?? tx.category ?? ""} ${won(amount)} (${occurredOn}${tx.payment_method ? `, ${tx.payment_method}` : ""})`.replace("  ", " "),
  };
}

export async function updateTransaction(ctx: Ctx, args: Args): Promise<ToolResult> {
  const id = uuid(args);
  const row = await getRow(ctx, id);
  const values: Row = {};
  const type = oneOf(args, "type", TYPES);
  if (type) values.type = type;
  const amount = int(args, "amount", { min: 1, max: MAX_AMOUNT });
  if (amount) values.amount = amount;
  const d = date(ctx, args, "date");
  if (d) values.occurred_on = d;
  const memo = str(args, "memo", { max: 500 });
  if (memo !== undefined) values.memo = memo;

  const finalType: TxType = type ?? row.type;
  if (args.category === null || args.category === "") values.category_id = null;
  else {
    const name = str(args, "category", { max: 50 });
    if (name) values.category_id = await categoryId(ctx, finalType, name);
    else if (type && type !== row.type && row.category_id) {
      throw new ApiError(
        "VALIDATION",
        `유형을 ${typeLabel(type)}(으)로 바꾸면 기존 분류(${row.tx_categories?.name})를 쓸 수 없습니다. category도 함께 보내세요.`,
        (await txCategories(ctx, type)).map((c) => c.name),
      );
    }
  }
  if (args.payment_method === null || args.payment_method === "") values.payment_method_id = null;
  else {
    const name = str(args, "payment_method", { max: 50 });
    if (name) values.payment_method_id = findByName(await paymentMethods(ctx), name, "결제수단").id;
  }
  if (!Object.keys(values).length) throw new ApiError("VALIDATION", "바꿀 값을 하나 이상 보내세요.");

  const { data, error } = await ctx.db.from("transactions").update(values).eq("user_id", ctx.userId).eq("id", id).select(SELECT).single();
  dbError(error);
  const tx = view(data);
  return { data: { transaction: tx }, summary: `내역 수정: ${tx.memo ?? tx.category ?? ""} ${won(tx.amount)} (${tx.date})` };
}

export async function deleteTransaction(ctx: Ctx, args: Args): Promise<ToolResult> {
  const id = uuid(args);
  const tx = view(await getRow(ctx, id));
  if (args.confirm !== true) {
    return {
      data: {
        confirm_required: true,
        message: "아직 삭제하지 않았습니다. 사용자에게 확인을 받은 뒤 confirm: true로 다시 호출하세요.",
        target: tx,
      },
    };
  }
  const { error } = await ctx.db.from("transactions").delete().eq("user_id", ctx.userId).eq("id", id);
  dbError(error);
  return { data: { deleted: true, target: tx }, summary: `내역 삭제: ${tx.memo ?? tx.category ?? ""} ${won(tx.amount)} (${tx.date})` };
}

const monthBounds = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  const from = `${month}-01`;
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { from, to };
};

/** 월 예산 대비 사용(웹 앱 money.ts budgetStatus와 같은 규칙: 전체 예산이 없으면 분류별 예산 합) */
export async function budgetFor(ctx: Ctx, month: string) {
  const { from, to } = monthBounds(month);
  const [{ data: budgets, error }, rows] = await Promise.all([
    ctx.db.from("budgets").select("amount, category_id, tx_categories(name, sort_order)").eq("user_id", ctx.userId).eq("month", month),
    fetchRange(ctx, from, to, "expense"),
  ]);
  dbError(error);
  const byCat = new Map<string, number>();
  for (const r of rows) {
    const name = r.tx_categories?.name ?? "분류 없음";
    byCat.set(name, (byCat.get(name) ?? 0) + r.amount);
  }
  const spent = rows.reduce((s, r) => s + r.amount, 0);
  const list = (budgets ?? []) as Row[];
  const perCategory = list
    .filter((b) => b.category_id)
    .sort((a, b) => (a.tx_categories?.sort_order ?? 0) - (b.tx_categories?.sort_order ?? 0));
  const total = list.find((b) => !b.category_id)?.amount ?? perCategory.reduce((s, b) => s + b.amount, 0);
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
  const daysLeft = ctx.today >= from && ctx.today <= to ? Math.round((Date.parse(to) - Date.parse(ctx.today)) / 86_400_000) + 1 : null;
  return {
    month,
    has_budget: list.length > 0,
    total: { budget: total, spent, left: total - spent, used_percent: pct(spent, total) },
    days_left_including_today: daysLeft ?? undefined,
    daily_allowance: daysLeft && total > spent ? Math.floor((total - spent) / daysLeft) : undefined,
    categories: perCategory.map((b) => {
      const used = byCat.get(b.tx_categories?.name) ?? 0;
      return {
        category: b.tx_categories?.name,
        budget: b.amount,
        spent: used,
        left: b.amount - used,
        used_percent: pct(used, b.amount),
        warning: b.amount && used / b.amount >= 0.8 ? (used > b.amount ? "초과" : "80% 이상 사용") : undefined,
      };
    }),
    unbudgeted_spending: [...byCat.entries()]
      .filter(([name]) => !perCategory.some((b) => b.tx_categories?.name === name))
      .map(([category, amount]) => ({ category, spent: amount })),
  };
}

export async function getBudgetStatus(ctx: Ctx, args: Args): Promise<ToolResult> {
  const raw = str(args, "month", { max: 10 });
  const month = raw ?? ctx.today.slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new ApiError("VALIDATION", "month: YYYY-MM 형식이어야 합니다.");
  return { data: await budgetFor(ctx, month) };
}

export async function getSpendingSummary(ctx: Ctx, args: Args): Promise<ToolResult> {
  const { from, to } = range(ctx, args, 3 * 366);
  const groupBy = oneOf(args, "group_by", ["category", "month", "payment_method"] as const) ?? "category";
  const type = oneOf(args, "type", TYPES) ?? "expense";
  const rows = await fetchRange(ctx, from, to, type);
  const groups = new Map<string, { amount: number; count: number }>();
  for (const r of rows) {
    const key =
      groupBy === "month"
        ? r.occurred_on.slice(0, 7)
        : groupBy === "category"
          ? r.tx_categories?.name ?? "분류 없음"
          : r.payment_methods?.name ?? "결제수단 없음";
    const g = groups.get(key) ?? { amount: 0, count: 0 };
    g.amount += r.amount;
    g.count++;
    groups.set(key, g);
  }
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const list = [...groups.entries()].map(([key, g]) => ({
    [groupBy]: key,
    amount: g.amount,
    amount_text: won(g.amount),
    count: g.count,
    share_percent: total ? Math.round((g.amount / total) * 1000) / 10 : 0,
  }));
  list.sort((a, b) => (groupBy === "month" ? String(a.month).localeCompare(String(b.month)) : b.amount - a.amount));
  return { data: { from, to, type, group_by: groupBy, total, total_text: won(total), groups: list } };
}

/** 검색: 메모·분류명·결제수단명(최근 1년) */
export async function searchTransactions(ctx: Ctx, query: string, limit: number) {
  const rows = await fetchRange(ctx, addDays(ctx.today, -366), ctx.today);
  return rows
    .filter((r) => includesText(query, r.memo, r.tx_categories?.name, r.payment_methods?.name))
    .slice(0, limit)
    .map(view);
}

/** 오늘 요약용: 날짜의 지출 합계와 이번 달 지출 */
export async function spendingOn(ctx: Ctx, day: string) {
  const month = day.slice(0, 7);
  const { from } = monthBounds(month);
  const rows = await fetchRange(ctx, from, addDays(day, 0), "expense");
  const today = rows.filter((r) => r.occurred_on === day);
  return {
    date_expense: today.reduce((s, r) => s + r.amount, 0),
    date_transactions: today.map(view),
    month_to_date_expense: rows.reduce((s, r) => s + r.amount, 0),
  };
}

// 가계부 데이터 계층(내역·분류·결제수단·고정지출). 조회 함수 시그니처는 공유 계약이므로 바꾸지 않는다.
import { createClient } from "@/lib/supabase/client";
import type { Tables, TablesUpdate } from "@/lib/supabase/database.types";
import type {
  ISODate,
  PaymentMethod,
  RecurringInput,
  RecurringTransaction,
  Transaction,
  TransactionInput,
  TxCategory,
  TxFilter,
  TxType,
} from "@/lib/types";

type TxRow = Tables<"transactions"> & {
  tx_categories: { name: string } | null;
  payment_methods: { name: string } | null;
};
type RecurringRow = Tables<"recurring_transactions"> & {
  tx_categories: { name: string } | null;
  payment_methods?: { name: string } | null;
};

// ── 변환 ─────────────────────────────────────────────────

const txType = (t: string): TxType => (t === "income" ? "income" : "expense");

export function toTransaction(row: TxRow): Transaction {
  return {
    id: row.id,
    date: row.occurred_on,
    type: txType(row.type),
    amount: row.amount,
    category: row.tx_categories?.name ?? "",
    categoryId: row.category_id,
    memo: row.memo,
    method: row.payment_methods?.name ?? "",
    paymentMethodId: row.payment_method_id,
    viaClaude: row.via_mcp,
    recurringId: row.recurring_id,
    eventId: row.event_id,
  };
}

export function toRecurringTransaction(row: RecurringRow): RecurringTransaction {
  return {
    id: row.id,
    type: txType(row.type),
    title: row.memo,
    amount: row.amount,
    dayOfMonth: row.day_of_month,
    category: row.tx_categories?.name ?? "",
    active: row.active,
    categoryId: row.category_id,
    paymentMethodId: row.payment_method_id,
    method: row.payment_methods?.name ?? "",
  };
}

/** 금액은 원 단위 양의 정수(DB check amount > 0) */
export const isValidAmount = (n: number) => Number.isSafeInteger(n) && n > 0;

/** 이름이 겹치면 DB unique 오류(23505)가 난다. */
export const isDuplicateName = (e: unknown) => (e as { code?: string } | null)?.code === "23505";

// ── 조회 ─────────────────────────────────────────────────

/** PostgREST or/ilike 값에서 의미가 있는 문자를 뺀다. */
const likeSafe = (s: string) => s.replace(/[%_,()*\\]/g, " ").trim();

/** from~to(포함) 내역, 최신순. filter(TX-03)는 선택 */
export async function listTransactions(from: ISODate, to: ISODate, filter: TxFilter = {}): Promise<Transaction[]> {
  let q = createClient()
    .from("transactions")
    .select("*, tx_categories(name), payment_methods(name)")
    .gte("occurred_on", from)
    .lte("occurred_on", to);
  if (filter.type) q = q.eq("type", filter.type);
  if (filter.categoryIds?.length) q = q.in("category_id", filter.categoryIds);
  if (filter.paymentMethodIds?.length) q = q.in("payment_method_id", filter.paymentMethodIds);
  const keyword = likeSafe(filter.keyword ?? "");
  if (keyword) q = q.ilike("memo", `%${keyword}%`);
  const { data, error } = await q.order("occurred_on", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return (data as TxRow[]).map(toTransaction);
}

export async function listTxCategories(): Promise<TxCategory[]> {
  const { data, error } = await createClient()
    .from("tx_categories")
    .select("id, type, name, color")
    .order("type", { ascending: false })
    .order("sort_order");
  if (error) throw error;
  return data.map((c) => ({ ...c, type: txType(c.type) }));
}

export async function listPaymentMethods(): Promise<PaymentMethod[]> {
  const { data, error } = await createClient().from("payment_methods").select("id, type, name").order("sort_order");
  if (error) throw error;
  return data.map((m) => ({ ...m, type: m.type as PaymentMethod["type"] }));
}

/** 사용 중인 고정지출·고정수입 */
export async function listRecurringTransactions(): Promise<RecurringTransaction[]> {
  const { data, error } = await createClient()
    .from("recurring_transactions")
    .select("*, tx_categories(name)")
    .eq("active", true)
    .order("day_of_month");
  if (error) throw error;
  return (data as RecurringRow[]).map(toRecurringTransaction);
}

/** 꺼 둔 것까지 모든 고정지출·고정수입(관리 화면) */
export async function listAllRecurringTransactions(): Promise<RecurringTransaction[]> {
  const { data, error } = await createClient()
    .from("recurring_transactions")
    .select("*, tx_categories(name), payment_methods(name)")
    .order("active", { ascending: false })
    .order("day_of_month");
  if (error) throw error;
  return (data as RecurringRow[]).map(toRecurringTransaction);
}

// ── 이름으로 찾기 (05 MCP 계약) ───────────────────────────
// 정확히 일치하면 match, 아니면 이름에 포함되는 후보를 돌려준다. 없는 이름을 새로 만들지 않는다.

const findByName = <T extends { name: string }>(list: T[], name: string) => {
  const key = name.trim().toLowerCase();
  const match = list.find((x) => x.name.toLowerCase() === key) ?? null;
  const candidates = match
    ? []
    : list.filter((x) => key && (x.name.toLowerCase().includes(key) || key.includes(x.name.toLowerCase())));
  return { match, candidates: candidates.length ? candidates : match ? [] : list };
};

export async function findCategoryByName(name: string, type?: TxType) {
  const list = (await listTxCategories()).filter((c) => !type || c.type === type);
  return findByName(list, name);
}

export async function findPaymentMethodByName(name: string) {
  return findByName(await listPaymentMethods(), name);
}

// ── 내역 쓰기 (TX-01) ─────────────────────────────────────

const fromTxInput = (input: TransactionInput) => {
  if (!isValidAmount(input.amount)) throw new Error("금액은 1원 이상의 정수여야 합니다.");
  return {
    type: input.type,
    amount: input.amount,
    occurred_on: input.date,
    category_id: input.categoryId,
    payment_method_id: input.paymentMethodId,
    memo: input.memo.trim(),
    event_id: input.eventId,
  };
};

export async function createTransaction(input: TransactionInput, recurringId: string | null = null): Promise<string> {
  const { data, error } = await createClient()
    .from("transactions")
    .insert({ ...fromTxInput(input), recurring_id: recurringId })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function updateTransaction(id: string, input: TransactionInput) {
  const { error } = await createClient().from("transactions").update(fromTxInput(input)).eq("id", id);
  if (error) throw error;
}

export async function deleteTransaction(id: string) {
  const { error } = await createClient().from("transactions").delete().eq("id", id);
  if (error) throw error;
}

// ── 분류·결제수단 쓰기 (TX-04, TX-05) ──────────────────────

const nextOrder = async (table: "tx_categories" | "payment_methods", type?: TxType) => {
  let q = createClient().from(table).select("sort_order");
  if (type) q = q.eq("type", type);
  const { data } = await q.order("sort_order", { ascending: false }).limit(1);
  return (data?.[0]?.sort_order ?? -1) + 1;
};

export async function createTxCategory(input: { type: TxType; name: string; color: string | null }) {
  const { error } = await createClient()
    .from("tx_categories")
    .insert({ ...input, name: input.name.trim(), sort_order: await nextOrder("tx_categories", input.type) });
  if (error) throw error;
}

export async function updateTxCategory(id: string, values: { name?: string; color?: string | null }) {
  const { error } = await createClient()
    .from("tx_categories")
    .update({ ...values, name: values.name?.trim() })
    .eq("id", id);
  if (error) throw error;
}

/** moveTo: 이 분류의 내역·고정지출을 옮길 분류(null이면 분류 없음). 예산은 DB가 함께 지운다. */
export async function deleteTxCategory(id: string, moveTo: string | null = null) {
  const supabase = createClient();
  if (moveTo) {
    for (const table of ["transactions", "recurring_transactions"] as const) {
      const { error } = await supabase.from(table).update({ category_id: moveTo }).eq("category_id", id);
      if (error) throw error;
    }
  }
  const { error } = await supabase.from("tx_categories").delete().eq("id", id);
  if (error) throw error;
}

export async function createPaymentMethod(input: { type: PaymentMethod["type"]; name: string }) {
  const { error } = await createClient()
    .from("payment_methods")
    .insert({ ...input, name: input.name.trim(), sort_order: await nextOrder("payment_methods") });
  if (error) throw error;
}

export async function updatePaymentMethod(id: string, values: { name?: string; type?: PaymentMethod["type"] }) {
  const { error } = await createClient()
    .from("payment_methods")
    .update({ ...values, name: values.name?.trim() })
    .eq("id", id);
  if (error) throw error;
}

/** moveTo: 이 결제수단의 내역·고정지출을 옮길 결제수단(null이면 결제수단 없음) */
export async function deletePaymentMethod(id: string, moveTo: string | null = null) {
  const supabase = createClient();
  if (moveTo) {
    for (const table of ["transactions", "recurring_transactions"] as const) {
      const { error } = await supabase.from(table).update({ payment_method_id: moveTo }).eq("payment_method_id", id);
      if (error) throw error;
    }
  }
  const { error } = await supabase.from("payment_methods").delete().eq("id", id);
  if (error) throw error;
}

/** ids 순서대로 sort_order를 0부터 다시 매긴다. */
export async function reorder(table: "tx_categories" | "payment_methods", ids: string[]) {
  const supabase = createClient();
  const results = await Promise.all(ids.map((id, i) => supabase.from(table).update({ sort_order: i }).eq("id", id)));
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}

// ── 고정지출 (TX-07) ──────────────────────────────────────
// 생성은 DB 함수가 한다(supabase/migrations/20261019120000_money_recurring.sql).
// 화면을 열 때 generateRecurringTransactions(), 그 밖에는 pg_cron이 매시 10분에 만든다.

const fromRecurringInput = (input: RecurringInput) => {
  if (!isValidAmount(input.amount)) throw new Error("금액은 1원 이상의 정수여야 합니다.");
  return {
    type: input.type,
    amount: input.amount,
    day_of_month: Math.min(Math.max(Math.round(input.dayOfMonth), 1), 31),
    category_id: input.categoryId,
    payment_method_id: input.paymentMethodId,
    memo: input.title.trim(),
    active: input.active,
  };
};

export async function createRecurringTransaction(input: RecurringInput): Promise<string> {
  const { data, error } = await createClient()
    .from("recurring_transactions")
    .insert(fromRecurringInput(input))
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/**
 * 수정. 꺼 둔 고정지출을 다시 켜면 꺼 둔 동안의 회차를 몰아서 만들지 않도록
 * 생성 기준일(last_generated_on)을 resumeFrom 전날로 둔다.
 */
export async function updateRecurringTransaction(id: string, input: RecurringInput, resumeFrom?: ISODate) {
  const values: TablesUpdate<"recurring_transactions"> = fromRecurringInput(input);
  if (resumeFrom) {
    const [y, m, d] = resumeFrom.split("-").map(Number);
    values.last_generated_on = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
  }
  const { error } = await createClient().from("recurring_transactions").update(values).eq("id", id);
  if (error) throw error;
}

/** 이미 만들어진 내역은 남는다(recurring_id on delete set null). */
export async function deleteRecurringTransaction(id: string) {
  const { error } = await createClient().from("recurring_transactions").delete().eq("id", id);
  if (error) throw error;
}

/** 오늘(사용자 타임존)까지 결제일이 지난 미생성 회차를 만든다. 만든 건수 */
export async function generateRecurringTransactions(): Promise<number> {
  const { data, error } = await createClient().rpc("generate_recurring_transactions");
  if (error) throw error;
  return data ?? 0;
}

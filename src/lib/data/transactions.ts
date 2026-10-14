// 가계부 데이터 계층(내역·분류·결제수단·고정지출). 조회 함수 시그니처는 공유 계약이므로 바꾸지 않는다.
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";
import type { ISODate, PaymentMethod, RecurringTransaction, Transaction, TxCategory, TxType } from "@/lib/types";

type TxRow = Tables<"transactions"> & {
  tx_categories: { name: string } | null;
  payment_methods: { name: string } | null;
};
type RecurringRow = Tables<"recurring_transactions"> & { tx_categories: { name: string } | null };

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
  };
}

// ── 조회 ─────────────────────────────────────────────────

/** from~to(포함) 내역, 최신순 */
export async function listTransactions(from: ISODate, to: ISODate): Promise<Transaction[]> {
  const { data, error } = await createClient()
    .from("transactions")
    .select("*, tx_categories(name), payment_methods(name)")
    .gte("occurred_on", from)
    .lte("occurred_on", to)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });
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

// TODO(03): 내역 등록·수정·삭제, 필터(TX-03), 고정지출 자동 생성(TX-07)
